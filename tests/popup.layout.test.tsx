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

describe("popup layout structure", () => {
  let dom: JSDOM;

  beforeEach(() => {
    vi.resetModules();
    dom = createPopupDom("file:///popup.html#pane-actions");
    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);
    vi.stubGlobal("navigator", dom.window.navigator);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the hero logo column before the title text (prevents narrow title wrapping)", async () => {
    const rootEl = dom.window.document.getElementById("root");
    if (!rootEl) {
      throw new Error("missing #root");
    }

    const root = createRoot(rootEl);
    await act(async () => {
      root.render(<PopupApp />);
      await flush(dom.window);
    });

    const titleBlock =
      dom.window.document.querySelector<HTMLDivElement>(".title-block");
    expect(titleBlock).not.toBeNull();
    const children = Array.from(titleBlock?.children ?? []);
    expect(children[0]?.classList.contains("hero-logo-wrap")).toBe(true);
    expect(children[1]?.classList.contains("title-text")).toBe(true);

    act(() => {
      root.unmount();
    });
  });

  it("styles sidebar tabs using the nav-item structure (icon + label)", async () => {
    const rootEl = dom.window.document.getElementById("root");
    if (!rootEl) {
      throw new Error("missing #root");
    }

    const root = createRoot(rootEl);
    await act(async () => {
      root.render(<PopupApp />);
      await flush(dom.window);
    });

    const tabButtons = Array.from(
      dom.window.document.querySelectorAll<HTMLElement>(
        'aside.sidebar [role="tab"]'
      )
    );
    expect(tabButtons.length).toBe(4);

    for (const tab of tabButtons) {
      expect(tab.classList.contains("nav-item")).toBe(true);
      expect(tab.querySelector(".nav-icon")).not.toBeNull();
      expect(tab.querySelector(".nav-label")).not.toBeNull();
    }

    act(() => {
      root.unmount();
    });
  });
});
