export type Theme = "auto" | "dark" | "light";

export function isTheme(value: unknown): value is Theme {
  return value === "auto" || value === "dark" || value === "light";
}

export function applyTheme(theme: Theme, target: Document | ShadowRoot): void {
  const root =
    target instanceof Document ? target.documentElement : target.host;
  if (!(root instanceof HTMLElement)) {
    return;
  }
  if (theme === "auto") {
    root.removeAttribute("data-theme");
    return;
  }
  root.setAttribute("data-theme", theme);
}
