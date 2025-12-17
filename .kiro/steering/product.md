# Product Steering: My Browser Utils

## Purpose
My Browser Utils is a personal Chrome extension that adds small, high-leverage utilities directly to the pages you use, with minimal setup and no external backend.

## Primary Value
- Make tabular web UIs easier to work with (click-to-sort, including dynamically inserted tables).
- Provide lightweight “AI actions” on selected text or page content from the context menu (e.g., summarize/translate; calendar extraction is supported).

## Core Capabilities (patterns, not a catalog)
### Table sorting
- Enable sorting by clicking table headers (`<th>`), auto-detecting numeric vs string sorting.
- Support “auto enable” via:
  - A global toggle (enable on all sites), and/or
  - Domain/path patterns saved by the user (wildcard `*` patterns; protocol is ignored).
- Handle dynamic pages by watching DOM mutations and enabling sorting for newly added tables.

### AI actions (OpenAI integration)
- Actions are invoked from the browser context menu; the input is either:
  - The current selection (preferred when present), or
  - Extracted page text (fallback).
- Built-in actions exist (summarize/translate/calendar), and user-defined actions are editable in the popup UI.
- Secrets (OpenAI API token) are configured by the user; the extension guides the user to settings when missing.

## UX Principles
- “Works where you are”: features are surfaced via the popup (settings/controls) and context menu (actions).
- Keep UI strings and default prompts Japanese-first (match the existing UI tone), unless intentionally localizing.
- Fail loudly but safely: show a clear in-page/popup message instead of silently doing nothing.

## Data & Privacy Expectations
- Store non-sensitive settings (domain patterns, action definitions) in synced extension storage.
- Store secrets (OpenAI token) locally on the device.
- Only send text to the OpenAI API when the user explicitly triggers an AI action.

## Non-goals
- No server-side persistence or user accounts.
- Not a general automation framework; utilities should remain small and maintainable.
- Avoid page-specific brittle DOM integrations beyond generic table behavior and overlays.

