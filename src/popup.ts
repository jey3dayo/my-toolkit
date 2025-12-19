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
  const start = (): void => {
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

    createRoot(rootEl).render(createElement(PopupApp));
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
