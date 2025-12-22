import type { Theme } from "@/ui/theme";

const THEME_SEQUENCE: Theme[] = ["auto", "light", "dark"];
const THEME_LABELS: Record<Theme, string> = {
  auto: "自動",
  light: "ライト",
  dark: "ダーク",
};

export function themeLabel(theme: Theme): string {
  return THEME_LABELS[theme];
}

export function nextTheme(theme: Theme): Theme {
  const index = THEME_SEQUENCE.indexOf(theme);
  const nextIndex = index >= 0 ? (index + 1) % THEME_SEQUENCE.length : 0;
  return THEME_SEQUENCE[nextIndex] ?? "auto";
}

export function themeButtonLabel(theme: Theme): string {
  const next = nextTheme(theme);
  return `テーマ: ${themeLabel(theme)}（クリックで${themeLabel(next)}へ）`;
}
