import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dirname =
  typeof __dirname !== "undefined"
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(dirname, "..");

type WebAccessibleEntry = { resources?: string[] };
type Manifest = { web_accessible_resources?: WebAccessibleEntry[] };

const SHADOW_UI_STYLESHEETS = [
  "src/styles/tokens/primitives.css",
  "src/styles/tokens/semantic.css",
  "src/styles/tokens/components.css",
] as const;

const POPUP_UI_STYLESHEETS = [
  "src/styles/base.css",
  "src/styles/layout.css",
  "src/styles/utilities.css",
] as const;

describe("UI styles wiring", () => {
  it("lists ShadowRoot styles as web_accessible_resources", () => {
    const manifestPath = path.join(projectRoot, "manifest.json");
    const manifest = JSON.parse(
      fs.readFileSync(manifestPath, "utf8")
    ) as Manifest;

    const resources = new Set(
      (manifest.web_accessible_resources ?? []).flatMap(
        (entry) => entry.resources ?? []
      )
    );

    for (const cssPath of SHADOW_UI_STYLESHEETS) {
      expect(resources).toContain(cssPath);
    }
  });

  it("keeps stylesheet assets present on disk", () => {
    for (const cssPath of [...SHADOW_UI_STYLESHEETS, ...POPUP_UI_STYLESHEETS]) {
      expect(fs.existsSync(path.join(projectRoot, cssPath))).toBe(true);
    }
  });
});
