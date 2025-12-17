# Tech Steering: My Browser Utils

## Platform
- Chrome Extension (Manifest V3): background service worker + content script + popup page.
- No framework runtime (plain DOM/TypeScript); UI is HTML/CSS with TypeScript behavior.

## Language & Build
- TypeScript with `strict` enabled.
- Bundling via `esbuild` into `dist/`:
  - Entry points are bundled as browser-friendly IIFEs.
  - Target is modern browsers (`ES2020`) with sourcemaps.

## Runtime Boundaries (important for design)
- **Content script** runs in the page context: DOM access, overlays, table sorting.
- **Background service worker** owns privileged APIs: context menus, OpenAI fetch calls, storage orchestration.
- **Popup** is the settings/control surface: saves preferences, manages custom actions, can trigger behaviors on the active tab.

## Storage & Configuration
- `chrome.storage.sync`: user preferences that can roam (domain patterns, action definitions, toggles).
- `chrome.storage.local`: device-local secrets (OpenAI API token, prompt customizations).
- Wrapper helpers convert callback-based Chrome APIs to Promises and surface `chrome.runtime.lastError` as real errors.

## OpenAI Integration (design constraints)
- Uses OpenAI Chat Completions over HTTPS from the background worker.
- Token is loaded from local storage at call time; calls fail with actionable errors when missing.
- Input text is clipped to a safe maximum before sending; prompts are deterministic-ish (low temperature) to keep output consistent.

## Error Handling Style
- Prefer typed results over throwing for async flows (use `@praha/byethrow` `Result` / `ResultAsync`, plus `{ ok: true/false }` response unions at message boundaries).
- UI surfaces errors as notifications/overlays, not console-only.

## Quality Gates
- Tests: `vitest` with `jsdom`; tests stub the `chrome` global.
- Formatting: Prettier (single quotes, wider line width) with import sorting.
- Linting: ESLint (flat config) with TypeScript rules and import sorting conventions.
