// @vitest-environment node

import { build } from "esbuild";
import { describe, expect, it } from "vitest";

describe("React/Base UI bundling", () => {
  it("defines process.env.NODE_ENV in the bundle script", async () => {
    const { default: fs } = await import("node:fs/promises");
    const { default: path } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const pkg = JSON.parse(
      await fs.readFile(new URL("../package.json", import.meta.url), "utf-8")
    ) as {
      scripts?: Record<string, string>;
    };

    const bundleScript = pkg.scripts?.bundle ?? "";
    if (bundleScript.includes("scripts/bundle.mjs")) {
      const scriptPath = path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "..",
        "scripts",
        "bundle.mjs"
      );
      const scriptContents = await fs.readFile(scriptPath, "utf-8");
      expect(scriptContents).toContain("process.env.NODE_ENV");
    } else {
      expect(bundleScript).toContain("--define:process.env.NODE_ENV=");
    }
  });

  it("bundles React, ReactDOM, and @base-ui/react for MV3 targets", async () => {
    const result = await build({
      stdin: {
        contents: [
          "import * as React from 'react';",
          "import { createRoot } from 'react-dom/client';",
          "import { Tabs } from '@base-ui/react';",
          "",
          "const el = React.createElement('div', null, 'ok');",
          "void el;",
          "void Tabs;",
          'void createRoot(document.createElement("div"));',
        ].join("\n"),
        resolveDir: process.cwd(),
        sourcefile: "ui-entry.ts",
      },
      bundle: true,
      define: {
        "process.env.NODE_ENV": '"production"',
      },
      format: "iife",
      outfile: "out.js",
      platform: "browser",
      target: "es2020",
      write: false,
    });

    const output = result.outputFiles?.[0]?.text ?? "";
    expect(output).not.toContain("process.env.NODE_ENV");
  });
});
