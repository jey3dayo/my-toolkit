import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flush } from "./helpers/async";
import { type ChromeStub, createChromeStub } from "./helpers/chromeStub";

describe("background: context menu", () => {
  let chromeStub: ChromeStub;

  beforeEach(() => {
    vi.resetModules();
    chromeStub = createChromeStub();
    vi.stubGlobal("chrome", chromeStub);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("adds copy title/link item under root menu", async () => {
    await import("@/background.ts");
    await flush(setTimeout, 10);

    const created = chromeStub.contextMenus.create.mock.calls.map(
      (call) => call[0] as Record<string, unknown>
    );

    expect(
      created.some(
        (item) =>
          item.id === "mbu-copy-title-link" &&
          item.parentId === "mbu-root" &&
          item.title === "タイトルとリンクをコピー"
      )
    ).toBe(true);
  });
});
