const FALLBACK_APP_NAME = "Browser Toolkit";

export function resolveAppName(): string {
  try {
    if (typeof chrome !== "undefined") {
      const name = chrome.runtime?.getManifest?.().name;
      if (typeof name === "string") {
        const trimmed = name.trim();
        if (trimmed) {
          return trimmed;
        }
      }
    }
  } catch {
    // no-op
  }

  return FALLBACK_APP_NAME;
}

export const APP_NAME = resolveAppName();
