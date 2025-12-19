import path from "node:path";
import { fileURLToPath } from "node:url";
import type { StorybookConfig } from "@storybook/react-vite";

const dirname =
  typeof __dirname !== "undefined"
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(dirname, "../src");
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
  async viteFinal(config) {
    config.resolve ??= {};
    const alias = config.resolve.alias;
    if (Array.isArray(alias)) {
      const existing = alias.find((entry) => entry.find === "@");
      if (existing) {
        existing.replacement = srcDir;
      } else {
        alias.push({ find: "@", replacement: srcDir });
      }
    } else {
      config.resolve.alias = { ...(alias ?? {}), "@": srcDir };
    }

    config.optimizeDeps ??= {};
    const include = Array.isArray(config.optimizeDeps.include)
      ? config.optimizeDeps.include
      : [];
    config.optimizeDeps.include = Array.from(
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
    return config;
  },
};
export default config;
