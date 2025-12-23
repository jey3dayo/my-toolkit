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

describe("popup Actions pane: event output", () => {
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
                id: "custom:event",
                title: "イベント抽出",
                kind: "event",
                prompt: "",
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
            resultType: "event",
            eventText: "予定: ミーティング",
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

    Object.defineProperty(dom.window.URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:mbu-test"),
    });
    Object.defineProperty(dom.window.URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    vi.stubGlobal("URL", dom.window.URL);

    await act(async () => {
      await import("@/popup.ts");
      await flush(dom.window);
    });
  });

  afterEach(() => {
    cleanupPopupTestHooks();
    vi.unstubAllGlobals();
  });

  it("does not render calendar actions for event outputs", async () => {
    const runButton = dom.window.document.querySelector<HTMLButtonElement>(
      'button[data-action-id="custom:event"]'
    );
    await act(async () => {
      runButton?.click();
      await flush(dom.window);
    });

    expect(
      dom.window.document.querySelector('[data-testid="open-calendar"]')
    ).toBeNull();
    expect(
      dom.window.document.querySelector('[data-testid="download-ics"]')
    ).toBeNull();
  });
});
