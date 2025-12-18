# Structure Steering: My Browser Utils

## High-level Organization
- Root contains extension assets (`manifest.json`, `popup.html`, CSS, icons/images).
- `popup_bootstrap.js` loads the bundled popup script (`dist/popup.js`) and shows a clear banner when build output is missing (dev ergonomics).
- `src/` contains TypeScript source for each runtime surface (background/content/popup) plus shared utilities.
- `src/` is intentionally modular: shared helpers live under `src/utils/` and small feature helpers can live under feature folders like `src/popup/`.
- `dist/` is generated build output (bundled JS); it is treated as an artifact, not a source of truth.
- `tests/` contains Vitest unit tests with a `jsdom` environment.

## Entry Points & Responsibilities
- `src/background.ts`: background service worker
  - Owns context menu setup/refresh and OpenAI requests.
  - Bridges requests between popup/content and privileged APIs.
- `src/content.ts`: content script injected into pages
  - Implements table sorting + MutationObserver-based auto-detection.
  - Hosts in-page overlays (uses Shadow DOM to avoid page CSS conflicts).
  - Responds to background/popup messages.
- `src/popup.ts`: popup controller
  - Manages settings (patterns, toggles, OpenAI token/prompt) and custom action definitions.
  - Can send one-off commands to the active tab (e.g., “enable table sort now”).

## Common Code Patterns
- Content/popup source code is wrapped in an IIFE to avoid leaking globals into the page/popup scope; background runs in the service worker global scope.
- Runtime message passing uses small, discriminated unions (`{ action: '...' }`) for safety and testability.
- Storage access is wrapped behind small helper functions (`storageSyncGet/Set`, `storageLocalGet/Set`), typically defined per runtime file, to:
  - Normalize callback APIs into Promises
  - Handle missing APIs in non-extension contexts (tests)
  - Surface `lastError` reliably
- Where direct exports are awkward (e.g., content-script internals), tests may opt-in to a small `globalThis.__MBU_TEST_HOOKS__` surface to reach specific helpers without changing production APIs.
- Cross-cutting features prefer “thin shared modules” (e.g. OpenAI fetch/JSON parsing/date handling) rather than large shared frameworks.

## Naming & Conventions
- Prefer clear, typed “request/response” message shapes over ad-hoc `any` messages.
- Keep UI text and default prompts Japanese-first for consistency with current UX.
- When adding new utilities, keep them self-contained and attached to one runtime boundary (content/background/popup) unless there’s a clear shared need.
