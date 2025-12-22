import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { StorybookConfig } from "@storybook/react-vite";
import type { Plugin } from "vite";

const dirname =
  typeof __dirname !== "undefined"
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(dirname, "../src");
const tomlAsText = (): Plugin => ({
  name: "toml-as-text",
  enforce: "pre",
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
const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  addons: [
    "@chromatic-com/storybook",
    "@storybook/addon-vitest",
    "@storybook/addon-a11y",
    "@storybook/addon-docs",
  ],
  framework: "@storybook/react-vite",
  staticDirs: [
    { from: "../icons", to: "/icons" },
    { from: "../images", to: "/images" },
  ],
  viteFinal(viteConfig) {
    const plugins: Plugin[] = [];
    if (Array.isArray(viteConfig.plugins)) {
      plugins.push(...viteConfig.plugins);
    } else if (viteConfig.plugins) {
      plugins.push(viteConfig.plugins);
    }
    viteConfig.plugins = [...plugins, tomlAsText()];

    viteConfig.resolve ??= {};
    const alias = viteConfig.resolve.alias;
    if (Array.isArray(alias)) {
      const existing = alias.find((entry) => entry.find === "@");
      if (existing) {
        existing.replacement = srcDir;
      } else {
        alias.push({ find: "@", replacement: srcDir });
      }
    } else {
      viteConfig.resolve.alias = { ...(alias ?? {}), "@": srcDir };
    }

    viteConfig.optimizeDeps ??= {};
    const include = Array.isArray(viteConfig.optimizeDeps.include)
      ? viteConfig.optimizeDeps.include
      : [];
    viteConfig.optimizeDeps.include = Array.from(
      new Set([
        ...include,
        "date-fns",
        "react-dom",
        "react-dom/client",
        "@base-ui/react/button",
        "@base-ui/react/field",
        "@base-ui/react/form",
        "@base-ui/react/fieldset",
        "@base-ui/react/input",
        "@base-ui/react/radio",
        "@base-ui/react/radio-group",
        "@base-ui/react/toast",
      ])
    );
    return viteConfig;
  },
};
export default config;
