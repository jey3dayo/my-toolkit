# Style Management (Design Tokens)

This project manages UI styling via **Design Tokens** (CSS custom properties) and a `data-theme` attribute for runtime theme switching.

The same token system is used for:

- The extension popup (document-level CSS)
- ShadowRoot UIs injected by the content script (overlay + toasts)

## Token Layers

The token system is structured in 3 layers:

1. **Primitive tokens** (`src/styles/tokens/primitives.css`)
   - Physical values (palette, spacing, radii, shadows, typography)
2. **Semantic tokens** (`src/styles/tokens/semantic.css`)
   - Meaning-based values (surface/text/border/primary/etc), theme-aware
3. **Component tokens** (`src/styles/tokens/components.css`)
   - Component-specific values (button/input/card tokens) and shared component styles (toast/overlay)

## Theme Switching (`data-theme`)

Theme switching is done via `data-theme="dark" | "light"`.

Additionally, when `data-theme` is **absent**, the UI follows the system theme via `prefers-color-scheme` (Auto).

- Popup: applied to `document.documentElement`
- ShadowRoot: applied to `shadowRoot.host`

Implementation:

- `src/ui/theme.ts` exports `applyTheme()` and `Theme`
- `src/popup.ts` loads the stored theme (defaults to `auto`) and applies it at startup
- `src/popup/panes/SettingsPane.tsx` provides an Auto/Dark/Light selector and persists it to `chrome.storage.local`
- `src/content.ts` loads the stored theme (defaults to `auto`) and applies it to injected ShadowRoot surfaces (overlay + toasts)

## Stylesheet Layout

Popup styles are split by responsibility:

- `src/styles/base.css`: document base (reset + base variables that depend on layout)
- `src/styles/layout.css`: popup layout (app shell, sidebar, drawer, header)
- `src/styles/utilities.css`: small utility classes (`.stack`, `.row-between`, etc)

Shared component styles (used by both popup and ShadowRoot) live in:

- `src/styles/tokens/components.css`

## ShadowRoot Integration

ShadowRoot UIs load the same token/stylesheets via:

- `src/ui/styles.ts` (`ensureShadowUiBaseStyles`)

This attaches `<link rel="stylesheet">` tags to the ShadowRoot so the overlay/toast UI remains CSP-friendly and consistent with the popup theme/tokens.

## Legacy Alias Variables

`src/styles/tokens/semantic.css` still exposes a small set of legacy aliases (e.g. `--bg`, `--panel`, `--text`, and `--mbu-*`) to keep incremental refactors stable while migrating older styles.
