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
import {
  cleanupPopupTestHooks,
  registerPopupTestHooks,
} from "./helpers/popupTestHooks";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("popup Actions pane: editor", () => {
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
                id: "custom:one",
                title: "テスト",
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
      (_message: unknown, callback: (resp: unknown) => void) => {
        chromeStub.runtime.lastError = null;
        callback({ ok: true });
      }
    );

    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);
    vi.stubGlobal("navigator", dom.window.navigator);
    vi.stubGlobal("chrome", chromeStub);
    registerPopupTestHooks();

    await act(async () => {
      await import("@/popup.ts");
      await flush(dom.window);
    });
  });

  afterEach(() => {
    cleanupPopupTestHooks();
    vi.unstubAllGlobals();
  });

  it("creates a new action and persists to sync storage", async () => {
    const title = dom.window.document.querySelector<HTMLInputElement>(
      '[data-testid="action-editor-title"]'
    );
    const prompt = dom.window.document.querySelector<HTMLTextAreaElement>(
      '[data-testid="action-editor-prompt"]'
    );
    const save = dom.window.document.querySelector<HTMLButtonElement>(
      '[data-testid="action-editor-save"]'
    );

    expect(title).not.toBeNull();
    expect(prompt).not.toBeNull();
    expect(save).not.toBeNull();

    await act(async () => {
      inputValue(dom.window, title as HTMLInputElement, "カスタム");
      inputValue(dom.window, prompt as HTMLTextAreaElement, "{{text}}");
      save?.click();
      await flush(dom.window);
    });

    const setCalls = chromeStub.storage.sync.set.mock.calls;
    expect(setCalls.length).toBeGreaterThan(0);
    expect(setCalls.at(-1)?.[0]).toEqual(
      expect.objectContaining({
        contextActions: expect.arrayContaining([
          expect.objectContaining({ title: "カスタム", kind: "text" }),
        ]),
      })
    );

    expect(dom.window.document.body.textContent).toContain("カスタム");
  });

  it("edits an existing action and persists changes", async () => {
    const selector = dom.window.document.querySelector<HTMLButtonElement>(
      '[data-testid="action-editor-select"]'
    );
    const title = dom.window.document.querySelector<HTMLInputElement>(
      '[data-testid="action-editor-title"]'
    );
    const save = dom.window.document.querySelector<HTMLButtonElement>(
      '[data-testid="action-editor-save"]'
    );

    expect(selector).not.toBeNull();
    expect(title).not.toBeNull();

    await act(async () => {
      await selectBaseUiOption(
        dom.window,
        selector as HTMLButtonElement,
        "テスト"
      );
      inputValue(dom.window, title as HTMLInputElement, "テスト更新");
      save?.click();
      await flush(dom.window);
    });

    expect(chromeStub.storage.sync.set).toHaveBeenCalledWith(
      expect.objectContaining({
        contextActions: expect.arrayContaining([
          expect.objectContaining({ id: "custom:one", title: "テスト更新" }),
        ]),
      }),
      expect.any(Function)
    );

    const button = dom.window.document.querySelector(
      'button[data-action-id="custom:one"]'
    );
    expect(button?.textContent).toContain("テスト更新");
  });

  it("deletes an existing action and removes it from the list", async () => {
    const selector = dom.window.document.querySelector<HTMLButtonElement>(
      '[data-testid="action-editor-select"]'
    );
    const deleteButton = dom.window.document.querySelector<HTMLButtonElement>(
      '[data-testid="action-editor-delete"]'
    );

    expect(selector).not.toBeNull();
    expect(deleteButton).not.toBeNull();

    await act(async () => {
      await selectBaseUiOption(
        dom.window,
        selector as HTMLButtonElement,
        "テスト"
      );
      deleteButton?.click();
      await flush(dom.window);
    });

    const button = dom.window.document.querySelector(
      'button[data-action-id="custom:one"]'
    );
    expect(button).toBeNull();
  });

  it("resets actions to defaults and persists them", async () => {
    const resetButton = dom.window.document.querySelector<HTMLButtonElement>(
      '[data-testid="action-editor-reset"]'
    );
    expect(resetButton).not.toBeNull();

    await act(async () => {
      resetButton?.click();
      await flush(dom.window);
    });

    expect(chromeStub.storage.sync.set).toHaveBeenCalledWith(
      expect.objectContaining({ contextActions: expect.any(Array) }),
      expect.any(Function)
    );

    expect(dom.window.document.body.textContent).toContain("要約");
  });
});
