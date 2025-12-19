import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flush } from "./helpers/async";
import { type ChromeStub, createChromeStub } from "./helpers/chromeStub";

type ContentRequest =
  | {
      action: "showActionOverlay";
      status: "loading" | "ready" | "error";
      mode: "text" | "event";
      source: "selection" | "page";
      title: string;
      primary?: string;
      secondary?: string;
      calendarUrl?: string;
      ics?: string;
      event?: {
        title: string;
        start: string;
        end?: string;
        allDay?: boolean;
        location?: string;
        description?: string;
      };
    }
  | {
      action: "showSummaryOverlay";
      status: "loading" | "ready" | "error";
      source: "selection" | "page";
      summary?: string;
      error?: string;
    }
  | { action: "enableTableSort" };

async function dispatchMessage(
  listener: (...args: unknown[]) => unknown,
  request: ContentRequest,
  window: Window
): Promise<void> {
  const sendResponse = vi.fn();
  listener(request, {}, sendResponse);
  await flush(window, 6);
}

describe("content overlay (React + Shadow DOM)", () => {
  let dom: JSDOM;
  let listeners: Array<(...args: unknown[]) => unknown>;
  let chromeStub: ChromeStub;

  beforeEach(() => {
    vi.resetModules();
    (
      globalThis as unknown as { __MBU_CONTENT_STATE__?: unknown }
    ).__MBU_CONTENT_STATE__ = undefined;

    dom = new JSDOM("<!doctype html><html><body></body></html>", {
      url: "https://example.com/",
    });
    listeners = [];
    chromeStub = createChromeStub({ listeners });

    Object.defineProperty(dom.window.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn(() => Promise.resolve(undefined)),
      },
    });

    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);
    vi.stubGlobal("navigator", dom.window.navigator);
    vi.stubGlobal("chrome", chromeStub);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("mounts overlay idempotently across multiple initializations", async () => {
    await import("@/content.ts");
    expect(listeners.length).toBeGreaterThan(0);

    const request: ContentRequest = {
      action: "showActionOverlay",
      status: "ready",
      mode: "text",
      source: "page",
      title: "Test",
      primary: "hello",
    };

    for (const listener of listeners) {
      await dispatchMessage(listener, request, dom.window);
    }

    expect(
      dom.window.document.querySelectorAll("#my-browser-utils-overlay").length
    ).toBe(1);

    vi.resetModules();
    await import("@/content.ts");

    for (const listener of listeners) {
      await dispatchMessage(listener, request, dom.window);
    }

    expect(
      dom.window.document.querySelectorAll("#my-browser-utils-overlay").length
    ).toBe(1);
  });

  it("shows an error toast in the shadow root when clipboard write fails", async () => {
    await import("@/content.ts");
    const [listener] = listeners;
    if (!listener) {
      throw new Error("missing message listener");
    }

    const clipboard = dom.window.navigator.clipboard as unknown as {
      writeText: ReturnType<typeof vi.fn>;
    };
    clipboard.writeText.mockRejectedValueOnce(new Error("denied"));

    await dispatchMessage(
      listener,
      {
        action: "showActionOverlay",
        status: "ready",
        mode: "text",
        source: "page",
        title: "Test",
        primary: "hello",
      },
      dom.window
    );

    const host = dom.window.document.querySelector<HTMLDivElement>(
      "#my-browser-utils-overlay"
    );
    const shadow = host?.shadowRoot ?? null;
    expect(shadow).not.toBeNull();

    const copyButton = shadow?.querySelector<HTMLButtonElement>(
      '[data-testid="overlay-copy"]'
    );
    expect(copyButton).not.toBeNull();

    copyButton?.click();
    await flush(dom.window, 6);

    expect(shadow?.textContent).toContain("コピーに失敗しました");
    expect(
      shadow?.querySelector('[data-testid="overlay-copy"]')
    ).not.toBeNull();
    expect(
      dom.window.document.querySelector("#my-browser-utils-overlay")
    ).not.toBeNull();
  });

  it("hides the copy button while overlay is loading", async () => {
    await import("@/content.ts");
    const [listener] = listeners;
    if (!listener) {
      throw new Error("missing message listener");
    }

    await dispatchMessage(
      listener,
      {
        action: "showActionOverlay",
        status: "loading",
        mode: "text",
        source: "page",
        title: "Test",
      },
      dom.window
    );

    const host = dom.window.document.querySelector<HTMLDivElement>(
      "#my-browser-utils-overlay"
    );
    const shadow = host?.shadowRoot ?? null;
    expect(shadow).not.toBeNull();

    expect(shadow?.textContent).toContain("処理中...");
    expect(shadow?.querySelector('[data-testid="overlay-copy"]')).toBeNull();
  });

  it("does not duplicate the source label in summary overlay titles", async () => {
    await import("@/content.ts");
    const [listener] = listeners;
    if (!listener) {
      throw new Error("missing message listener");
    }

    await dispatchMessage(
      listener,
      {
        action: "showSummaryOverlay",
        status: "ready",
        source: "page",
        summary: "hello",
      },
      dom.window
    );

    const host = dom.window.document.querySelector<HTMLDivElement>(
      "#my-browser-utils-overlay"
    );
    const shadow = host?.shadowRoot ?? null;
    expect(shadow).not.toBeNull();

    expect(shadow?.textContent).toContain("要約");
    expect(shadow?.textContent).toContain("ページ本文");
    expect(shadow?.textContent).not.toContain("要約（ページ本文）");
    expect(shadow?.textContent).not.toContain("要約（選択範囲）");
  });

  it("renders event overlay with table + quote, hides link-copy, and keeps pin next to close", async () => {
    await import("@/content.ts");
    const [listener] = listeners;
    if (!listener) {
      throw new Error("missing message listener");
    }

    await dispatchMessage(
      listener,
      {
        action: "showActionOverlay",
        status: "ready",
        mode: "event",
        source: "selection",
        title: "カレンダー登録する（選択範囲）",
        primary: "タイトル: test",
        secondary: "選択範囲:\n引用テキスト",
        calendarUrl: "https://calendar.google.com/",
        ics: "BEGIN:VCALENDAR\nEND:VCALENDAR",
        event: {
          title: "ゆず コンサート",
          start: "2026-05-04T16:00:00+09:00",
          end: "2026-05-04T19:00:00+09:00",
          location: "宮城・セキスイハイムスーパーアリーナ",
          description: "概要テキスト",
        },
      },
      dom.window
    );

    const host = dom.window.document.querySelector<HTMLDivElement>(
      "#my-browser-utils-overlay"
    );
    const shadow = host?.shadowRoot ?? null;
    expect(shadow).not.toBeNull();

    expect(shadow?.textContent).toContain("ゆず コンサート");
    expect(shadow?.textContent).toContain(
      "宮城・セキスイハイムスーパーアリーナ"
    );
    expect(shadow?.textContent).toContain("概要テキスト");

    const table = shadow?.querySelector("table");
    expect(table).not.toBeNull();

    const quote = shadow?.querySelector<HTMLElement>(".mbu-overlay-quote");
    expect(quote).not.toBeNull();
    expect(quote?.textContent).toContain("引用テキスト");

    const hasLinkCopyButton = Array.from(
      shadow?.querySelectorAll("button") ?? []
    ).some((btn) => btn.textContent?.includes("リンクコピー"));
    expect(hasLinkCopyButton).toBe(false);

    const actions = shadow?.querySelector<HTMLElement>(".mbu-overlay-actions");
    expect(actions).not.toBeNull();

    expect(actions?.querySelector('[data-testid="overlay-copy"]')).toBeNull();

    const bodyActions = shadow?.querySelector<HTMLElement>(
      ".mbu-overlay-body-actions"
    );
    expect(bodyActions).not.toBeNull();
    expect(
      bodyActions?.querySelector('[data-testid="overlay-copy"]')
    ).not.toBeNull();
    expect(bodyActions?.textContent).toContain(".ics");

    const pin = shadow?.querySelector<HTMLElement>(
      '[data-testid="overlay-pin"]'
    );
    const close = shadow?.querySelector<HTMLElement>(
      '[data-testid="overlay-close"]'
    );
    expect(pin).not.toBeNull();
    expect(close).not.toBeNull();
    const buttons = Array.from(actions?.querySelectorAll("button") ?? []);
    const pinIndex = buttons.indexOf(pin as HTMLButtonElement);
    const closeIndex = buttons.indexOf(close as HTMLButtonElement);
    expect(pinIndex).toBeGreaterThan(-1);
    expect(closeIndex).toBeGreaterThan(-1);
    expect(pinIndex).toBe(closeIndex - 1);

    expect(shadow?.textContent).not.toContain("（選択範囲）");
    expect(shadow?.textContent).toContain("選択範囲");
  });

  it("renders selection text as an auxiliary collapsed section in text mode", async () => {
    await import("@/content.ts");
    const [listener] = listeners;
    if (!listener) {
      throw new Error("missing message listener");
    }

    await dispatchMessage(
      listener,
      {
        action: "showActionOverlay",
        status: "ready",
        mode: "text",
        source: "selection",
        title: "要約（選択範囲）",
        primary: "結果テキスト",
        secondary: "選択範囲:\n引用テキスト",
      },
      dom.window
    );

    const host = dom.window.document.querySelector<HTMLDivElement>(
      "#my-browser-utils-overlay"
    );
    const shadow = host?.shadowRoot ?? null;
    expect(shadow).not.toBeNull();

    const aux = shadow?.querySelector<HTMLElement>(".mbu-overlay-aux");
    expect(aux).not.toBeNull();
    expect(
      shadow?.querySelector(".mbu-overlay-aux-summary")?.textContent
    ).toContain("選択したテキスト");

    const quote = shadow?.querySelector<HTMLElement>(".mbu-overlay-quote");
    expect(quote).not.toBeNull();
    expect(quote?.textContent).toContain("引用テキスト");

    const secondary = shadow?.querySelector<HTMLElement>(
      ".mbu-overlay-secondary-text"
    );
    expect(secondary?.textContent ?? "").not.toContain("引用テキスト");
  });
});
