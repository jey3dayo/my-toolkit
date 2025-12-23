type PopupTestHooks = {
  unmount?: () => void;
};

export function registerPopupTestHooks(): void {
  const existing = (
    globalThis as unknown as { __MBU_TEST_HOOKS__?: PopupTestHooks }
  ).__MBU_TEST_HOOKS__;
  if (existing) {
    return;
  }
  (
    globalThis as unknown as { __MBU_TEST_HOOKS__?: PopupTestHooks }
  ).__MBU_TEST_HOOKS__ = {};
}

export function cleanupPopupTestHooks(): void {
  const hooks = (
    globalThis as unknown as { __MBU_TEST_HOOKS__?: PopupTestHooks }
  ).__MBU_TEST_HOOKS__;
  if (!hooks) {
    return;
  }
  if (typeof hooks.unmount === "function") {
    hooks.unmount();
  }
  delete hooks.unmount;
}
