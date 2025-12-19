import type { JSDOM } from "jsdom";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flush } from "./helpers/async";
import { inputValue, selectBaseUiOption } from "./helpers/forms";
import {
  createPopupChromeStub,
  type PopupChromeStub,
} from "./helpers/popupChromeStub";
import { createPopupDom } from "./helpers/popupDom";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("popup Settings pane", () => {
  let dom: JSDOM;
  let chromeStub: PopupChromeStub;

  beforeEach(async () => {
    vi.resetModules();

    dom = createPopupDom("chrome-extension://test/popup.html#pane-settings");
    chromeStub = createPopupChromeStub();

    chromeStub.storage.local.get.mockImplementation(
      (keys: string[], callback: (items: unknown) => void) => {
        chromeStub.runtime.lastError = null;
        const keyList = Array.isArray(keys) ? keys : [String(keys)];
        const items: Record<string, unknown> = {};
        if (keyList.includes("openaiApiToken")) {
          items.openaiApiToken = "sk-existing";
        }
        if (keyList.includes("openaiCustomPrompt")) {
          items.openaiCustomPrompt = "prompt";
        }
        if (keyList.includes("openaiModel")) {
          items.openaiModel = "gpt-4o";
        }
        callback(items);
      }
    );

    chromeStub.runtime.sendMessage.mockImplementation(
      (message: unknown, callback: (resp: unknown) => void) => {
        chromeStub.runtime.lastError = null;
        const action = (message as { action?: unknown }).action;
        if (action === "testOpenAiToken") {
          callback({ ok: true });
          return;
        }
        callback({ ok: true });
      }
    );

    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);
    vi.stubGlobal("navigator", dom.window.navigator);
    vi.stubGlobal("chrome", chromeStub);

    await act(async () => {
      await import("@/popup.ts");
      await flush(dom.window);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("toggles token visibility without changing the token value", async () => {
    const token = dom.window.document.querySelector<HTMLInputElement>(
      '[data-testid="openai-token"]'
    );
    const toggle = dom.window.document.querySelector<HTMLButtonElement>(
      '[data-testid="token-visible"]'
    );
    expect(token).not.toBeNull();
    expect(toggle).not.toBeNull();

    expect(token?.type).toBe("password");
    expect(token?.value).toBe("sk-existing");

    await act(async () => {
      toggle?.click();
      await flush(dom.window);
    });

    expect(token?.type).toBe("text");
    expect(token?.value).toBe("sk-existing");
  });

  it("saves and clears the token using local storage", async () => {
    const token = dom.window.document.querySelector<HTMLInputElement>(
      '[data-testid="openai-token"]'
    );
    const save = dom.window.document.querySelector<HTMLButtonElement>(
      '[data-testid="token-save"]'
    );
    const clear = dom.window.document.querySelector<HTMLButtonElement>(
      '[data-testid="token-clear"]'
    );

    await act(async () => {
      inputValue(dom.window, token as HTMLInputElement, "sk-new");
      save?.click();
      await flush(dom.window);
    });

    expect(chromeStub.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({ openaiApiToken: "sk-new" }),
      expect.any(Function)
    );

    await act(async () => {
      clear?.click();
      await flush(dom.window);
    });

    expect(chromeStub.storage.local.remove).toHaveBeenCalledWith(
      "openaiApiToken",
      expect.any(Function)
    );
  });

  it("tests the token via background messaging and shows feedback", async () => {
    const testButton = dom.window.document.querySelector<HTMLButtonElement>(
      '[data-testid="token-test"]'
    );
    expect(testButton).not.toBeNull();

    await act(async () => {
      testButton?.click();
      await flush(dom.window);
    });

    expect(chromeStub.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ action: "testOpenAiToken" }),
      expect.any(Function)
    );
    expect(dom.window.document.body.textContent).toContain("トークン");
  });

  it("saves and clears the custom prompt using local storage", async () => {
    const prompt = dom.window.document.querySelector<HTMLTextAreaElement>(
      '[data-testid="custom-prompt"]'
    );
    const save = dom.window.document.querySelector<HTMLButtonElement>(
      '[data-testid="prompt-save"]'
    );
    const clear = dom.window.document.querySelector<HTMLButtonElement>(
      '[data-testid="prompt-clear"]'
    );

    await act(async () => {
      inputValue(dom.window, prompt as HTMLTextAreaElement, "custom prompt");
      save?.click();
      await flush(dom.window);
    });

    expect(chromeStub.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({ openaiCustomPrompt: "custom prompt" }),
      expect.any(Function)
    );

    await act(async () => {
      clear?.click();
      await flush(dom.window);
    });

    expect(chromeStub.storage.local.remove).toHaveBeenCalledWith(
      "openaiCustomPrompt",
      expect.any(Function)
    );
  });

  it("saves the selected model using local storage", async () => {
    const modelSelect = dom.window.document.querySelector<HTMLButtonElement>(
      '[data-testid="openai-model"]'
    );
    const save = dom.window.document.querySelector<HTMLButtonElement>(
      '[data-testid="model-save"]'
    );
    expect(modelSelect).not.toBeNull();
    expect(save).not.toBeNull();

    expect(modelSelect?.textContent).toContain("gpt-4o");

    await act(async () => {
      await selectBaseUiOption(
        dom.window,
        modelSelect as HTMLButtonElement,
        "gpt-4o-mini"
      );
      save?.click();
      await flush(dom.window);
    });

    expect(chromeStub.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({ openaiModel: "gpt-4o-mini" }),
      expect.any(Function)
    );
  });
});
