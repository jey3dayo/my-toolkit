// Content Script - Webページに注入される

(() => {
  type StorageData = {
    domainPatterns?: string[];
    autoEnableSort?: boolean;
  };

  type SummarySource = "selection" | "page";

  type ContentRequest =
    | { action: "enableTableSort" }
    | { action: "showNotification"; message: string }
    | { action: "getSummaryTargetText" }
    | { action: "showSummaryOverlay"; summary: string; source: SummarySource };

  type SummaryTarget = {
    text: string;
    source: SummarySource;
    title: string;
    url: string;
  };

  type ContentToBackgroundMessage =
    | { action: "summarizeText"; target: SummaryTarget }
    | { action: "summarizeEvent"; target: SummaryTarget };

  type SummarizeTextResponse =
    | { ok: true; summary: string; source: SummarySource }
    | { ok: false; error: string };

  type SummarizeEventResponse =
    | { ok: true; event: unknown; calendarUrl: string; eventText: string }
    | { ok: false; error: string };

  let tableObserver: MutationObserver | null = null;
  let autoSummaryTimer: number | null = null;
  let autoSummaryRequestId = 0;
  let lastAutoSummaryText = "";
  let lastAutoSummaryResult: { summary: string; source: SummarySource } | null =
    null;

  // ========================================
  // 1. ユーティリティ関数
  // ========================================

  function patternToRegex(pattern: string): RegExp {
    const escaped = pattern
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*");

    return new RegExp(`^${escaped}$`);
  }

  function matchesAnyPattern(patterns: string[]): boolean {
    const url = window.location.href;
    const urlWithoutProtocol = url.replace(/^https?:\/\//, "");

    return patterns.some((pattern) => {
      const patternWithoutProtocol = pattern.replace(/^https?:\/\//, "");
      const regex = patternToRegex(patternWithoutProtocol);

      return regex.test(urlWithoutProtocol);
    });
  }

  // ========================================
  // 2. メッセージリスナー
  // ========================================

  chrome.runtime.onMessage.addListener(
    (
      request: ContentRequest,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response?: unknown) => void,
    ) => {
      if (request.action === "enableTableSort") {
        enableTableSort();
        startTableObserver();
        sendResponse({ success: true });
      }

      if (request.action === "showNotification") {
        showNotification(request.message);
      }

      if (request.action === "getSummaryTargetText") {
        void (async () => {
          const target = await getSummaryTargetText();
          sendResponse(target);
        })();
      }

      if (request.action === "showSummaryOverlay") {
        showSummaryOverlay(request.summary, request.source);
      }

      return true;
    },
  );

  // ========================================
  // 3. テーブルソート機能
  // ========================================

  function enableSingleTable(table: HTMLTableElement): void {
    if (table.dataset.sortable) return;

    table.dataset.sortable = "true";
    const headers = table.querySelectorAll<HTMLTableCellElement>("th");

    headers.forEach((header, index) => {
      header.style.cursor = "pointer";
      header.style.userSelect = "none";
      header.title = "クリックでソート";

      header.addEventListener("click", () => {
        sortTable(table, index);
      });
    });
  }

  function enableTableSort(): void {
    const tables = document.querySelectorAll<HTMLTableElement>("table");

    tables.forEach((table) => {
      enableSingleTable(table);
    });

    if (tables.length > 0) {
      showNotification(`${tables.length}個のテーブルでソートを有効化しました`);
    }
  }

  function sortTable(table: HTMLTableElement, columnIndex: number): void {
    const tbody = table.querySelector(
      "tbody",
    ) as HTMLTableSectionElement | null;
    const targetBody = tbody ?? table;
    const rows = Array.from(
      targetBody.querySelectorAll<HTMLTableRowElement>("tr"),
    ).filter((row) => row.parentNode === targetBody);

    const isAscending = table.dataset.sortOrder !== "asc";
    table.dataset.sortOrder = isAscending ? "asc" : "desc";

    rows.sort((a, b) => {
      const aCell = a.cells[columnIndex]?.textContent?.trim() ?? "";
      const bCell = b.cells[columnIndex]?.textContent?.trim() ?? "";

      const aNum = parseFloat(aCell);
      const bNum = parseFloat(bCell);

      if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) {
        return isAscending ? aNum - bNum : bNum - aNum;
      }

      return isAscending
        ? aCell.localeCompare(bCell, "ja")
        : bCell.localeCompare(aCell, "ja");
    });

    rows.forEach((row) => targetBody.appendChild(row));
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
    const tables = document.querySelectorAll<HTMLTableElement>(
      "table:not([data-sortable])",
    );

    if (tables.length > 0) {
      tables.forEach((table) => {
        enableSingleTable(table);
      });

      showNotification(
        `${tables.length}個の新しいテーブルでソートを有効化しました`,
      );
    }
  }

  function stopTableObserver(): void {
    if (tableObserver) {
      tableObserver.disconnect();
      tableObserver = null;
    }
  }

  // ========================================
  // 5. UI・通知関連
  // ========================================

  document.addEventListener("mouseup", (event) => {
    const selectedText = window.getSelection()?.toString().trim() ?? "";
    if (selectedText) {
      void chrome.storage.local.set({
        selectedText,
        selectedTextUpdatedAt: Date.now(),
      });
    }

    void maybeAutoSummarizeSelection(selectedText, event);
  });

  function showNotification(message: string): void {
    const notification = document.createElement("div");
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
      notification.style.animation = "slideOut 0.3s ease-out";
      window.setTimeout(() => notification.remove(), 300);
    }, 2500);
  }

  if (!document.getElementById("my-browser-utils-styles")) {
    const style = document.createElement("style");
    style.id = "my-browser-utils-styles";
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
    const selection = window.getSelection()?.toString().trim() ?? "";
    if (selection) {
      return {
        text: selection,
        source: "selection",
        title: document.title ?? "",
        url: window.location.href,
      };
    }

    const storedSelection = (await chrome.storage.local.get([
      "selectedText",
      "selectedTextUpdatedAt",
    ])) as {
      selectedText?: string;
      selectedTextUpdatedAt?: number;
    };
    const fallbackSelection = storedSelection.selectedText?.trim() ?? "";
    const updatedAt = storedSelection.selectedTextUpdatedAt ?? 0;
    const isFresh = Date.now() - updatedAt <= 30_000;

    if (isFresh && fallbackSelection) {
      return {
        text: fallbackSelection,
        source: "selection",
        title: document.title ?? "",
        url: window.location.href,
      };
    }

    const bodyText = document.body?.innerText ?? "";
    return {
      text: normalizeText(bodyText),
      source: "page",
      title: document.title ?? "",
      url: window.location.href,
    };
  }

  function normalizeText(text: string): string {
    return text
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function showSummaryOverlay(summary: string, source: SummarySource): void {
    const existing = document.getElementById("my-browser-utils-summary");
    if (existing) existing.remove();

    const root = document.createElement("div");
    root.id = "my-browser-utils-summary";
    root.style.cssText = `
    position: fixed;
    right: 16px;
    top: 16px;
    width: min(480px, calc(100vw - 32px));
    max-height: 60vh;
    z-index: 2147483647;
    background: #fff;
    border: 1px solid rgba(0,0,0,0.12);
    border-radius: 10px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.22);
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  `;

    const header = document.createElement("div");
    header.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 12px;
    background: #f7f7f7;
    border-bottom: 1px solid rgba(0,0,0,0.08);
  `;

    const title = document.createElement("div");
    title.textContent =
      source === "selection" ? "要約（選択範囲）" : "要約（ページ本文）";
    title.style.cssText = `
    font-size: 13px;
    font-weight: 700;
    color: #111;
  `;

    const actions = document.createElement("div");
    actions.style.cssText = `
    display: flex;
    gap: 8px;
    align-items: center;
  `;

    const copyButton = document.createElement("button");
    copyButton.textContent = "コピー";
    copyButton.style.cssText = `
    padding: 6px 10px;
    font-size: 12px;
    border: none;
    border-radius: 6px;
    background: #4285f4;
    color: white;
    cursor: pointer;
  `;
    copyButton.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(summary);
        showNotification("コピーしました");
      } catch {
        showNotification("コピーに失敗しました");
      }
    });

    const eventButton = document.createElement("button");
    eventButton.textContent = "イベント";
    eventButton.style.cssText = `
    padding: 6px 10px;
    font-size: 12px;
    border: none;
    border-radius: 6px;
    background: #111827;
    color: white;
    cursor: pointer;
  `;
    eventButton.addEventListener("click", () => {
      void (async () => {
        if (eventButton) eventButton.disabled = true;
        const prevText = eventButton.textContent;
        eventButton.textContent = "処理中...";

        try {
          const target = await getSummaryTargetText();
          if (target.source !== "selection") {
            showNotification("選択範囲が見つかりませんでした");
            return;
          }

          const response = await sendMessageToBackground<
            ContentToBackgroundMessage,
            SummarizeEventResponse
          >({
            action: "summarizeEvent",
            target,
          });

          if (!response.ok) {
            showNotification(response.error);
            return;
          }

          showEventOverlay(response.eventText, response.calendarUrl);
        } catch (error) {
          showNotification(
            error instanceof Error
              ? error.message
              : "イベント要約に失敗しました",
          );
        } finally {
          eventButton.textContent = prevText ?? "イベント";
          eventButton.disabled = false;
        }
      })();
    });

    const closeButton = document.createElement("button");
    closeButton.textContent = "閉じる";
    closeButton.style.cssText = `
    padding: 6px 10px;
    font-size: 12px;
    border: none;
    border-radius: 6px;
    background: #6b7280;
    color: white;
    cursor: pointer;
  `;
    closeButton.addEventListener("click", () => root.remove());

    actions.appendChild(copyButton);
    if (source === "selection") {
      actions.appendChild(eventButton);
    }
    actions.appendChild(closeButton);
    header.appendChild(title);
    header.appendChild(actions);

    const body = document.createElement("div");
    body.style.cssText = `
    padding: 12px;
    overflow: auto;
    max-height: calc(60vh - 44px);
  `;

    const pre = document.createElement("pre");
    pre.textContent = summary;
    pre.style.cssText = `
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 13px;
    line-height: 1.45;
    color: #111;
  `;

    body.appendChild(pre);
    root.appendChild(header);
    root.appendChild(body);
    document.body.appendChild(root);
  }

  function showEventOverlay(eventText: string, calendarUrl: string): void {
    const existing = document.getElementById("my-browser-utils-summary");
    if (existing) existing.remove();

    const root = document.createElement("div");
    root.id = "my-browser-utils-summary";
    root.style.cssText = `
    position: fixed;
    right: 16px;
    top: 16px;
    width: min(480px, calc(100vw - 32px));
    max-height: 60vh;
    z-index: 2147483647;
    background: #fff;
    border: 1px solid rgba(0,0,0,0.12);
    border-radius: 10px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.22);
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  `;

    const header = document.createElement("div");
    header.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 12px;
    background: #f7f7f7;
    border-bottom: 1px solid rgba(0,0,0,0.08);
  `;

    const title = document.createElement("div");
    title.textContent = "イベント要約";
    title.style.cssText = `
    font-size: 13px;
    font-weight: 700;
    color: #111;
  `;

    const actions = document.createElement("div");
    actions.style.cssText = `
    display: flex;
    gap: 8px;
    align-items: center;
  `;

    const openButton = document.createElement("button");
    openButton.textContent = "カレンダー";
    openButton.style.cssText = `
    padding: 6px 10px;
    font-size: 12px;
    border: none;
    border-radius: 6px;
    background: #4285f4;
    color: white;
    cursor: pointer;
  `;
    openButton.addEventListener("click", () => {
      window.open(calendarUrl, "_blank", "noopener,noreferrer");
    });

    const copyEventButton = document.createElement("button");
    copyEventButton.textContent = "コピー";
    copyEventButton.style.cssText = `
    padding: 6px 10px;
    font-size: 12px;
    border: none;
    border-radius: 6px;
    background: #111827;
    color: white;
    cursor: pointer;
  `;
    copyEventButton.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(eventText);
        showNotification("コピーしました");
      } catch {
        showNotification("コピーに失敗しました");
      }
    });

    const copyLinkButton = document.createElement("button");
    copyLinkButton.textContent = "リンクコピー";
    copyLinkButton.style.cssText = `
    padding: 6px 10px;
    font-size: 12px;
    border: none;
    border-radius: 6px;
    background: #6b7280;
    color: white;
    cursor: pointer;
  `;
    copyLinkButton.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(calendarUrl);
        showNotification("コピーしました");
      } catch {
        showNotification("コピーに失敗しました");
      }
    });

    const closeButton = document.createElement("button");
    closeButton.textContent = "閉じる";
    closeButton.style.cssText = `
    padding: 6px 10px;
    font-size: 12px;
    border: none;
    border-radius: 6px;
    background: #6b7280;
    color: white;
    cursor: pointer;
  `;
    closeButton.addEventListener("click", () => root.remove());

    actions.appendChild(openButton);
    actions.appendChild(copyEventButton);
    actions.appendChild(copyLinkButton);
    actions.appendChild(closeButton);
    header.appendChild(title);
    header.appendChild(actions);

    const body = document.createElement("div");
    body.style.cssText = `
    padding: 12px;
    overflow: auto;
    max-height: calc(60vh - 44px);
  `;

    const pre = document.createElement("pre");
    pre.textContent = eventText;
    pre.style.cssText = `
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 13px;
    line-height: 1.45;
    color: #111;
  `;

    body.appendChild(pre);
    root.appendChild(header);
    root.appendChild(body);
    document.body.appendChild(root);
  }

  async function maybeAutoSummarizeSelection(
    selectedText: string,
    event: MouseEvent,
  ): Promise<void> {
    const target = event.target as HTMLElement | null;
    if (target?.closest("#my-browser-utils-summary")) return;

    const MIN_CHARS = 1;
    const trimmed = selectedText.trim();
    if (trimmed.length < MIN_CHARS) return;

    if (trimmed === lastAutoSummaryText && lastAutoSummaryResult) {
      showSummaryOverlay(
        lastAutoSummaryResult.summary,
        lastAutoSummaryResult.source,
      );
      return;
    }
    lastAutoSummaryText = trimmed;
    lastAutoSummaryResult = null;

    if (autoSummaryTimer) {
      window.clearTimeout(autoSummaryTimer);
      autoSummaryTimer = null;
    }

    const requestId = ++autoSummaryRequestId;
    autoSummaryTimer = window.setTimeout(() => {
      void (async () => {
        const currentSelection = window.getSelection()?.toString().trim() ?? "";
        if (currentSelection && currentSelection !== trimmed) {
          return;
        }

        showNotification("要約中...");

        const summaryTarget: SummaryTarget = {
          text: trimmed,
          source: "selection",
          title: document.title ?? "",
          url: window.location.href,
        };

        try {
          const response = await sendMessageToBackground<
            ContentToBackgroundMessage,
            SummarizeTextResponse
          >({
            action: "summarizeText",
            target: summaryTarget,
          });

          if (requestId !== autoSummaryRequestId) return;

          if (!response.ok) {
            showNotification(response.error);
            return;
          }

          lastAutoSummaryResult = {
            summary: response.summary,
            source: response.source,
          };
          showSummaryOverlay(response.summary, response.source);
        } catch (error) {
          if (requestId !== autoSummaryRequestId) return;
          showNotification(
            error instanceof Error ? error.message : "要約に失敗しました",
          );
        }
      })();
    }, 450);
  }

  function sendMessageToBackground<TRequest, TResponse>(
    message: TRequest,
  ): Promise<TResponse> {
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
      const { domainPatterns = [], autoEnableSort = false }: StorageData =
        await chrome.storage.sync.get(["domainPatterns", "autoEnableSort"]);

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
      console.error("Auto-enable table sort failed:", error);
    }
  })();
})();
