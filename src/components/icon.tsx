import { Copy, Link, type LucideProps, MapPin, Menu, Settings, Table, X, Zap } from 'lucide-react';

export type IconName = 'close' | 'copy' | 'link' | 'menu' | 'pin' | 'settings' | 'table' | 'zap';

const icons: Record<IconName, React.ComponentType<LucideProps>> = {
  close: X,
  copy: Copy,
  link: Link,
  menu: Menu,
  pin: MapPin,
  settings: Settings,
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
