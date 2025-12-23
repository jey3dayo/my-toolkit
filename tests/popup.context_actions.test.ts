import type { JSDOM } from "jsdom";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flush } from "./helpers/async";
import {
  createPopupChromeStub,
  type PopupChromeStub,
} from "./helpers/popupChromeStub";
import { createPopupDom } from "./helpers/popupDom";
import {
  cleanupPopupTestHooks,
  registerPopupTestHooks,
} from "./helpers/popupTestHooks";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("popup context actions (React UI)", () => {
  let dom: JSDOM;
  let chromeStub: PopupChromeStub;

  beforeEach(async () => {
    vi.resetModules();

    dom = createPopupDom();
    chromeStub = createPopupChromeStub();

    chromeStub.storage.sync.get.mockImplementation(
      (keys: string[], callback: (items: unknown) => void) => {
        chromeStub.runtime.lastError = null;
        const keyList = Array.isArray(keys) ? keys : [String(keys)];
        if (keyList.includes("contextActions")) {
          callback({
            contextActions: [
              {
                id: "builtin:summarize",
                title: "要約",
                kind: "text",
                prompt: "{{text}}",
              },
            ],
          });
          return;
        }
        callback({});
      }
    );

    chromeStub.storage.local.get.mockImplementation(
      (keys: string[], callback: (items: unknown) => void) => {
        chromeStub.runtime.lastError = null;
        const keyList = Array.isArray(keys) ? keys : [String(keys)];
        if (keyList.includes("openaiApiToken")) {
          callback({ openaiApiToken: "sk-test" });
          return;
        }
        callback({});
      }
    );

    chromeStub.tabs.query.mockImplementation(
      (_queryInfo: unknown, callback: (tabs: unknown[]) => void) => {
        chromeStub.runtime.lastError = null;
        callback([{ id: 1 }]);
      }
    );

    chromeStub.runtime.sendMessage.mockImplementation(
      (message: unknown, callback: (resp: unknown) => void) => {
        chromeStub.runtime.lastError = null;
        const action = (message as { action?: unknown }).action;
        if (action === "runContextAction") {
          callback({
            ok: true,
            resultType: "text",
            text: "summary",
            source: "selection",
          });
          return;
        }
        callback({ ok: true });
      }
    );

    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);
    vi.stubGlobal("navigator", dom.window.navigator);
    vi.stubGlobal("chrome", chromeStub);
    registerPopupTestHooks();

    Object.defineProperty(dom.window.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn(async () => undefined),
      },
    });

    await act(async () => {
      await import("@/popup.ts");
      await flush(dom.window);
    });
  });

  afterEach(() => {
    cleanupPopupTestHooks();
    vi.unstubAllGlobals();
  });

  it("runs builtin:summarize and renders the result + source", async () => {
    const button = dom.window.document.querySelector<HTMLButtonElement>(
      'button[data-action-id="builtin:summarize"]'
    );
    expect(button?.textContent).toContain("要約");

    await act(async () => {
      button?.click();
      await flush(dom.window);
    });

    const output = dom.window.document.querySelector<HTMLTextAreaElement>(
      '[data-testid="action-output"]'
    );
    expect(output?.value).toBe("summary");

    const source = dom.window.document.querySelector(
      '[data-testid="action-source"]'
    );
    expect(source?.textContent).toBe("選択範囲");

    expect(chromeStub.runtime.sendMessage).toHaveBeenCalled();
  });

  it("renders template variable hints", () => {
    const hints = dom.window.document.querySelector(
      '[data-testid="template-vars"]'
    );
    expect(hints?.textContent).toContain("{{text}}");
    expect(hints?.textContent).toContain("{{title}}");
    expect(hints?.textContent).toContain("{{url}}");
    expect(hints?.textContent).toContain("{{source}}");
  });

  it("copies output text to clipboard and shows a success toast", async () => {
    const button = dom.window.document.querySelector<HTMLButtonElement>(
      'button[data-action-id="builtin:summarize"]'
    );
    await act(async () => {
      button?.click();
      await flush(dom.window);
    });

    const copyButton = dom.window.document.querySelector<HTMLButtonElement>(
      '[data-testid="copy-output"]'
    );
    expect(copyButton).not.toBeNull();

    await act(async () => {
      copyButton?.click();
      await flush(dom.window);
    });

    const clipboard = dom.window.navigator.clipboard as unknown as {
      writeText: ReturnType<typeof vi.fn>;
    };
    expect(clipboard.writeText).toHaveBeenCalledWith("summary");
    expect(dom.window.document.body.textContent).toContain("コピーしました");
  });

  it("shows an error toast when clipboard write fails and keeps output intact", async () => {
    const clipboard = dom.window.navigator.clipboard as unknown as {
      writeText: ReturnType<typeof vi.fn>;
    };
    clipboard.writeText.mockRejectedValueOnce(new Error("denied"));

    const button = dom.window.document.querySelector<HTMLButtonElement>(
      'button[data-action-id="builtin:summarize"]'
    );
    await act(async () => {
      button?.click();
      await flush(dom.window);
    });

    const output = dom.window.document.querySelector<HTMLTextAreaElement>(
      '[data-testid="action-output"]'
    );
    expect(output?.value).toBe("summary");

    const copyButton = dom.window.document.querySelector<HTMLButtonElement>(
      '[data-testid="copy-output"]'
    );
    await act(async () => {
      copyButton?.click();
      await flush(dom.window);
    });

    expect(dom.window.document.body.textContent).toContain(
      "コピーに失敗しました"
    );
    expect(output?.value).toBe("summary");
  });

  it("does not crash when background returns an invalid response", async () => {
    chromeStub.runtime.sendMessage.mockImplementationOnce(
      (_message: unknown, callback: (resp: unknown) => void) => {
        chromeStub.runtime.lastError = null;
        callback(undefined);
      }
    );

    const button = dom.window.document.querySelector<HTMLButtonElement>(
      'button[data-action-id="builtin:summarize"]'
    );
    await act(async () => {
      button?.click();
      await flush(dom.window);
    });

    const output = dom.window.document.querySelector<HTMLTextAreaElement>(
      '[data-testid="action-output"]'
    );
    expect(output?.value).toBe("");
  });
});
