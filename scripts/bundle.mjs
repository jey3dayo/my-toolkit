import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";

const RAW_QUERY_REGEX = /\?raw$/;
const ANY_FILE_REGEX = /.*/;

const isWatch = process.argv.includes("--watch");
const projectRoot = process.cwd();
const stylesSrc = path.join(projectRoot, "src/styles");
const stylesDest = path.join(projectRoot, "dist/styles");

const cssRawPlugin = {
  name: "css-raw",
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: RAW_QUERY_REGEX }, async (args) => {
      const withoutQuery = args.path.replace(RAW_QUERY_REGEX, "");
      const resolved = await pluginBuild.resolve(withoutQuery, {
        resolveDir: args.resolveDir,
        kind: args.kind,
      });
      if (resolved.errors.length > 0) {
        return { errors: resolved.errors };
      }
      return {
        path: resolved.path,
        namespace: "css-raw",
      };
    });

    pluginBuild.onLoad(
      { filter: ANY_FILE_REGEX, namespace: "css-raw" },
      async (args) => {
        const contents = await fsp.readFile(args.path, "utf8");
        return { contents, loader: "text" };
      }
    );
  },
};

async function copyStyles() {
  await fsp.mkdir(stylesDest, { recursive: true });
  await fsp.cp(stylesSrc, stylesDest, { recursive: true });
}

function watchStyles() {
  let timeout;
  const scheduleCopy = () => {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      copyStyles().catch((error) => {
        console.error("[styles] copy failed", error);
      });
    }, 50);
  };

  const watcher = fs.watch(stylesSrc, { recursive: true }, (_, filename) => {
    if (typeof filename === "string" && !filename.endsWith(".css")) {
      return;
    }
    scheduleCopy();
  });

  watcher.on("error", (error) => {
    console.error("[styles] watch failed", error);
  });
}

const buildOptions = {
  entryPoints: ["src/background.ts", "src/content.ts", "src/popup.ts"],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  alias: {
    "@": "./src",
  },
  define: {
    "process.env.NODE_ENV": '"production"',
  },
  loader: {
    ".toml": "text",
    ".css": "css",
  },
  outdir: "dist",
  sourcemap: true,
  plugins: [cssRawPlugin],
};

try {
  if (isWatch) {
    await copyStyles();
    watchStyles();
    await build({
      ...buildOptions,
      watch: {
        onRebuild(error) {
          if (error) {
            console.error("[esbuild] rebuild failed", error);
          } else {
            console.log("[esbuild] rebuild succeeded");
          }
        },
      },
    });
  } else {
    await build(buildOptions);
  }
} catch (error) {
  console.error(error);
  process.exit(1);
}
