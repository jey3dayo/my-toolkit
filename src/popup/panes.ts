export const PANE_IDS = [
  "pane-actions",
  "pane-table",
  "pane-create-link",
  "pane-settings",
] as const;
export type PaneId = (typeof PANE_IDS)[number];

const HASH_PREFIX_REGEX = /^#/;

export function coercePaneId(value: unknown): PaneId {
  return PANE_IDS.includes(value as PaneId)
    ? (value as PaneId)
    : "pane-actions";
}

export function getPaneIdFromHash(hash: string): PaneId | null {
  const value = hash.replace(HASH_PREFIX_REGEX, "");
  return PANE_IDS.includes(value as PaneId) ? (value as PaneId) : null;
}
