import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flush } from "./helpers/async";
import { type ChromeStub, createChromeStub } from "./helpers/chromeStub";

describe("background: OpenAI model selection", () => {
  let listeners: Array<(...args: unknown[]) => unknown>;
  let chromeStub: ChromeStub;

  beforeEach(() => {
    vi.resetModules();
    listeners = [];
    chromeStub = createChromeStub({ listeners });

    chromeStub.storage.local.get.mockImplementation(
      (keys: string[], callback: (items: unknown) => void) => {
        chromeStub.runtime.lastError = null;
        const keyList = Array.isArray(keys) ? keys : [String(keys)];
        const items: Record<string, unknown> = {};
        if (keyList.includes("openaiApiToken")) {
          items.openaiApiToken = "sk-test";
        }
        if (keyList.includes("openaiCustomPrompt")) {
          items.openaiCustomPrompt = "";
        }
        if (keyList.includes("openaiModel")) {
          items.openaiModel = "gpt-4o";
        }
        callback(items);
      }
    );

    vi.stubGlobal("chrome", chromeStub);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses openaiModel from local storage in chat completion requests", async () => {
    let capturedModel: string | null = null;

    const fetchSpy = vi.fn((_url: string, options?: unknown) => {
      const body =
        typeof (options as { body?: unknown })?.body === "string"
          ? (options as { body: string }).body
          : "";
      capturedModel = (JSON.parse(body) as { model?: string }).model ?? null;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ choices: [{ message: { content: "ok" } }] }),
      } as unknown);
    });

    vi.stubGlobal("fetch", fetchSpy as unknown as typeof fetch);

    await import("@/background.ts");

    const [listener] = listeners;
    if (!listener) {
      throw new Error("missing runtime.onMessage listener");
    }

    const sendResponse = vi.fn();
    listener(
      {
        action: "summarizeText",
        target: { text: "hello", source: "page", title: "t", url: "u" },
      },
      {},
      sendResponse
    );

    await flush(setTimeout, 6);
    expect(capturedModel).toBe("gpt-4o");
  });
});
