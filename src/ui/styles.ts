const STYLE_ID = 'mbu-ui-base-styles';
const POPUP_STYLE_ID = 'mbu-ui-popup-overrides';

const BASE_CSS = `
:root {
  --mbu-bg: #0f1724;
  --mbu-surface: #1b2334;
  --mbu-surface-2: #232d42;
  --mbu-border: rgba(255, 255, 255, 0.12);
  --mbu-text: #f6f7fb;
  --mbu-text-muted: #c8d0e5;
  --mbu-accent: #3ecf8e;
  --mbu-danger: #e57373;
  --mbu-radius: 14px;
  --mbu-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
  --mbu-focus-ring: 2px solid rgba(123, 220, 247, 0.55);
  --mbu-focus-ring-offset: 2px;
  color-scheme: dark;
}

:host {
  --mbu-bg: #ffffff;
  --mbu-surface: #ffffff;
  --mbu-surface-2: #f3f4f6;
  --mbu-border: rgba(0, 0, 0, 0.12);
  --mbu-text: #111827;
  --mbu-text-muted: rgba(17, 24, 39, 0.7);
  --mbu-accent: #4285f4;
  --mbu-danger: #e53935;
  --mbu-radius: 14px;
  --mbu-shadow: 0 16px 44px rgba(0, 0, 0, 0.28);
  --mbu-focus-ring: 2px solid rgba(66, 133, 244, 0.65);
  --mbu-focus-ring-offset: 2px;
  color-scheme: light;
}

:where(a, button, input, textarea, select, [role='button'], [tabindex]):focus-visible {
  outline: var(--mbu-focus-ring);
  outline-offset: var(--mbu-focus-ring-offset);
}

.mbu-surface {
  isolation: isolate;
}

.mbu-toast-viewport {
  position: fixed;
  top: 12px;
  right: 12px;
  z-index: 2147483647;
  display: flex;
  flex-direction: column;
  gap: 10px;
  pointer-events: none;
}

.mbu-toast-positioner {
  pointer-events: none;
}

.mbu-toast-root {
  pointer-events: auto;
  min-width: 220px;
  max-width: min(360px, calc(100vw - 24px));
  border: 1px solid var(--mbu-border);
  border-radius: var(--mbu-radius);
  background: var(--mbu-surface);
  color: var(--mbu-text);
  box-shadow: var(--mbu-shadow);
  overflow: hidden;
}

.mbu-toast-root[data-type='success'] {
  border-color: color-mix(in oklab, var(--mbu-accent) 55%, var(--mbu-border));
}

.mbu-toast-root[data-type='error'] {
  border-color: color-mix(in oklab, var(--mbu-danger) 55%, var(--mbu-border));
}

.mbu-toast-content {
  padding: 10px 12px;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  align-items: start;
}

.mbu-toast-title {
  font-weight: 750;
  font-size: 13px;
  line-height: 1.35;
}

.mbu-toast-description {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--mbu-text-muted);
}

.mbu-toast-close {
  appearance: none;
  border: 1px solid var(--mbu-border);
  background: color-mix(in oklab, var(--mbu-surface-2) 90%, transparent);
  color: var(--mbu-text);
  border-radius: 10px;
  padding: 6px 8px;
  cursor: pointer;
}
`;

export function ensurePopupUiBaseStyles(doc: Document): void {
  if (!doc.getElementById(STYLE_ID)) {
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = BASE_CSS;
    (doc.head ?? doc.documentElement).appendChild(style);
  }

  if (doc.getElementById(POPUP_STYLE_ID)) return;
  const popupOverrides = doc.createElement('style');
  popupOverrides.id = POPUP_STYLE_ID;
  popupOverrides.textContent = `
  body { position: relative; }
  .mbu-toast-viewport {
    position: fixed;
    top: 12px;
    right: 12px;
  }
  `;
  (doc.head ?? doc.documentElement).appendChild(popupOverrides);
}

export function ensureShadowUiBaseStyles(shadowRoot: ShadowRoot): void {
  if (shadowRoot.querySelector(`#${STYLE_ID}`)) return;
  const style = shadowRoot.ownerDocument.createElement('style');
  style.id = STYLE_ID;
  style.textContent = BASE_CSS;
  shadowRoot.appendChild(style);
}
