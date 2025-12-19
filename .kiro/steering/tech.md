# Tech Steering: My Browser Utils

## Platform

- Chrome Extension (Manifest V3): background service worker + content script + popup page.
- UI is React (popup + in-page overlays/toasts) with Base UI primitives (`@base-ui/react`), while keeping the extension runtime lightweight.

## Language & Build

- TypeScript with `strict` enabled.
- `tsconfig` uses modern ESM + `moduleResolution: bundler` (and `jsx: react-jsx`) to align with `esbuild`.
- Imports use the `@/` alias for `src/` (TypeScript `paths`, `esbuild --alias`, and Vitest `resolve.alias`) to keep code consistent across runtimes/tests.
- Bundling via `esbuild` into `dist/`:
  - Entry points are bundled as browser-friendly IIFEs.
  - Target is modern browsers (`ES2020`) with sourcemaps.
- Package manager is `pnpm` (scripts and CI assume `pnpm run ...`); keep local tooling and CI Node/pnpm versions aligned (pinned via `engines` / `packageManager`).

## Runtime Boundaries (important for design)

- **Content script** runs in the page context: DOM access, overlays, table sorting.
- **Background service worker** owns privileged APIs: context menus, OpenAI fetch calls, storage orchestration.
- **Popup** is the settings/control surface: saves preferences, manages custom actions, can trigger behaviors on the active tab.

## Storage & Configuration

- `chrome.storage.sync`: user preferences that can roam (domain patterns, action definitions, toggles).
- `chrome.storage.local`: device-local data (OpenAI API token, OpenAI model/prompt, theme, recent-selection cache).
- Wrapper helpers convert callback-based Chrome APIs to Promises and surface `chrome.runtime.lastError` as real errors.

## OpenAI Integration (design constraints)

- Uses OpenAI Chat Completions over HTTPS from the background worker.
- Token is loaded from local storage at call time; calls fail with actionable errors when missing.
- Input text is clipped to a safe maximum before sending; prompts are deterministic-ish (low temperature) to keep output consistent.
- Model is configurable, with a single default used across the extension.
- “Event” actions request structured JSON output and validate/normalize it before generating calendar handoff artifacts (URL / `.ics`).

## Error Handling Style

- Prefer typed results over throwing for async flows (use `@praha/byethrow` `Result` / `ResultAsync`, plus `{ ok: true/false }` response unions at message boundaries).
- UI surfaces errors as notifications/overlays, not console-only.

## Quality Gates

- Tests: `vitest` (unit `jsdom`) + Storybook tests (Vitest browser + Playwright) to keep UI behavior/a11y from drifting.
- Formatting: Ultracite (Biome) with single quotes and wider line width.
- Linting: Ultracite (Biome) ruleset, with Chrome extension globals configured.
- Prefer running `mise run ci` locally to mirror GitHub Actions (format + lint + tests + storybook tests + build).
- CI: GitHub Actions runs lint + unit tests + storybook tests on push/PR to catch drift early.
