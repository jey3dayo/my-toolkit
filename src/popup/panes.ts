export const PANE_IDS = ['pane-actions', 'pane-table', 'pane-settings'] as const;
export type PaneId = (typeof PANE_IDS)[number];

export function coercePaneId(value: unknown): PaneId {
  return PANE_IDS.includes(value as PaneId) ? (value as PaneId) : 'pane-actions';
}

export function getPaneIdFromHash(hash: string): PaneId | null {
  const value = hash.replace(/^#/, '');
  return PANE_IDS.includes(value as PaneId) ? (value as PaneId) : null;
}
