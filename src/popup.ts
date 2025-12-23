import { Result } from "@praha/byethrow";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { PopupApp } from "@/popup/App";
import { createPopupRuntime } from "@/popup/runtime";
import { ensurePopupUiBaseStyles } from "@/ui/styles";
import { applyTheme, isTheme } from "@/ui/theme";

async function initTheme(): Promise<void> {
  const runtime = createPopupRuntime();
  const result = await runtime.storageLocalGet(["theme"]);
  if (Result.isFailure(result)) {
    applyTheme("auto", document);
    return;
  }
  const { theme } = result.value;
  applyTheme(isTheme(theme) ? theme : "auto", document);
}

(() => {
  type PopupTestHooks = {
    unmount?: () => void;
  };

  const testHooks = (
    globalThis as unknown as { __MBU_TEST_HOOKS__?: PopupTestHooks }
  ).__MBU_TEST_HOOKS__;

  let root: ReturnType<typeof createRoot> | null = null;
  let started = false;

  const start = (): void => {
    if (started) {
      return;
    }
    started = true;
    ensurePopupUiBaseStyles(document);
    applyTheme("auto", document);
    initTheme().catch(() => {
      // no-op
    });

    const isExtensionPage = window.location.protocol === "chrome-extension:";
    if (isExtensionPage) {
      document.body.classList.add("is-extension");
    }

    const rootEl = document.getElementById("root");
    if (!rootEl) {
      throw new Error("Missing #root element in popup.html");
    }

    root = createRoot(rootEl);
    root.render(createElement(PopupApp));
  };

  const unmount = (): void => {
    if (!started) {
      document.removeEventListener("DOMContentLoaded", start);
      return;
    }
    root?.unmount();
    root = null;
  };

  if (testHooks) {
    testHooks.unmount = unmount;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
