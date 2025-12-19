import type { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PopupApp } from "@/popup/App";
import { flush } from "./helpers/async";
import { createPopupDom } from "./helpers/popupDom";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("popup navigation (React + Base UI Tabs)", () => {
  let dom: JSDOM;

  beforeEach(() => {
    vi.resetModules();

    dom = createPopupDom("chrome-extension://test/popup.html#pane-settings");
    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);
    vi.stubGlobal("navigator", dom.window.navigator);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("derives initial tab from location.hash", async () => {
    const rootEl = dom.window.document.getElementById("root");
    if (!rootEl) {
      throw new Error("missing #root");
    }

    const root = createRoot(rootEl);
    await act(async () => {
      root.render(<PopupApp />);
      await flush(dom.window);
    });

    expect(dom.window.location.hash).toBe("#pane-settings");
    expect(
      dom.window.document.querySelector('[data-pane="pane-settings"]')
    ).not.toBeNull();
    expect(
      dom.window.document.querySelector('[data-pane="pane-actions"]')
    ).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("switches tabs and synchronizes hash", async () => {
    const rootEl = dom.window.document.getElementById("root");
    if (!rootEl) {
      throw new Error("missing #root");
    }

    const root = createRoot(rootEl);
    await act(async () => {
      root.render(<PopupApp />);
      await flush(dom.window);
    });

    const tableTab = dom.window.document.querySelector<HTMLButtonElement>(
      '[role="tab"][data-value="pane-table"]'
    );
    await act(async () => {
      tableTab?.click();
      await flush(dom.window);
    });

    expect(dom.window.location.hash).toBe("#pane-table");
    expect(
      dom.window.document.querySelector('[data-pane="pane-table"]')
    ).not.toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("opens and closes the menu drawer (scrim + Escape)", async () => {
    const rootEl = dom.window.document.getElementById("root");
    if (!rootEl) {
      throw new Error("missing #root");
    }

    const root = createRoot(rootEl);
    await act(async () => {
      root.render(<PopupApp />);
      await flush(dom.window);
    });

    const openButton = dom.window.document.querySelector<HTMLButtonElement>(
      'button[aria-label="メニュー"]'
    );
    await act(async () => {
      openButton?.click();
      await flush(dom.window);
    });

    expect(dom.window.document.querySelector('[role="dialog"]')).not.toBeNull();

    const backdrop = dom.window.document.querySelector<HTMLElement>(
      ".mbu-drawer-backdrop"
    );
    await act(async () => {
      backdrop?.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
      await flush(dom.window);
    });

    expect(dom.window.document.querySelector('[role="dialog"]')).toBeNull();

    await act(async () => {
      openButton?.click();
      await flush(dom.window);
    });
    expect(dom.window.document.querySelector('[role="dialog"]')).not.toBeNull();

    await act(async () => {
      dom.window.document.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
        })
      );
      await flush(dom.window);
    });
    expect(dom.window.document.querySelector('[role="dialog"]')).toBeNull();

    act(() => {
      root.unmount();
    });
  });
});
