import {
  Calendar,
  Copy,
  Link,
  type LucideProps,
  Menu,
  Monitor,
  Moon,
  Pin,
  Settings,
  Sun,
  Table,
  X,
  Zap,
} from "lucide-react";

export type IconName =
  | "calendar"
  | "close"
  | "copy"
  | "link"
  | "menu"
  | "monitor"
  | "moon"
  | "pin"
  | "settings"
  | "sun"
  | "table"
  | "zap";

const icons: Record<IconName, React.ComponentType<LucideProps>> = {
  calendar: Calendar,
  close: X,
  copy: Copy,
  link: Link,
  menu: Menu,
  monitor: Monitor,
  moon: Moon,
  pin: Pin,
  settings: Settings,
  sun: Sun,
  table: Table,
  zap: Zap,
};

export type IconProps = LucideProps & {
  name: IconName;
};

export function Icon({ name, ...props }: IconProps): React.JSX.Element {
  const Component = icons[name];
  return <Component {...props} />;
}
