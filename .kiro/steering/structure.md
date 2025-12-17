# Structure Steering: My Browser Utils

## High-level Organization
- Root contains extension assets (`manifest.json`, `popup.html`, CSS, icons/images).
- `src/` contains TypeScript source for each runtime surface (background/content/popup) plus shared utilities.
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
- Each entry point is structured as an IIFE to avoid leaking globals into the page/popup scope.
- Runtime message passing uses small, discriminated unions (`{ action: '...' }`) for safety and testability.
- Storage access is centralized behind helper functions (`storageSyncGet/Set`, `storageLocalGet/Set`) to:
  - Normalize callback APIs into Promises
  - Handle missing APIs in non-extension contexts (tests)
  - Surface `lastError` reliably

## Naming & Conventions
- Prefer clear, typed “request/response” message shapes over ad-hoc `any` messages.
- Keep UI text and default prompts Japanese-first for consistency with current UX.
- When adding new utilities, keep them self-contained and attached to one runtime boundary (content/background/popup) unless there’s a clear shared need.

