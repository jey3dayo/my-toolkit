import { describe, expect, it } from "vitest";
import { nextTheme, themeButtonLabel, themeLabel } from "@/ui/themeCycle";

describe("themeCycle", () => {
  it("cycles themes in a stable order", () => {
    expect(nextTheme("auto")).toBe("light");
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme("dark")).toBe("auto");
  });

  it("returns localized labels", () => {
    expect(themeLabel("auto")).toBe("自動");
    expect(themeLabel("light")).toBe("ライト");
    expect(themeLabel("dark")).toBe("ダーク");
  });

  it("builds button labels with next hint", () => {
    expect(themeButtonLabel("auto")).toContain("自動");
    expect(themeButtonLabel("auto")).toContain("ライト");
    expect(themeButtonLabel("light")).toContain("ダーク");
    expect(themeButtonLabel("dark")).toContain("自動");
  });
});
