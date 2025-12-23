import { Button } from "@base-ui/react/button";
import { Icon, type IconName } from "@/components/icon";
import type { Theme } from "@/ui/theme";
import { themeButtonLabel } from "@/ui/themeCycle";

const THEME_ICONS: Record<Theme, IconName> = {
  auto: "monitor",
  light: "sun",
  dark: "moon",
};

type Props = {
  theme: Theme;
  onToggle: () => void;
  className?: string;
  testId?: string;
  active?: boolean;
  describedById?: string;
};

export function ThemeCycleButton({
  theme,
  onToggle,
  className,
  testId,
  active,
  describedById,
}: Props): React.JSX.Element {
  const label = themeButtonLabel(theme);
  const isActive = active ?? theme !== "auto";

  return (
    <Button
      aria-describedby={describedById}
      aria-label={label}
      className={className}
      data-active={isActive ? "true" : undefined}
      data-testid={testId}
      onClick={onToggle}
      title={label}
      type="button"
    >
      <Icon aria-hidden="true" name={THEME_ICONS[theme]} />
    </Button>
  );
}
