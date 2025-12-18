export type Theme = 'dark' | 'light';

export function isTheme(value: unknown): value is Theme {
  return value === 'dark' || value === 'light';
}

export function applyTheme(theme: Theme, target: Document | ShadowRoot): void {
  const root = target instanceof Document ? target.documentElement : target.host;
  if (!(root instanceof HTMLElement)) return;
  root.setAttribute('data-theme', theme);
}
