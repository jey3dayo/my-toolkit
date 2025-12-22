import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

const dirname =
  typeof __dirname !== "undefined"
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));
const alias = { "@": path.join(dirname, "src") };

const tomlAsText = () => ({
  name: "toml-as-text",
  enforce: "pre",
  resolveId(source: string) {
    if (source.endsWith(".toml")) {
      return source;
    }
    return null;
  },
  load(id: string) {
    if (!id.endsWith(".toml")) {
      return null;
    }
    const code = fs.readFileSync(id, "utf8");
    return {
      code: `export default ${JSON.stringify(code)};`,
      map: null,
    };
  },
});

export default defineConfig({
  plugins: [tomlAsText()],
  resolve: {
    alias,
  },
  test: {
    projects: [
      {
        resolve: {
          alias,
        },
        plugins: [tomlAsText()],
        test: {
          name: "unit",
          environment: "jsdom",
          include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
          clearMocks: true,
        },
      },
      {
        resolve: {
          alias,
        },
        plugins: [
          tomlAsText(),
          storybookTest({
            configDir: path.join(dirname, ".storybook"),
            storybookScript: "pnpm storybook --no-open --port 6006",
          }),
        ],
        test: {
          name: "storybook",
          browser: {
            enabled: true,
            provider: playwright({}),
            headless: true,
            instances: [{ browser: "chromium" }],
          },
          setupFiles: [".storybook/vitest.setup.ts"],
        },
      },
    ],
  },
});
