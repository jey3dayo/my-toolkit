// Content Script - Webページに注入される

import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { OverlayApp, type OverlayViewModel } from './content/overlay/OverlayApp';
import type { ExtractedEvent, SummarySource } from './shared_types';
import { ensureShadowUiBaseStyles } from './ui/styles';

(() => {
  type StorageData = {
    domainPatterns?: string[];
    autoEnableSort?: boolean;
  };

  type ContentRequest =
    | { action: 'enableTableSort' }
    | { action: 'showNotification'; message: string }
    | { action: 'getSummaryTargetText'; ignoreSelection?: boolean }
    | {
        action: 'showSummaryOverlay';
        status: 'loading' | 'ready' | 'error';
        source: SummarySource;
        summary?: string;
        error?: string;
      }
    | {
        action: 'showActionOverlay';
        status: 'loading' | 'ready' | 'error';
        mode: 'text' | 'event';
        source: SummarySource;
        title: string;
        primary?: string;
        secondary?: string;
        calendarUrl?: string;
        ics?: string;
        event?: ExtractedEvent;
      };

  type SummaryTarget = {
    text: string;
    source: SummarySource;
    title: string;
    url: string;
  };

  const OVERLAY_HOST_ID = 'my-browser-utils-overlay';
  const OVERLAY_ROOT_ID = 'mbu-overlay-react-root';
  const OVERLAY_STYLE_ID = 'mbu-overlay-react-styles';

  type OverlayMount = {
    host: HTMLDivElement;
    shadow: ShadowRoot;
    root: Root;
  };

  type GlobalContentState = {
    initialized: boolean;
    overlayMount: OverlayMount | null;
  };

  const globalContainer = globalThis as unknown as { __MBU_CONTENT_STATE__?: GlobalContentState };
  if (!globalContainer.__MBU_CONTENT_STATE__) {
    globalContainer.__MBU_CONTENT_STATE__ = {
      initialized: false,
      overlayMount: null,
    };
  }
  const globalState = globalContainer.__MBU_CONTENT_STATE__;

  // ========================================
  // 1. ユーティリティ関数（URLパターン）
  // ========================================

  function patternToRegex(pattern: string): RegExp {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');

    const shouldAllowQueryHashSuffix = !/[?#]/.test(pattern);
    const allowOptionalTrailingSlash = shouldAllowQueryHashSuffix && !pattern.endsWith('/') && !pattern.includes('*');

    const optionalTrailingSlash = allowOptionalTrailingSlash ? '(?:/)?' : '';
    const optionalQueryHashSuffix = shouldAllowQueryHashSuffix ? '(?:[?#].*)?' : '';

    return new RegExp(`^${escaped}${optionalTrailingSlash}${optionalQueryHashSuffix}$`);
  }

  function matchesAnyPattern(patterns: string[]): boolean {
    const urlWithoutProtocol = window.location.href.replace(/^https?:\/\//, '');

    return patterns.some(pattern => {
      const patternWithoutProtocol = pattern.replace(/^https?:\/\//, '');
      const regex = patternToRegex(patternWithoutProtocol);
      return regex.test(urlWithoutProtocol);
    });
  }

  type ContentTestHooks = {
    patternToRegex?: (pattern: string) => RegExp;
    matchesAnyPattern?: (patterns: string[]) => boolean;
  };

  const testHooks = (globalThis as unknown as { __MBU_TEST_HOOKS__?: ContentTestHooks }).__MBU_TEST_HOOKS__;
  if (testHooks) {
    testHooks.patternToRegex = patternToRegex;
    testHooks.matchesAnyPattern = matchesAnyPattern;
  }

  // 2回目以降の初期化では副作用を追加しない（idempotent）
  if (globalState.initialized) {
    return;
  }
  globalState.initialized = true;

  // ========================================
  // 2. テーブルソート機能
  // ========================================

  let tableObserver: MutationObserver | null = null;

  function enableSingleTable(table: HTMLTableElement): void {
    if (table.dataset.sortable) return;

    table.dataset.sortable = 'true';
    const headers = table.querySelectorAll<HTMLTableCellElement>('th');

    headers.forEach((header, index) => {
      header.style.cursor = 'pointer';
      header.style.userSelect = 'none';
      header.title = 'クリックでソート';

      header.addEventListener('click', () => {
        sortTable(table, index);
      });
    });
  }

  function enableTableSort(): void {
    const tables = document.querySelectorAll<HTMLTableElement>('table');

    tables.forEach(table => {
      enableSingleTable(table);
    });

    if (tables.length > 0) {
      showNotification(`${tables.length}個のテーブルでソートを有効化しました`);
    }
  }

  function sortTable(table: HTMLTableElement, columnIndex: number): void {
    const tbody = table.querySelector('tbody') as HTMLTableSectionElement | null;
    const targetBody = tbody ?? table;
    const rows = Array.from(targetBody.querySelectorAll<HTMLTableRowElement>('tr')).filter(
      row => row.parentNode === targetBody,
    );

    const isAscending = table.dataset.sortOrder !== 'asc';
    table.dataset.sortOrder = isAscending ? 'asc' : 'desc';

    rows.sort((a, b) => {
      const aCell = a.cells[columnIndex]?.textContent?.trim() ?? '';
      const bCell = b.cells[columnIndex]?.textContent?.trim() ?? '';

      const aNum = Number.parseFloat(aCell);
      const bNum = Number.parseFloat(bCell);

      if (!(Number.isNaN(aNum) || Number.isNaN(bNum))) {
        return isAscending ? aNum - bNum : bNum - aNum;
      }

      return isAscending ? aCell.localeCompare(bCell, 'ja') : bCell.localeCompare(aCell, 'ja');
    });

    rows.forEach(row => targetBody.appendChild(row));
  }

  // ========================================
  // 3. MutationObserver（動的テーブル検出）
  // ========================================

  function startTableObserver(): void {
    if (tableObserver) return;

    let debounceTimer: number | undefined;

    const handleMutations = (): void => {
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        checkForNewTables();
      }, 300);
    };

    tableObserver = new MutationObserver(handleMutations);

    tableObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  function checkForNewTables(): void {
    const tables = document.querySelectorAll<HTMLTableElement>('table:not([data-sortable])');

    if (tables.length > 0) {
      tables.forEach(table => {
        enableSingleTable(table);
      });

      showNotification(`${tables.length}個の新しいテーブルでソートを有効化しました`);
    }
  }

  function stopTableObserver(): void {
    if (tableObserver) {
      tableObserver.disconnect();
      tableObserver = null;
    }
  }

  window.addEventListener('pagehide', stopTableObserver);

  // ========================================
  // 4. 通知・選択範囲キャッシュ
  // ========================================

  document.addEventListener('mouseup', () => {
    const selectedText = window.getSelection()?.toString().trim() ?? '';
    if (selectedText) {
      void storageLocalSet({ selectedText, selectedTextUpdatedAt: Date.now() }).catch(() => {
        // no-op
      });
    }
  });

  function showNotification(message: string): void {
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #4285f4;
      color: white;
      padding: 12px 20px;
      border-radius: 4px;
      font-size: 14px;
      z-index: 10000;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      animation: slideIn 0.3s ease-out;
    `;

    document.body.appendChild(notification);
    window.setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease-out';
      window.setTimeout(() => notification.remove(), 300);
    }, 2500);
  }

  if (!document.getElementById('my-browser-utils-styles')) {
    const style = document.createElement('style');
    style.id = 'my-browser-utils-styles';
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(400px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(400px); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }

  async function getSummaryTargetText(options?: { ignoreSelection?: boolean }): Promise<SummaryTarget> {
    if (!options?.ignoreSelection) {
      const selection = window.getSelection()?.toString().trim() ?? '';
      if (selection) {
        return {
          text: selection,
          source: 'selection',
          title: document.title ?? '',
          url: window.location.href,
        };
      }

      let storedSelection: { selectedText?: string; selectedTextUpdatedAt?: number } = {};
      try {
        storedSelection = (await storageLocalGet(['selectedText', 'selectedTextUpdatedAt'])) as {
          selectedText?: string;
          selectedTextUpdatedAt?: number;
        };
      } catch {
        storedSelection = {};
      }
      const fallbackSelection = storedSelection.selectedText?.trim() ?? '';
      const updatedAt = storedSelection.selectedTextUpdatedAt ?? 0;
      const isFresh = Date.now() - updatedAt <= 30_000;

      if (isFresh && fallbackSelection) {
        return {
          text: fallbackSelection,
          source: 'selection',
          title: document.title ?? '',
          url: window.location.href,
        };
      }
    }

    const bodyText = document.body?.innerText ?? '';
    const MAX_RETURN_CHARS = 60_000;
    const normalized = normalizeText(bodyText);
    const clipped =
      normalized.length > MAX_RETURN_CHARS ? `${normalized.slice(0, MAX_RETURN_CHARS)}\n\n(以下略)` : normalized;
    return {
      text: clipped,
      source: 'page',
      title: document.title ?? '',
      url: window.location.href,
    };
  }

  function normalizeText(text: string): string {
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  // ========================================
  // 5. Overlay (React + Shadow DOM)
  // ========================================

  const OVERLAY_CSS = `
    :host { all: initial; }
    *, *::before, *::after {
      box-sizing: border-box;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }

    .mbu-overlay-panel {
      width: min(520px, calc(100vw - 32px));
      max-height: min(60vh, 720px);
      background: var(--mbu-surface);
      color: var(--mbu-text);
      border: 1px solid var(--mbu-border);
      border-radius: var(--mbu-radius);
      box-shadow: var(--mbu-shadow);
      overflow: hidden;
      display: grid;
      grid-template-rows: auto 1fr;
    }

    .mbu-overlay-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 10px 12px;
      background: color-mix(in oklab, var(--mbu-surface-2) 75%, transparent);
      border-bottom: 1px solid var(--mbu-border);
    }

    .mbu-overlay-header-left {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
      flex: 1;
    }

    .mbu-overlay-title {
      font-size: 13px;
      font-weight: 750;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .mbu-overlay-chip {
      margin-left: 8px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 999px;
      border: 1px solid var(--mbu-border);
      background: color-mix(in oklab, var(--mbu-surface) 60%, transparent);
      color: var(--mbu-text-muted);
      font-weight: 650;
    }

    .mbu-overlay-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

	    .mbu-overlay-action {
	      appearance: none;
	      border: 1px solid var(--mbu-border);
	      background: color-mix(in oklab, var(--mbu-surface) 92%, transparent);
	      color: var(--mbu-text);
	      border-radius: 10px;
	      height: 32px;
	      padding: 0 10px;
	      font-size: 12px;
	      line-height: 1;
	      cursor: pointer;
	      font-weight: 700;
	      display: inline-flex;
	      align-items: center;
	      justify-content: center;
	      gap: 6px;
	    }
	    .mbu-overlay-action:disabled {
	      opacity: 0.6;
	      cursor: not-allowed;
	    }

	    .mbu-overlay-icon-button {
	      width: 32px;
	      padding: 0;
	      flex: 0 0 auto;
	    }

	    .mbu-overlay-copy {
	      width: 28px;
	      height: 28px;
	      border-radius: 9px;
	      margin-left: auto;
	      color: var(--mbu-text-muted);
	      background: color-mix(in oklab, var(--mbu-surface) 96%, transparent);
	      transition:
	        background 140ms ease,
	        border-color 140ms ease,
	        color 140ms ease;
	    }

	    .mbu-overlay-copy:hover:not(:disabled) {
	      border-color: color-mix(in oklab, var(--mbu-accent) 45%, var(--mbu-border));
	      background: color-mix(in oklab, var(--mbu-accent) 10%, var(--mbu-surface));
	      color: var(--mbu-text);
	    }

	    .mbu-overlay-icon-button svg {
	      width: 16px;
	      height: 16px;
	      stroke: currentColor;
	      fill: none;
	      stroke-width: 2.2;
	      stroke-linecap: round;
	      stroke-linejoin: round;
	    }

	    .mbu-overlay-icon-button.mbu-overlay-copy svg {
	      width: 14px;
	      height: 14px;
	      stroke-width: 2;
	    }

	    .mbu-overlay-icon-button[data-active='true'] {
	      border-color: color-mix(in oklab, var(--mbu-accent) 55%, var(--mbu-border));
	      background: color-mix(in oklab, var(--mbu-accent) 14%, var(--mbu-surface));
	    }

	    .mbu-overlay-primary {
	      border-color: color-mix(in oklab, var(--mbu-accent) 55%, var(--mbu-border));
	      background: color-mix(in oklab, var(--mbu-accent) 14%, var(--mbu-surface));
	    }

    .mbu-overlay-drag {
      appearance: none;
      border: 1px solid var(--mbu-border);
      background: color-mix(in oklab, var(--mbu-surface) 85%, transparent);
      color: var(--mbu-text);
      width: 32px;
      height: 32px;
      padding: 0;
      border-radius: 10px;
      cursor: grab;
      touch-action: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
    }
    .mbu-overlay-drag:active {
      cursor: grabbing;
    }

    .mbu-overlay-body {
      padding: 12px;
      overflow: auto;
      display: grid;
      gap: 10px;
    }

    .mbu-overlay-body-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      flex-wrap: wrap;
    }

    .mbu-overlay-status {
      font-size: 12px;
      font-weight: 750;
      color: var(--mbu-text-muted);
    }

    .mbu-overlay-primary-text,
    .mbu-overlay-secondary-text {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 13px;
      line-height: 1.5;
    }

    .mbu-overlay-secondary-text {
      color: var(--mbu-text-muted);
      font-size: 12px;
    }

    .mbu-overlay-event-table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      border: 1px solid var(--mbu-border);
      border-radius: 12px;
      background: color-mix(in oklab, var(--mbu-surface) 92%, transparent);
      overflow: hidden;
      font-size: 12px;
    }

    .mbu-overlay-event-table th,
    .mbu-overlay-event-table td {
      padding: 8px 10px;
      vertical-align: top;
      border-bottom: 1px solid var(--mbu-border);
      text-align: left;
    }

    .mbu-overlay-event-table tr:last-child th,
    .mbu-overlay-event-table tr:last-child td {
      border-bottom: none;
    }

    .mbu-overlay-event-table th {
      width: 84px;
      color: var(--mbu-text-muted);
      font-weight: 750;
      white-space: nowrap;
    }

    .mbu-overlay-event-table td {
      color: var(--mbu-text);
      white-space: pre-wrap;
      word-break: break-word;
    }

    .mbu-overlay-quote {
      margin: 0;
      padding: 10px 12px;
      border: 1px solid var(--mbu-border);
      border-left: 4px solid color-mix(in oklab, var(--mbu-accent) 60%, var(--mbu-border));
      border-radius: 12px;
      background: color-mix(in oklab, var(--mbu-surface) 84%, transparent);
      color: var(--mbu-text-muted);
      font-size: 12px;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .mbu-overlay-aux {
      border: 1px solid var(--mbu-border);
      border-radius: 12px;
      background: color-mix(in oklab, var(--mbu-surface) 92%, transparent);
      overflow: hidden;
    }

    .mbu-overlay-aux-summary {
      cursor: pointer;
      list-style: none;
      padding: 10px 12px;
      font-size: 12px;
      font-weight: 750;
      color: var(--mbu-text-muted);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .mbu-overlay-aux-summary::-webkit-details-marker {
      display: none;
    }

    .mbu-overlay-aux-summary::after {
      content: '⌄';
      font-size: 12px;
      opacity: 0.8;
      transform: translateY(-1px);
      transition: transform 140ms ease;
    }

    .mbu-overlay-aux[open] > .mbu-overlay-aux-summary::after {
      transform: rotate(180deg) translateY(1px);
    }

    .mbu-overlay-aux .mbu-overlay-quote {
      border: none;
      border-top: 1px solid var(--mbu-border);
      border-left: 4px solid color-mix(in oklab, var(--mbu-accent) 60%, var(--mbu-border));
      border-radius: 0 0 12px 12px;
      background: transparent;
    }
  `;

  function ensureOverlayMount(): OverlayMount {
    if (globalState.overlayMount?.host.isConnected) {
      return globalState.overlayMount;
    }

    const existing = document.getElementById(OVERLAY_HOST_ID) as HTMLDivElement | null;
    const host = existing || document.createElement('div');
    host.id = OVERLAY_HOST_ID;
    host.style.cssText = `
      all: initial;
      position: fixed;
      top: 16px;
      left: 16px;
      z-index: 2147483647;
      color-scheme: light;
    `;

    const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
    ensureShadowUiBaseStyles(shadow);

    if (!shadow.querySelector(`#${OVERLAY_STYLE_ID}`)) {
      const style = document.createElement('style');
      style.id = OVERLAY_STYLE_ID;
      style.textContent = OVERLAY_CSS;
      shadow.appendChild(style);
    }

    let rootEl = shadow.getElementById(OVERLAY_ROOT_ID) as HTMLDivElement | null;
    if (!rootEl) {
      rootEl = document.createElement('div');
      rootEl.id = OVERLAY_ROOT_ID;
      shadow.appendChild(rootEl);
    }

    const root = createRoot(rootEl);

    if (!host.isConnected) {
      (document.documentElement ?? document.body ?? document).appendChild(host);
    }

    globalState.overlayMount = { host, shadow, root };
    return globalState.overlayMount;
  }

  function closeOverlay(): void {
    const mount = globalState.overlayMount;
    if (!mount) return;
    try {
      mount.root.unmount();
    } catch {
      // no-op
    }
    mount.host.remove();
    globalState.overlayMount = null;
  }

  function getSelectionAnchorRect(): OverlayViewModel['anchorRect'] {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;

    const range = selection.getRangeAt(0);
    const rects = Array.from(range.getClientRects());
    const rect = rects.length > 0 ? rects[rects.length - 1] : range.getBoundingClientRect();

    if (!rect || (rect.width === 0 && rect.height === 0)) return null;
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }

  function renderOverlay(viewModel: OverlayViewModel): void {
    const mount = ensureOverlayMount();
    mount.root.render(
      createElement(OverlayApp, {
        host: mount.host,
        portalContainer: mount.shadow,
        viewModel,
        onDismiss: () => {
          closeOverlay();
        },
      }),
    );
  }

  function stripSourceSuffix(title: string): string {
    return title.replace(/（(?:選択範囲|ページ本文)）\s*$/, '').trim();
  }

  let summarizeOverlayTitleCache: string | null = null;
  let summarizeOverlayTitleInFlight: Promise<string> | null = null;

  function findContextActionTitle(actions: unknown, id: string): string | null {
    if (!Array.isArray(actions)) return null;
    for (const item of actions) {
      if (typeof item !== 'object' || item === null) continue;
      const record = item as Record<string, unknown>;
      if (typeof record.id !== 'string') continue;
      if (record.id.trim() !== id) continue;
      const title = typeof record.title === 'string' ? record.title.trim() : '';
      if (!title) continue;
      return title;
    }
    return null;
  }

  async function getSummarizeOverlayTitle(): Promise<string> {
    if (summarizeOverlayTitleCache) return summarizeOverlayTitleCache;
    if (summarizeOverlayTitleInFlight) return summarizeOverlayTitleInFlight;

    summarizeOverlayTitleInFlight = (async () => {
      try {
        const stored = (await storageSyncGet(['contextActions'])) as { contextActions?: unknown };
        const title = findContextActionTitle(stored.contextActions, 'builtin:summarize');
        summarizeOverlayTitleCache = stripSourceSuffix(title ?? '') || '要約';
      } catch {
        summarizeOverlayTitleCache = '要約';
      } finally {
        summarizeOverlayTitleInFlight = null;
      }
      return summarizeOverlayTitleCache;
    })();

    return summarizeOverlayTitleInFlight;
  }

  function showActionOverlay(request: Extract<ContentRequest, { action: 'showActionOverlay' }>): void {
    const primary = request.primary?.trim() ?? '';
    const secondary = request.secondary?.trim() ?? '';
    const calendarUrl = request.calendarUrl?.trim() ?? '';
    const ics = request.ics?.trim() ?? '';
    const event = request.event;

    const anchorRect = request.source === 'selection' ? getSelectionAnchorRect() : null;

    renderOverlay({
      open: true,
      status: request.status,
      mode: request.mode,
      source: request.source,
      title: stripSourceSuffix(request.title),
      primary:
        request.status === 'loading'
          ? ''
          : request.status === 'ready'
            ? primary || '結果が空でした'
            : primary || '処理に失敗しました',
      secondary: request.status === 'loading' ? secondary || '処理に数秒かかることがあります。' : secondary,
      event: request.mode === 'event' && request.status === 'ready' && event ? event : undefined,
      calendarUrl: calendarUrl || undefined,
      ics: ics || undefined,
      anchorRect,
    });
  }

  function showSummaryOverlay(request: Extract<ContentRequest, { action: 'showSummaryOverlay' }>): void {
    const fallbackTitle = summarizeOverlayTitleCache ?? '要約';
    const summary = request.summary?.trim() ?? '';
    const error = request.error?.trim() ?? '';

    const anchorRect = request.source === 'selection' ? getSelectionAnchorRect() : null;

    renderOverlay({
      open: true,
      status: request.status,
      mode: 'text',
      source: request.source,
      title: fallbackTitle,
      primary:
        request.status === 'ready'
          ? summary || '要約結果が空でした'
          : request.status === 'error'
            ? error || '要約に失敗しました'
            : '',
      secondary:
        request.status === 'loading'
          ? '処理に数秒かかることがあります。'
          : request.status === 'error'
            ? 'OpenAI API Token未設定の場合は、拡張機能のポップアップ「設定」タブで設定してください。'
            : '',
      anchorRect,
    });

    void (async () => {
      const title = await getSummarizeOverlayTitle();
      if (title === fallbackTitle) return;
      renderOverlay({
        open: true,
        status: request.status,
        mode: 'text',
        source: request.source,
        title,
        primary:
          request.status === 'ready'
            ? summary || '要約結果が空でした'
            : request.status === 'error'
              ? error || '要約に失敗しました'
              : '',
        secondary:
          request.status === 'loading'
            ? '処理に数秒かかることがあります。'
            : request.status === 'error'
              ? 'OpenAI API Token未設定の場合は、拡張機能のポップアップ「設定」タブで設定してください。'
              : '',
        anchorRect,
      });
    })();
  }

  // ========================================
  // 6. メッセージリスナー
  // ========================================

  chrome.runtime.onMessage.addListener(
    (request: ContentRequest, _sender: chrome.runtime.MessageSender, sendResponse) => {
      switch (request.action) {
        case 'enableTableSort': {
          enableTableSort();
          startTableObserver();
          sendResponse({ success: true });
          return;
        }
        case 'showNotification': {
          showNotification(request.message);
          sendResponse({ ok: true });
          return;
        }
        case 'getSummaryTargetText': {
          void (async () => {
            try {
              const target = await getSummaryTargetText({ ignoreSelection: request.ignoreSelection });
              sendResponse(target);
            } catch {
              sendResponse({
                text: '',
                source: 'page',
                title: document.title ?? '',
                url: window.location.href,
              } satisfies SummaryTarget);
            }
          })();
          return true;
        }
        case 'showSummaryOverlay': {
          showSummaryOverlay(request);
          sendResponse({ ok: true });
          return;
        }
        case 'showActionOverlay': {
          showActionOverlay(request);
          sendResponse({ ok: true });
          return;
        }
      }
    },
  );

  // ========================================
  // 7. 自動実行ロジック（SPA URL変化も含む）
  // ========================================

  let tableConfig: { domainPatterns: string[]; autoEnableSort: boolean } = {
    domainPatterns: [],
    autoEnableSort: false,
  };

  function normalizePatterns(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.map(item => (typeof item === 'string' ? item.trim() : '')).filter(Boolean);
  }

  function maybeEnableTableSortFromConfig(): void {
    if (tableConfig.autoEnableSort) {
      enableTableSort();
      startTableObserver();
      return;
    }
    if (tableConfig.domainPatterns.length > 0 && matchesAnyPattern(tableConfig.domainPatterns)) {
      enableTableSort();
      startTableObserver();
    }
  }

  async function refreshTableConfig(): Promise<void> {
    try {
      const data = (await storageSyncGet(['domainPatterns', 'autoEnableSort'])) as StorageData;
      tableConfig = {
        domainPatterns: normalizePatterns(data.domainPatterns),
        autoEnableSort: Boolean(data.autoEnableSort),
      };
    } catch {
      tableConfig = { domainPatterns: [], autoEnableSort: false };
    }
  }

  void (async () => {
    await refreshTableConfig();
    maybeEnableTableSortFromConfig();
  })();

  if (chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'sync') return;

      if ('contextActions' in changes) {
        summarizeOverlayTitleCache = null;
        summarizeOverlayTitleInFlight = null;
      }

      if (!('domainPatterns' in changes || 'autoEnableSort' in changes)) return;
      void (async () => {
        await refreshTableConfig();
        maybeEnableTableSortFromConfig();
      })();
    });
  }

  let lastHref = window.location.href;
  window.setInterval(() => {
    const href = window.location.href;
    if (href === lastHref) return;
    lastHref = href;
    maybeEnableTableSortFromConfig();
  }, 1000);

  // ========================================
  // 8. ストレージヘルパー
  // ========================================

  function storageSyncGet(keys: string[]): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!chrome.storage?.sync) {
        resolve({});
        return;
      }

      chrome.storage.sync.get(keys, items => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message));
          return;
        }
        resolve(items);
      });
    });
  }

  function storageLocalGet(keys: string[]): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!chrome.storage?.local) {
        resolve({});
        return;
      }

      chrome.storage.local.get(keys, items => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message));
          return;
        }
        resolve(items);
      });
    });
  }

  function storageLocalSet(items: Record<string, unknown>): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!chrome.storage?.local) {
        resolve();
        return;
      }

      chrome.storage.local.set(items, () => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message));
          return;
        }
        resolve();
      });
    });
  }
})();
