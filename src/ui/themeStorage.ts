import { isTheme, type Theme } from "@/ui/theme";

export function normalizeTheme(value: unknown): Theme {
  return isTheme(value) ? value : "auto";
}

export function themeFromHost(host: HTMLElement | null): Theme {
  if (!host) {
    return "auto";
  }
  return normalizeTheme(host.getAttribute("data-theme"));
}

export function loadStoredTheme(fallback: Theme): Promise<Theme> {
  if (typeof chrome === "undefined") {
    return Promise.resolve(fallback);
  }
  const storage = chrome.storage?.local;
  if (!storage) {
    return Promise.resolve(fallback);
  }
  return new Promise((resolve) => {
    storage.get(["theme"], (items) => {
      const err = chrome.runtime?.lastError;
      if (err) {
        resolve(fallback);
        return;
      }
      const data = items as { theme?: unknown };
      resolve(normalizeTheme(data.theme));
    });
  });
}

export function persistTheme(theme: Theme): Promise<void> {
  if (typeof chrome === "undefined") {
    return Promise.resolve();
  }
  const storage = chrome.storage?.local;
  if (!storage) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    storage.set({ theme }, () => {
      resolve();
    });
  });
}
