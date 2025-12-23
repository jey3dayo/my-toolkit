export function replaceHashSafely(window: Window, nextHash: string): void {
  try {
    if (window.location.hash === nextHash) {
      return;
    }
    window.history.replaceState(null, "", nextHash);
  } catch {
    window.location.hash = nextHash;
  }
}
