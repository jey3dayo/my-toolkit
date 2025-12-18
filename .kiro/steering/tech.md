# Tech Steering: My Browser Utils

## Platform
- Chrome Extension (Manifest V3): background service worker + content script + popup page.
- No framework runtime (plain DOM/TypeScript); UI is HTML/CSS with TypeScript behavior.

## Language & Build
- TypeScript with `strict` enabled.
- `tsconfig` uses modern ESM + `moduleResolution: bundler` to align with `esbuild`.
- Bundling via `esbuild` into `dist/`:
  - Entry points are bundled as browser-friendly IIFEs.
  - Target is modern browsers (`ES2020`) with sourcemaps.
- Package manager is `pnpm` (scripts and CI assume `pnpm run ...`); keep local tooling and CI Node/pnpm versions aligned.

## Runtime Boundaries (important for design)
- **Content script** runs in the page context: DOM access, overlays, table sorting.
- **Background service worker** owns privileged APIs: context menus, OpenAI fetch calls, storage orchestration.
- **Popup** is the settings/control surface: saves preferences, manages custom actions, can trigger behaviors on the active tab.

## Storage & Configuration
- `chrome.storage.sync`: user preferences that can roam (domain patterns, action definitions, toggles).
- `chrome.storage.local`: device-local secrets (OpenAI API token, prompt customizations).
- `chrome.storage.local` is also used for UX helpers (e.g., a timestamped recent-selection cache used for ~30s to make context-menu actions reliable).
- Wrapper helpers convert callback-based Chrome APIs to Promises and surface `chrome.runtime.lastError` as real errors.

## OpenAI Integration (design constraints)
- Uses OpenAI Chat Completions over HTTPS from the background worker.
- Token is loaded from local storage at call time; calls fail with actionable errors when missing.
- Input text is clipped to a safe maximum before sending; prompts are deterministic-ish (low temperature) to keep output consistent.
- “Event” actions request structured JSON output and validate/normalize it before generating calendar handoff artifacts (URL / `.ics`).

## Error Handling Style
- Prefer typed results over throwing for async flows (use `@praha/byethrow` `Result` / `ResultAsync`, plus `{ ok: true/false }` response unions at message boundaries).
- UI surfaces errors as notifications/overlays, not console-only.

## Quality Gates
- Tests: `vitest` with `jsdom`; tests stub the `chrome` global.
- Formatting: Ultracite (Biome) with single quotes and wider line width.
- Linting: Ultracite (Biome) ruleset, with Chrome extension globals configured.
- CI: GitHub Actions runs lint + tests on push/PR to catch drift early.
