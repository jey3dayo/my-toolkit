# Product Steering: Browser Toolkit

## Purpose

Browser Toolkit is a personal Chrome extension that adds small, high-leverage utilities directly to the pages you use, with minimal setup and no external backend.

## Primary Value

- Make tabular web UIs easier to work with (click-to-sort, including dynamically inserted tables).
- Provide lightweight “AI actions” on selected text or page content from the context menu (e.g., summarize/translate; calendar extraction is supported).
- Provide quick “link utilities” (copy the current tab’s title + URL) from the popup and/or context menu.

## Core Capabilities (patterns, not a catalog)

### Table sorting

- Enable sorting by clicking table headers (`<th>`), auto-detecting numeric vs string sorting.
- Support “auto enable” via:
  - A global toggle (enable on all sites), and/or
  - Domain/path patterns saved by the user (wildcard `*` patterns; protocol is ignored).
    - Unless a pattern explicitly includes `?` or `#`, query/hash suffixes are treated as optional; simple patterns tolerate an optional trailing `/`.
- Handle dynamic pages by watching DOM mutations and enabling sorting for newly added tables.

### AI actions (OpenAI integration)

- Actions are invoked from the browser context menu and the popup “Actions” view; target text is resolved as:
  - Prefer the current selection (context-menu `selectionText` or live `window.getSelection()`), or
  - For popup-triggered flows, fall back to a timestamped “recent selection” cache (treated as fresh for ~30s; local-only), or
  - Extracted page text (fallback).
- Built-in actions exist (summarize/translate/calendar), and user-defined actions are editable in the popup UI.
- Results are surfaced in-page as a lightweight overlay (Shadow DOM), anchored to the selection when possible, with copy/calendar handoff affordances.
- Actions support simple template variables (e.g. `{{text}}`, `{{title}}`, `{{url}}`, `{{source}}`) to reuse metadata in prompts.
- Secrets (OpenAI API token) are configured by the user; the extension guides the user to settings when missing.
- “Calendar” actions extract a structured event and provide handoff options (Google Calendar link; optional `.ics` export).

### Link utilities (non-AI)

- Provide a small popup utility to copy the current tab’s title + URL in a reusable format (e.g. Markdown), without leaving the page.
- Offer a context-menu “copy title + link” action for one-step capture; if direct clipboard copy fails, fall back to an in-page overlay that the user can copy from manually.

## UX Principles

- “Works where you are”: features are surfaced via the popup (settings/controls) and context menu (actions).
- Keep UI strings and default prompts Japanese-first (match the existing UI tone), unless intentionally localizing.
- Keep theme (light/dark) consistent across popup and in-page UI.
- Fail loudly but safely: show a clear in-page/popup message instead of silently doing nothing.
- Prefer accessible UI behaviors: keyboard-friendly navigation and explicit ARIA state updates (especially in the popup).

## Data & Privacy Expectations

- Store non-sensitive settings (domain patterns, action definitions) in synced extension storage.
- Store secrets (OpenAI token) locally on the device.
- Cache the most recent selection locally with a timestamp to improve context-menu behavior (treated as fresh for ~30s); it is never synced and is only sent to OpenAI when the user triggers an AI action.
- Only send text to the OpenAI API when the user explicitly triggers an AI action.

## Non-goals

- No server-side persistence or user accounts.
- Not a general automation framework; utilities should remain small and maintainable.
- Avoid page-specific brittle DOM integrations beyond generic table behavior and overlays.
