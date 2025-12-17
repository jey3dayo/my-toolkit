# Research Log: react-base-ui-refresh

## Summary
This feature refreshes the extension’s **Popup UI** and **in-page overlay UI** by re-implementing the UI layer with **React** and **Base UI (`@base-ui/react`)**, while preserving existing behaviors, runtime boundaries (popup/content/background), and storage/message contracts.

## Discovery Type
**Light discovery (extension / integration-focused)**: verify Base UI capabilities required by the existing extension constraints (Shadow DOM, portals, a11y), and map current codebase integration points (popup/content/background messaging, storage, overlay injection, table sorting).

## Sources (primary)
- Base UI Quick Start (portal + layering guidance): https://base-ui.com/react/overview/quick-start
- Base UI Styling guide (unstyled primitives + styling approach): https://base-ui.com/react/overview/styling
- Base UI Portal API (supports `ShadowRoot` as `container`): https://base-ui.com/react/utils/portal
- Base UI Dialog API (focus + portal container): https://base-ui.com/react/components/dialog
- Base UI Tabs API (accessible tab semantics): https://base-ui.com/react/components/tabs
- Base UI Toast API (notifications + `toastManager`): https://base-ui.com/react/components/toast
- Base UI Releases (package naming / stability cues): https://github.com/mui/base-ui/releases

## Findings

### 1) Base UI is compatible with Shadow DOM and portal scoping
- Base UI provides a `Portal` utility whose `container` prop supports **`HTMLElement | DocumentFragment`**; the Quick Start explicitly calls out that this includes **`ShadowRoot`**.
- Individual components that portal (e.g., `Dialog.Portal`, `Toast.Portal`) also expose a `container` prop, allowing portals to remain inside the desired subtree.

**Implication**: For the content-script overlay mounted in Shadow DOM, Base UI portalled subtrees (dialogs/popovers/toasts/tooltips) can be forced to render within the ShadowRoot rather than `document.body`, preventing styling/z-index surprises and host-page CSS interference.

### 2) Layering guidance: isolate a root stacking context
Base UI’s Quick Start recommends applying `isolation: isolate` on the root layout element to ensure correct stacking when portals are involved.

**Implication**: Apply `isolation: isolate` for both:
- Popup root container (extension document) to ensure portal layering remains predictable.
- Overlay host/shadow root container (page document) to prevent host-page stacking contexts from breaking overlay layering.

### 3) Notifications: Base UI Toast supports out-of-tree triggers
Base UI Toast exposes a `toastManager`, enabling toasts to be triggered from outside the component tree (or via a shared service module).

**Implication**: This matches the extension’s “fail loudly but safely” UX and the current pattern where various modules may need to surface notifications (popup actions, overlay copy failures, background errors mapped to UI).

### 4) Base UI is unstyled by default
Base UI components provide behavior/a11y while leaving visuals to the app.

**Implication**: The design must define a small, consistent styling system (CSS variables + component classnames/data-attributes) that can live in:
- `popup.css` (popup document)
- injected `<style>` within the overlay ShadowRoot (overlay document subtree)

### 5) Codebase integration points to preserve
From repository inspection:
- Popup is an extension page that loads `dist/popup.js` via `popup_bootstrap.js`, and currently relies on DOM IDs/classes for navigation, storage-backed forms, and action execution.
- Content script already uses **Shadow DOM** for overlay UI and uses MutationObserver for dynamic table sorting.
- Background worker owns OpenAI calls and context menu behavior and sends messages to content/popup via typed discriminated unions.

**Implication**: The React migration should preserve message/action names and storage keys where feasible to minimize regression risk and test churn.

## Decisions (design constraints derived from findings)
1) Use `@base-ui/react` as the UI primitives library (not `@mui/base`).
2) Keep overlay UI mounted in Shadow DOM; route all Base UI portals to the ShadowRoot via `container`.
3) Use Base UI Toast for user-visible notifications (popup + overlay).
4) Use Base UI Tabs for the popup’s 3-pane navigation (Actions/Table/Settings), with URL-hash synchronization for deep-linking and parity with current behavior.
5) Use Base UI Dialog for the popup menu drawer (scrim + Escape close), preserving the existing drawer semantics while improving a11y/focus management.

## Risks & Mitigations (discovery)
- **Portal scoping regressions (Shadow DOM)** → enforce `container={shadowRoot}` for every Base UI `*.Portal` used in the overlay surface.
- **Popup lifecycle + focus quirks** → rely on Base UI’s focus management and keep portals within the popup root stacking context (`isolation: isolate`).
- **Bundle size increase (React)** → keep React usage limited to popup/overlay UI surfaces; keep background logic framework-free.
- **Test drift** → prefer stable contracts (storage keys, message types) and refactor tests to assert behaviors rather than DOM structure.

