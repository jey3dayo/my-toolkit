import { afterEach, describe, expect, it, vi } from "vitest";
import { ensurePopupUiBaseStyles, ensureShadowUiBaseStyles } from "@/ui/styles";

describe("UI base styles", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("injects popup base styles once", () => {
    ensurePopupUiBaseStyles(document);
    expect(document.getElementById("mbu-ui-base-styles")).not.toBeNull();
    expect(document.getElementById("mbu-style-base")).not.toBeNull();
    expect(document.getElementById("mbu-style-layout")).not.toBeNull();
    expect(document.getElementById("mbu-style-utilities")).not.toBeNull();

    const before = document.querySelectorAll("#mbu-ui-base-styles").length;
    ensurePopupUiBaseStyles(document);
    const after = document.querySelectorAll("#mbu-ui-base-styles").length;
    expect(after).toBe(before);
  });

  it("injects shadow-root base styles once", () => {
    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "open" });

    ensureShadowUiBaseStyles(shadow);
    expect(shadow.querySelector("#mbu-ui-base-styles")).not.toBeNull();

    const before = shadow.querySelectorAll("#mbu-ui-base-styles").length;
    ensureShadowUiBaseStyles(shadow);
    const after = shadow.querySelectorAll("#mbu-ui-base-styles").length;
    expect(after).toBe(before);
  });

  it("uses chrome.runtime.getURL for href resolution when available", () => {
    vi.stubGlobal("chrome", {
      runtime: {
        getURL: (input: string) => `chrome-extension://test/${input}`,
      },
    });

    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "open" });
    ensureShadowUiBaseStyles(shadow);

    expect(
      shadow
        .querySelector<HTMLLinkElement>("#mbu-ui-token-primitives")
        ?.getAttribute("href")
    ).toBe("chrome-extension://test/src/styles/tokens/primitives.css");
    expect(
      shadow
        .querySelector<HTMLLinkElement>("#mbu-ui-token-semantic")
        ?.getAttribute("href")
    ).toBe("chrome-extension://test/src/styles/tokens/semantic.css");
    expect(
      shadow
        .querySelector<HTMLLinkElement>("#mbu-ui-base-styles")
        ?.getAttribute("href")
    ).toBe("chrome-extension://test/src/styles/tokens/components.css");
  });
});
