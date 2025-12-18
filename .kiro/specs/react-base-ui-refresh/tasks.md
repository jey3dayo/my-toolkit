# Implementation Tasks: react-base-ui-refresh

> Note: `.kiro/settings/templates/specs/tasks.md` and `.kiro/settings/rules/*tasks*.md` were not found in this repository. This document uses a structured fallback format while following the spec constraints (2 levels max, numeric requirement IDs, optional `(P)` markers).

## 1. Prepare build and tooling for React + Base UI
Requirements: 2,12
- [x] 1.1 Add React, React DOM, and `@base-ui/react` dependencies and confirm they bundle for MV3 extension targets.
- [x] 1.2 Update TypeScript configuration to typecheck TSX and React usage without weakening `strict` type safety.
- [x] 1.3 Update linting and test tooling to recognize TSX/React files and keep existing quality gates runnable.

## 2. (P) Establish shared UI foundations (styling, portals, notifications)
Requirements: 2,9,13
- [x] 2.1 Define a minimal design-token set (CSS variables) and focus-visible styling for both popup and overlay surfaces.
- [x] 2.2 Define a portal strategy that keeps overlayed UI inside its surface (popup document vs overlay ShadowRoot) and maintains predictable stacking.
- [x] 2.3 Introduce a user-notification abstraction backed by Base UI Toast so popup/overlay can surface success/error states consistently.

## 3. (P) Migrate the popup entry to React while preserving layout intent
Requirements: 1,2,3,13
- [x] 3.1 Replace the popup’s UI rendering with a React root while keeping `popup_bootstrap.js` and the manifest load path intact.
- [x] 3.2 Implement the 3-pane navigation using Base UI Tabs with URL-hash synchronization for parity with current behavior.
- [x] 3.3 Implement the menu drawer using Base UI Dialog to preserve scrim/Escape close behavior and improve focus management.

## 4. (P) Implement the popup “Actions” pane (run actions, results, editor)
Requirements: 4,5,7,11,13
- [x] 4.1 Load and render context actions from sync storage with normalization and defaults; present template variable hints.
- [x] 4.2 Execute actions via background messaging and render results with source indicator; handle invalid/empty responses without crashing.
- [x] 4.3 Provide output actions (copy, open calendar link, download `.ics` where applicable) with clear success/error notifications.
- [x] 4.4 Provide action editor capabilities (create/edit/delete/save/reset) and persist changes to sync storage.

## 5. (P) Implement the popup “Table Sort” pane (enable + automation)
Requirements: 6,10,11
- [x] 5.1 Provide “enable table sort on this tab” behavior by sending the appropriate command to the active tab and surfacing completion feedback.
- [x] 5.2 Provide “auto enable sort” preference management persisted in sync storage.
- [x] 5.3 Provide URL pattern add/remove and list rendering with protocol-ignored matching and `*` wildcard support.

## 6. (P) Implement the popup “Settings” pane (token + custom prompt)
Requirements: 7,11,13
- [x] 6.1 Provide OpenAI token save/clear behavior using local storage only, including a token visibility toggle that does not change stored values.
- [x] 6.2 Provide token test behavior via the background service worker and display actionable success/error feedback.
- [x] 6.3 Provide custom prompt save/clear behavior using local storage only and ensure it is used by background OpenAI calls.
- [x] 6.4 Ensure missing-token flows guide the user to Settings and focus the token input when an AI action is attempted.

## 7. (P) Introduce a React overlay mounted in Shadow DOM (idempotent)
Requirements: 2,8,9,10,11
- [x] 7.1 Introduce a React overlay mounted inside a ShadowRoot and keep table-sort logic intact.
- [x] 7.2 Add robust idempotency guards so multiple initializations never create more than one overlay root.
- [x] 7.3 Preserve selection-caching behavior (fresh ~30s) for action input fallback and keep it local-only.

## 8. (P) Implement the overlay UI behavior (actions, positioning, portals)
Requirements: 8,9,13
- [x] 8.1 Render overlay states for loading/ready/error for both text and event modes, preserving the current layout intent.
- [x] 8.2 Provide overlay actions (copy text, open calendar link, copy calendar link, close) with success/error notifications.
- [x] 8.3 Preserve anchor-based positioning for selection results and provide pin/drag behavior with viewport clamping.
- [x] 8.4 Ensure all Base UI portal-based subtrees (toasts, dialogs/popovers/tooltips if used) render inside the ShadowRoot container.

## 9. (P) Update and extend automated tests for the React UI
Requirements: 3,4,7,9,12
- [x] 9.1 Update popup navigation tests to assert pane switching and drawer open/close behaviors with the new React UI.
- [x] 9.2 Update context-action tests to assert safe handling of invalid background responses and correct rendering of outputs/source indicators.
- [x] 9.3 Add or update tests to cover clipboard failure handling for UI-triggered copy actions.
- [x] 9.4 Add a test that verifies overlay injection/mounting is idempotent (no double mount).

## 10. Final validation (quality gates + manual Chrome checks)
Requirements: 1,12,13
- [x] 10.1 Run `pnpm run build`, `pnpm run lint`, and `pnpm test` and fix regressions introduced by the UI migration.
- [ ] 10.2 Load the extension in Chrome and verify critical flows: pane switching, actions execution, token guard, table sort enable/auto-enable, overlay display and interaction.
- [ ] 10.3 Validate keyboard navigation and accessibility semantics for popup and overlay (focus indicators, Escape-to-close behavior, labeled controls).
