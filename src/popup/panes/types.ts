import type { Notifier } from '../../ui/toast';
import type { PopupRuntime } from '../runtime';

export type PopupPaneBaseProps = {
  runtime: PopupRuntime;
  notify: Notifier;
};
