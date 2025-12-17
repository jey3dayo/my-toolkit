// Content Script - Webページに注入される

(() => {
  type StorageData = {
    domainPatterns?: string[];
    autoEnableSort?: boolean;
  };

  type SummarySource = 'selection' | 'page';

  type ContentRequest =
    | { action: 'enableTableSort' }
    | { action: 'showNotification'; message: string }
    | { action: 'getSummaryTargetText' }
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
      };

  type SummaryTarget = {
    text: string;
    source: SummarySource;
    title: string;
    url: string;
  };

  type ContentToBackgroundMessage =
    | { action: 'summarizeText'; target: SummaryTarget }
    | { action: 'summarizeEvent'; target: SummaryTarget };

  type SummarizeEventResponse =
    | { ok: true; event: unknown; calendarUrl: string; eventText: string }
    | { ok: false; error: string };

  let tableObserver: MutationObserver | null = null;
  let overlayEls: {
    host: HTMLDivElement;
    title: HTMLDivElement;
    content: HTMLDivElement;
    primaryText: HTMLPreElement;
    secondaryText: HTMLPreElement;
    copyButton: HTMLButtonElement;
    eventButton: HTMLButtonElement;
    openCalendarButton: HTMLButtonElement;
    copyLinkButton: HTMLButtonElement;
    closeButton: HTMLButtonElement;
  } | null = null;
  let overlayCleanup: (() => void) | null = null;
  let overlayMode: 'summary' | 'event' | 'text' = 'summary';
  let overlaySummaryText = '';
  let overlayEventText = '';
  let overlayCalendarUrl = '';
  let overlayAnchor: DOMRect | null = null;
  let overlayPinned = false;

  // ========================================
  // 1. ユーティリティ関数
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

  // ========================================
  // 2. メッセージリスナー
  // ========================================

  chrome.runtime.onMessage.addListener(
    (request: ContentRequest, _sender: chrome.runtime.MessageSender, sendResponse: (response?: unknown) => void) => {
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
              const target = await getSummaryTargetText();
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
  // 3. テーブルソート機能
  // ========================================

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

      const aNum = parseFloat(aCell);
      const bNum = parseFloat(bCell);

      if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) {
        return isAscending ? aNum - bNum : bNum - aNum;
      }

      return isAscending ? aCell.localeCompare(bCell, 'ja') : bCell.localeCompare(aCell, 'ja');
    });

    rows.forEach(row => targetBody.appendChild(row));
  }

  // ========================================
  // 4. MutationObserver（動的テーブル検出）
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
  // 5. UI・通知関連
  // ========================================

  document.addEventListener('mouseup', () => {
    const selectedText = window.getSelection()?.toString().trim() ?? '';
    if (selectedText) {
      void storageLocalSet({ selectedText, selectedTextUpdatedAt: Date.now() }).catch(() => {
        // ストレージが使えない環境では黙って諦める
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
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    @keyframes slideOut {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(400px);
        opacity: 0;
      }
    }
  `;
    document.head.appendChild(style);
  }

  async function getSummaryTargetText(): Promise<SummaryTarget> {
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

    const bodyText = document.body?.innerText ?? '';
    const MAX_RETURN_CHARS = 60_000;
    const normalized = normalizeText(bodyText);
    const clipped = normalized.length > MAX_RETURN_CHARS ? `${normalized.slice(0, MAX_RETURN_CHARS)}\n\n(以下略)` : normalized;
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

  function ensureOverlay(): NonNullable<typeof overlayEls> {
    if (overlayEls) return overlayEls;

    const legacy = document.getElementById('my-browser-utils-summary');
    if (legacy) legacy.remove();

    overlayPinned = false;

    const host = document.createElement('div');
    host.id = 'my-browser-utils-overlay';
    host.style.cssText = `
      all: initial;
      position: fixed;
      top: 16px;
      left: 16px;
      z-index: 2147483647;
      color-scheme: light;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;

    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; }
      *, *::before, *::after { box-sizing: border-box; font-family: inherit; }

      .panel {
        width: min(520px, calc(100vw - 32px));
        max-height: min(60vh, 720px);
        background: #fff;
        border: 1px solid rgba(0,0,0,0.12);
        border-radius: 14px;
        box-shadow: 0 16px 44px rgba(0,0,0,0.28);
        overflow: hidden;
        display: grid;
        grid-template-rows: auto 1fr;
      }

      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 12px 14px;
        background: #f7f7f7;
        border-bottom: 1px solid rgba(0,0,0,0.08);
      }

      .header-left {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
        flex: 1;
      }

      .drag-handle {
        appearance: none;
        border: none;
        background: transparent;
        width: 22px;
        height: 22px;
        padding: 0;
        border-radius: 8px;
        cursor: grab;
        touch-action: none;
        display: grid;
        place-items: center;
        flex: 0 0 auto;
      }

      .drag-handle::before {
        content: '';
        width: 14px;
        height: 14px;
        background:
          radial-gradient(circle, rgba(0,0,0,0.35) 1.2px, transparent 1.4px) 0 0 / 6px 6px;
        opacity: 0.9;
      }

      .drag-handle:hover {
        background: rgba(0,0,0,0.06);
      }

      :host(.dragging) .drag-handle {
        cursor: grabbing;
      }

      .title {
        font-size: 13px;
        font-weight: 700;
        color: #111;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .actions {
        display: flex;
        gap: 8px;
        align-items: center;
        flex-wrap: wrap;
        justify-content: flex-end;
      }

      button {
        appearance: none;
        border: none;
        border-radius: 10px;
        padding: 8px 10px;
        font-size: 12px;
        line-height: 1;
        cursor: pointer;
        font-weight: 600;
      }
      button:disabled { opacity: 0.6; cursor: not-allowed; }

      .btn-primary { background: #4285f4; color: #fff; }
      .btn-dark { background: #111827; color: #fff; }
      .btn-quiet { background: #6b7280; color: #fff; }

      .body {
        padding: 14px;
        overflow: auto;
      }

      .status {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        border-radius: 12px;
        background: #f3f4f6;
        color: #111;
        margin-bottom: 12px;
        font-size: 13px;
      }

      .spinner {
        width: 14px;
        height: 14px;
        border-radius: 999px;
        border: 2px solid rgba(0,0,0,0.18);
        border-top-color: rgba(0,0,0,0.60);
        animation: spin 0.7s linear infinite;
        flex: 0 0 auto;
      }

      @keyframes spin { to { transform: rotate(360deg); } }

      pre {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
        font-size: 13px;
        line-height: 1.5;
        color: #111;
      }

      .secondary {
        margin-top: 10px;
        padding-top: 10px;
        border-top: 1px solid rgba(0,0,0,0.08);
        color: rgba(17,17,17,0.85);
        font-size: 12px;
      }
    `;

    const panel = document.createElement('div');
    panel.className = 'panel';

    const header = document.createElement('div');
    header.className = 'header';

    const headerLeft = document.createElement('div');
    headerLeft.className = 'header-left';

    const dragHandle = document.createElement('button');
    dragHandle.type = 'button';
    dragHandle.className = 'drag-handle';
    dragHandle.title = 'ドラッグして移動';
    dragHandle.setAttribute('aria-label', 'ドラッグして移動');

    const title = document.createElement('div');
    title.className = 'title';

    const actions = document.createElement('div');
    actions.className = 'actions';

    const copyButton = document.createElement('button');
    copyButton.className = 'btn-primary';
    copyButton.textContent = 'コピー';

    const eventButton = document.createElement('button');
    eventButton.className = 'btn-dark';
    eventButton.textContent = 'イベント';

    const openCalendarButton = document.createElement('button');
    openCalendarButton.className = 'btn-primary';
    openCalendarButton.textContent = 'カレンダー';

    const copyLinkButton = document.createElement('button');
    copyLinkButton.className = 'btn-quiet';
    copyLinkButton.textContent = 'リンクコピー';

    const closeButton = document.createElement('button');
    closeButton.className = 'btn-quiet';
    closeButton.textContent = '閉じる';

    actions.appendChild(copyButton);
    actions.appendChild(eventButton);
    actions.appendChild(openCalendarButton);
    actions.appendChild(copyLinkButton);
    actions.appendChild(closeButton);
    headerLeft.appendChild(dragHandle);
    headerLeft.appendChild(title);
    header.appendChild(headerLeft);
    header.appendChild(actions);

    const body = document.createElement('div');
    body.className = 'body';

    const content = document.createElement('div');
    const primaryText = document.createElement('pre');
    const secondaryText = document.createElement('pre');
    secondaryText.className = 'secondary';

    content.appendChild(primaryText);
    content.appendChild(secondaryText);
    body.appendChild(content);

    panel.appendChild(header);
    panel.appendChild(body);

    shadow.appendChild(style);
    shadow.appendChild(panel);

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        closeOverlay();
      }
    };

    let dragging = false;
    let dragPointerId: number | null = null;
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    const clampPosition = (left: number, top: number): { left: number; top: number } => {
      const margin = 12;
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;
      const hostRect = host.getBoundingClientRect();
      const width = hostRect.width || 520;
      const height = hostRect.height || 300;
      return {
        left: Math.min(Math.max(margin, left), Math.max(margin, viewportW - width - margin)),
        top: Math.min(Math.max(margin, top), Math.max(margin, viewportH - height - margin)),
      };
    };

    const startDrag = (event: PointerEvent): void => {
      if (event.button !== 0) return;
      event.preventDefault();
      overlayPinned = true;
      overlayAnchor = null;

      const rect = host.getBoundingClientRect();
      dragOffsetX = event.clientX - rect.left;
      dragOffsetY = event.clientY - rect.top;
      dragging = true;
      dragPointerId = event.pointerId;
      host.classList.add('dragging');
      try {
        dragHandle.setPointerCapture(event.pointerId);
      } catch {
        // no-op
      }
    };

    const moveDrag = (event: PointerEvent): void => {
      if (!dragging) return;
      if (dragPointerId !== null && event.pointerId !== dragPointerId) return;
      const nextLeft = event.clientX - dragOffsetX;
      const nextTop = event.clientY - dragOffsetY;
      const clamped = clampPosition(nextLeft, nextTop);
      host.style.left = `${Math.round(clamped.left)}px`;
      host.style.top = `${Math.round(clamped.top)}px`;
    };

    const endDrag = (event: PointerEvent): void => {
      if (!dragging) return;
      if (dragPointerId !== null && event.pointerId !== dragPointerId) return;
      dragging = false;
      dragPointerId = null;
      host.classList.remove('dragging');
      try {
        dragHandle.releasePointerCapture(event.pointerId);
      } catch {
        // no-op
      }
    };

    const onCopy = (): void => {
      const text = overlayMode === 'event' ? overlayEventText : overlaySummaryText;
      if (!text) return;
      void (async () => {
        try {
          await navigator.clipboard.writeText(text);
          showNotification('コピーしました');
        } catch {
          showNotification('コピーに失敗しました');
        }
      })();
    };

    const onOpenCalendar = (): void => {
      if (!overlayCalendarUrl) return;
      window.open(overlayCalendarUrl, '_blank', 'noopener,noreferrer');
    };

    const onCopyLink = (): void => {
      if (!overlayCalendarUrl) return;
      void (async () => {
        try {
          await navigator.clipboard.writeText(overlayCalendarUrl);
          showNotification('コピーしました');
        } catch {
          showNotification('コピーに失敗しました');
        }
      })();
    };

    const onEvent = (): void => {
      void (async () => {
        if (eventButton) eventButton.disabled = true;
        const prevText = eventButton.textContent;
        eventButton.textContent = '処理中...';

        try {
          const target = await getSummaryTargetText();
          if (target.source !== 'selection') {
            showNotification('選択範囲が見つかりませんでした');
            return;
          }

          const response = await sendMessageToBackground<ContentToBackgroundMessage, SummarizeEventResponse>({
            action: 'summarizeEvent',
            target,
          });

          if (!response.ok) {
            showEventOverlayError(response.error);
            return;
          }

          showEventOverlay(response.eventText, response.calendarUrl);
        } catch (error) {
          showEventOverlayError(error instanceof Error ? error.message : 'イベント要約に失敗しました');
        } finally {
          eventButton.textContent = prevText ?? 'イベント';
          eventButton.disabled = false;
        }
      })();
    };

    window.addEventListener('keydown', onKeyDown, true);
    closeButton.addEventListener('click', closeOverlay);
    copyButton.addEventListener('click', onCopy);
    openCalendarButton.addEventListener('click', onOpenCalendar);
    copyLinkButton.addEventListener('click', onCopyLink);
    eventButton.addEventListener('click', onEvent);
    dragHandle.addEventListener('pointerdown', startDrag);
    dragHandle.addEventListener('pointermove', moveDrag);
    dragHandle.addEventListener('pointerup', endDrag);
    dragHandle.addEventListener('pointercancel', endDrag);

    overlayCleanup = () => {
      window.removeEventListener('keydown', onKeyDown, true);
      closeButton.removeEventListener('click', closeOverlay);
      copyButton.removeEventListener('click', onCopy);
      openCalendarButton.removeEventListener('click', onOpenCalendar);
      copyLinkButton.removeEventListener('click', onCopyLink);
      eventButton.removeEventListener('click', onEvent);
      dragHandle.removeEventListener('pointerdown', startDrag);
      dragHandle.removeEventListener('pointermove', moveDrag);
      dragHandle.removeEventListener('pointerup', endDrag);
      dragHandle.removeEventListener('pointercancel', endDrag);
    };

    (document.documentElement ?? document.body ?? document).appendChild(host);

    overlayEls = {
      host,
      title,
      content,
      primaryText,
      secondaryText,
      copyButton,
      eventButton,
      openCalendarButton,
      copyLinkButton,
      closeButton,
    };

    return overlayEls;
  }

  function closeOverlay(): void {
    if (overlayCleanup) overlayCleanup();
    overlayCleanup = null;
    overlayEls?.host.remove();
    overlayEls = null;
    overlayMode = 'summary';
    overlaySummaryText = '';
    overlayEventText = '';
    overlayCalendarUrl = '';
    overlayAnchor = null;
    overlayPinned = false;
  }

  function setOverlayTitle(text: string): void {
    const els = ensureOverlay();
    els.title.textContent = text;
  }

  function setOverlayActionsVisibility(nextMode: 'summary' | 'event' | 'text'): void {
    const els = ensureOverlay();
    if (nextMode === 'event') {
      els.eventButton.style.display = 'none';
      els.openCalendarButton.style.display = '';
      els.copyLinkButton.style.display = '';
      return;
    }
    if (nextMode === 'text') {
      els.eventButton.style.display = 'none';
      els.openCalendarButton.style.display = 'none';
      els.copyLinkButton.style.display = 'none';
      return;
    }
    els.eventButton.style.display = '';
    els.openCalendarButton.style.display = 'none';
    els.copyLinkButton.style.display = 'none';
  }

  function setOverlayContent(
    primary: string,
    secondary: string,
    status: 'loading' | 'ready' | 'error',
    loadingLabel: string = '要約中...',
  ): void {
    const els = ensureOverlay();
    els.primaryText.textContent = primary;
    els.secondaryText.textContent = secondary;
    els.secondaryText.style.display = secondary ? '' : 'none';

    if (status === 'loading') {
      els.content.prepend(createStatusRow(loadingLabel, true));
    } else if (status === 'error') {
      els.content.prepend(createStatusRow('エラー', false));
    } else {
      const existing = els.content.querySelector('.status');
      if (existing) existing.remove();
    }
  }

  function createStatusRow(text: string, spinning: boolean): HTMLDivElement {
    const els = ensureOverlay();
    const existing = els.content.querySelector('.status');
    if (existing) existing.remove();

    const row = document.createElement('div');
    row.className = 'status';
    if (spinning) {
      const spinner = document.createElement('div');
      spinner.className = 'spinner';
      row.appendChild(spinner);
    }
    const label = document.createElement('div');
    label.textContent = text;
    row.appendChild(label);
    return row;
  }

  function getSelectionAnchorRect(): DOMRect | null {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;

    const range = selection.getRangeAt(0);
    const rects = Array.from(range.getClientRects());
    const rect = rects.length > 0 ? rects[rects.length - 1] : range.getBoundingClientRect();

    if (!rect || (rect.width === 0 && rect.height === 0)) return null;
    return rect;
  }

  function positionOverlay(): void {
    const els = ensureOverlay();

    const margin = 16;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    const hostRect = els.host.getBoundingClientRect();
    const width = hostRect.width || 520;
    const height = hostRect.height || 300;

    if (overlayPinned) {
      const left = Number.parseFloat(els.host.style.left || 'NaN');
      const top = Number.parseFloat(els.host.style.top || 'NaN');
      const nextLeft = Number.isFinite(left) ? left : hostRect.left;
      const nextTop = Number.isFinite(top) ? top : hostRect.top;
      const clampedLeft = Math.min(Math.max(margin, nextLeft), Math.max(margin, viewportW - width - margin));
      const clampedTop = Math.min(Math.max(margin, nextTop), Math.max(margin, viewportH - height - margin));
      els.host.style.left = `${Math.round(clampedLeft)}px`;
      els.host.style.top = `${Math.round(clampedTop)}px`;
      return;
    }

    const anchor = overlayAnchor;
    if (!anchor) {
      const left = Math.max(margin, viewportW - width - margin);
      els.host.style.left = `${Math.round(left)}px`;
      els.host.style.top = `${margin}px`;
      return;
    }

    const preferredLeft = anchor.left;
    const preferredTop = anchor.bottom + 10;

    const left = Math.min(Math.max(margin, preferredLeft), Math.max(margin, viewportW - width - margin));

    const top = Math.min(Math.max(margin, preferredTop), Math.max(margin, viewportH - height - margin));

    els.host.style.left = `${Math.round(left)}px`;
    els.host.style.top = `${Math.round(top)}px`;
  }

  function showSummaryOverlay(request: Extract<ContentRequest, { action: 'showSummaryOverlay' }>): void {
    overlayMode = 'summary';
    setOverlayActionsVisibility('summary');

    const source = request.source;
    const title = source === 'selection' ? '要約（選択範囲）' : '要約（ページ本文）';
    setOverlayTitle(title);

    const els = ensureOverlay();
    overlayAnchor = source === 'selection' ? getSelectionAnchorRect() : null;

    const summary = request.summary?.trim() ?? '';
    const error = request.error?.trim() ?? '';

    if (request.status === 'loading') {
      overlaySummaryText = '';
      els.copyButton.disabled = true;
      els.eventButton.disabled = true;
      els.eventButton.style.display = source === 'selection' ? '' : 'none';
      setOverlayContent('', '処理に数秒かかることがあります。', 'loading');
      requestAnimationFrame(positionOverlay);
      return;
    }

    if (request.status === 'error') {
      overlaySummaryText = '';
      els.copyButton.disabled = true;
      els.eventButton.disabled = true;
      els.eventButton.style.display = 'none';
      setOverlayContent(
        error || '要約に失敗しました',
        'OpenAI API Token未設定の場合は、拡張機能のポップアップ「設定」タブで設定してください。',
        'error',
      );
      requestAnimationFrame(positionOverlay);
      return;
    }

    overlaySummaryText = summary;
    els.copyButton.disabled = !summary;
    els.eventButton.disabled = false;
    els.eventButton.style.display = source === 'selection' ? '' : 'none';
    setOverlayContent(summary || '要約結果が空でした', '', 'ready');
    requestAnimationFrame(positionOverlay);
  }

  function showEventOverlay(eventText: string, calendarUrl: string): void {
    overlayMode = 'event';
    overlayEventText = eventText;
    overlayCalendarUrl = calendarUrl;
    overlayAnchor = getSelectionAnchorRect();
    setOverlayActionsVisibility('event');
    setOverlayTitle('イベント要約');

    const els = ensureOverlay();
    els.copyButton.disabled = !eventText;
    els.openCalendarButton.disabled = !calendarUrl;
    els.copyLinkButton.disabled = !calendarUrl;
    setOverlayContent(eventText, '', 'ready');
    requestAnimationFrame(positionOverlay);
  }

  function showEventOverlayError(error: string): void {
    overlayMode = 'event';
    overlayEventText = '';
    overlayCalendarUrl = '';
    overlayAnchor = getSelectionAnchorRect();
    setOverlayActionsVisibility('event');
    setOverlayTitle('イベント要約');

    const els = ensureOverlay();
    els.copyButton.disabled = true;
    els.openCalendarButton.disabled = true;
    els.copyLinkButton.disabled = true;
    setOverlayContent(error || 'イベント要約に失敗しました', '', 'error');
    requestAnimationFrame(positionOverlay);
  }

  function showActionOverlay(request: Extract<ContentRequest, { action: 'showActionOverlay' }>): void {
    const source = request.source;
    overlayAnchor = source === 'selection' ? getSelectionAnchorRect() : null;

    if (request.mode === 'event') {
      overlayMode = 'event';
      setOverlayActionsVisibility('event');
    } else {
      overlayMode = 'text';
      setOverlayActionsVisibility('text');
    }

    setOverlayTitle(request.title);

    const els = ensureOverlay();
    const primary = request.primary?.trim() ?? '';
    const secondary = request.secondary?.trim() ?? '';
    const calendarUrl = request.calendarUrl?.trim() ?? '';

    if (request.status === 'loading') {
      overlaySummaryText = '';
      overlayEventText = '';
      overlayCalendarUrl = '';
      els.copyButton.disabled = true;
      els.openCalendarButton.disabled = true;
      els.copyLinkButton.disabled = true;
      setOverlayContent('', secondary || '処理に数秒かかることがあります。', 'loading', '処理中...');
      requestAnimationFrame(positionOverlay);
      return;
    }

    if (request.status === 'error') {
      overlaySummaryText = '';
      overlayEventText = '';
      overlayCalendarUrl = '';
      els.copyButton.disabled = true;
      els.openCalendarButton.disabled = true;
      els.copyLinkButton.disabled = true;
      setOverlayContent(primary || '処理に失敗しました', secondary, 'error');
      requestAnimationFrame(positionOverlay);
      return;
    }

    if (request.mode === 'event') {
      overlayEventText = primary;
      overlayCalendarUrl = calendarUrl;
      els.copyButton.disabled = !primary;
      els.openCalendarButton.disabled = !calendarUrl;
      els.copyLinkButton.disabled = !calendarUrl;
      setOverlayContent(primary || '結果が空でした', secondary, 'ready');
      requestAnimationFrame(positionOverlay);
      return;
    }

    overlaySummaryText = primary;
    els.copyButton.disabled = !primary;
    setOverlayContent(primary || '結果が空でした', secondary, 'ready');
    requestAnimationFrame(positionOverlay);
  }

  function sendMessageToBackground<TRequest, TResponse>(message: TRequest): Promise<TResponse> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response: TResponse) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message));
          return;
        }
        resolve(response);
      });
    });
  }

  // ========================================
  // 6. 自動実行ロジック
  // ========================================

  (async function autoEnableTableSort(): Promise<void> {
    try {
      const { domainPatterns = [], autoEnableSort = false }: StorageData = (await storageSyncGet([
        'domainPatterns',
        'autoEnableSort',
      ])) as StorageData;

      if (autoEnableSort) {
        enableTableSort();
        startTableObserver();
        return;
      }

      if (domainPatterns.length > 0 && matchesAnyPattern(domainPatterns)) {
        enableTableSort();
        startTableObserver();
      }
    } catch (error) {
      console.error('Auto-enable table sort failed:', error);
    }
  })();

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
