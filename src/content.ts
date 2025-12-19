// Content Script - Webページに注入される

import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  OverlayApp,
  type OverlayViewModel,
} from "@/content/overlay/OverlayApp";
import type { ExtractedEvent, SummarySource } from "@/shared_types";
import { ensureShadowUiBaseStyles } from "@/ui/styles";
import { applyTheme, isTheme, type Theme } from "@/ui/theme";
import {
  createNotifications,
  type Notifier,
  ToastHost,
  type ToastManager,
} from "@/ui/toast";

// Regex patterns at module level for performance (lint/performance/useTopLevelRegex)
const QUERY_OR_HASH_REGEX = /[?#]/;
const HTTP_PROTOCOL_REGEX = /^https?:\/\//;
const SOURCE_SUFFIX_REGEX = /（(?:選択範囲|ページ本文)）\s*$/;

(() => {
  type StorageData = {
    domainPatterns?: string[];
    autoEnableSort?: boolean;
  };

  type ContentRequest =
    | { action: "enableTableSort" }
    | { action: "showNotification"; message: string }
    | { action: "copyToClipboard"; text: string; successMessage?: string }
    | { action: "getSummaryTargetText"; ignoreSelection?: boolean }
    | {
        action: "showSummaryOverlay";
        status: "loading" | "ready" | "error";
        source: SummarySource;
        summary?: string;
        error?: string;
      }
    | {
        action: "showActionOverlay";
        status: "loading" | "ready" | "error";
        mode: "text" | "event";
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

  const OVERLAY_HOST_ID = "my-browser-utils-overlay";
  const OVERLAY_ROOT_ID = "mbu-overlay-react-root";

  const TOAST_HOST_ID = "my-browser-utils-toast-host";
  const TOAST_ROOT_ID = "mbu-toast-react-root";

  type OverlayMount = {
    host: HTMLDivElement;
    shadow: ShadowRoot;
    root: Root;
  };

  type ToastMount = {
    host: HTMLDivElement;
    shadow: ShadowRoot;
    root: Root;
    toastManager: ToastManager;
    notify: Notifier;
  };

  type GlobalContentState = {
    initialized: boolean;
    overlayMount: OverlayMount | null;
    toastMount: ToastMount | null;
  };

  const globalContainer = globalThis as unknown as {
    __MBU_CONTENT_STATE__?: GlobalContentState;
  };
  if (!globalContainer.__MBU_CONTENT_STATE__) {
    globalContainer.__MBU_CONTENT_STATE__ = {
      initialized: false,
      overlayMount: null,
      toastMount: null,
    };
  }
  const globalState = globalContainer.__MBU_CONTENT_STATE__;

  let currentTheme: Theme = "auto";

  function normalizeTheme(value: unknown): Theme {
    return isTheme(value) ? value : "auto";
  }

  function applyThemeToMounts(theme: Theme): void {
    if (globalState.toastMount?.host.isConnected) {
      applyTheme(theme, globalState.toastMount.shadow);
    }
    if (globalState.overlayMount?.host.isConnected) {
      applyTheme(theme, globalState.overlayMount.shadow);
    }
  }

  async function refreshThemeFromStorage(): Promise<void> {
    try {
      const data = (await storageLocalGet(["theme"])) as { theme?: unknown };
      currentTheme = normalizeTheme(data.theme);
    } catch {
      currentTheme = "auto";
    }
    applyThemeToMounts(currentTheme);
  }

  // ========================================
  // 1. ユーティリティ関数（URLパターン）
  // ========================================

  function patternToRegex(pattern: string): RegExp {
    const escaped = pattern
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*");

    const shouldAllowQueryHashSuffix = !QUERY_OR_HASH_REGEX.test(pattern);
    const allowOptionalTrailingSlash =
      shouldAllowQueryHashSuffix &&
      !pattern.endsWith("/") &&
      !pattern.includes("*");

    const optionalTrailingSlash = allowOptionalTrailingSlash ? "(?:/)?" : "";
    const optionalQueryHashSuffix = shouldAllowQueryHashSuffix
      ? "(?:[?#].*)?"
      : "";

    return new RegExp(
      `^${escaped}${optionalTrailingSlash}${optionalQueryHashSuffix}$`
    );
  }

  function matchesAnyPattern(patterns: string[]): boolean {
    const urlWithoutProtocol = window.location.href.replace(
      HTTP_PROTOCOL_REGEX,
      ""
    );

    return patterns.some((pattern) => {
      const patternWithoutProtocol = pattern.replace(HTTP_PROTOCOL_REGEX, "");
      const regex = patternToRegex(patternWithoutProtocol);
      return regex.test(urlWithoutProtocol);
    });
  }

  type ContentTestHooks = {
    patternToRegex?: (pattern: string) => RegExp;
    matchesAnyPattern?: (patterns: string[]) => boolean;
  };

  const testHooks = (
    globalThis as unknown as { __MBU_TEST_HOOKS__?: ContentTestHooks }
  ).__MBU_TEST_HOOKS__;
  if (testHooks) {
    testHooks.patternToRegex = patternToRegex;
    testHooks.matchesAnyPattern = matchesAnyPattern;
  }

  // 2回目以降の初期化では副作用を追加しない（idempotent）
  if (globalState.initialized) {
    return;
  }
  globalState.initialized = true;
  refreshThemeFromStorage().catch(() => {
    // no-op
  });

  // ========================================
  // 2. テーブルソート機能
  // ========================================

  let tableObserver: MutationObserver | null = null;

  function enableSingleTable(table: HTMLTableElement): void {
    if (table.dataset.sortable) {
      return;
    }

    table.dataset.sortable = "true";
    const headers = table.querySelectorAll<HTMLTableCellElement>("th");

    let headerIndex = 0;
    for (const header of headers) {
      const columnIndex = headerIndex;
      header.style.cursor = "pointer";
      header.style.userSelect = "none";
      header.title = "クリックでソート";

      header.addEventListener("click", () => {
        sortTable(table, columnIndex);
      });
      headerIndex += 1;
    }
  }

  function enableTableSort(): void {
    const tables = document.querySelectorAll<HTMLTableElement>("table");

    for (const table of tables) {
      enableSingleTable(table);
    }

    if (tables.length > 0) {
      showNotification(`${tables.length}個のテーブルでソートを有効化しました`);
    }
  }

  function sortTable(table: HTMLTableElement, columnIndex: number): void {
    const tbody = table.querySelector(
      "tbody"
    ) as HTMLTableSectionElement | null;
    const targetBody = tbody ?? table;
    const rows = Array.from(
      targetBody.querySelectorAll<HTMLTableRowElement>("tr")
    ).filter((row) => row.parentNode === targetBody);

    const isAscending = table.dataset.sortOrder !== "asc";
    table.dataset.sortOrder = isAscending ? "asc" : "desc";

    rows.sort((a, b) => {
      const aCell = a.cells[columnIndex]?.textContent?.trim() ?? "";
      const bCell = b.cells[columnIndex]?.textContent?.trim() ?? "";

      const aNum = Number.parseFloat(aCell);
      const bNum = Number.parseFloat(bCell);

      if (!(Number.isNaN(aNum) || Number.isNaN(bNum))) {
        return isAscending ? aNum - bNum : bNum - aNum;
      }

      return isAscending
        ? aCell.localeCompare(bCell, "ja")
        : bCell.localeCompare(aCell, "ja");
    });

    for (const row of rows) {
      targetBody.appendChild(row);
    }
  }

  // ========================================
  // 3. MutationObserver（動的テーブル検出）
  // ========================================

  function startTableObserver(): void {
    if (tableObserver) {
      return;
    }

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
      "table:not([data-sortable])"
    );

    if (tables.length > 0) {
      for (const table of tables) {
        enableSingleTable(table);
      }

      showNotification(
        `${tables.length}個の新しいテーブルでソートを有効化しました`
      );
    }
  }

  function stopTableObserver(): void {
    if (tableObserver) {
      tableObserver.disconnect();
      tableObserver = null;
    }
  }

  window.addEventListener("pagehide", stopTableObserver);

  // ========================================
  // 4. 通知・選択範囲キャッシュ
  // ========================================

  document.addEventListener("mouseup", () => {
    const selectedText = window.getSelection()?.toString().trim() ?? "";
    if (selectedText) {
      storageLocalSet({
        selectedText,
        selectedTextUpdatedAt: Date.now(),
      }).catch(() => {
        // no-op
      });
    }
  });

  function ensureToastMount(): ToastMount {
    if (globalState.toastMount?.host.isConnected) {
      return globalState.toastMount;
    }

    const existing = document.getElementById(
      TOAST_HOST_ID
    ) as HTMLDivElement | null;
    const host = existing || document.createElement("div");
    host.id = TOAST_HOST_ID;

    const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    ensureShadowUiBaseStyles(shadow);
    applyTheme(currentTheme, shadow);

    let rootEl = shadow.getElementById(TOAST_ROOT_ID) as HTMLDivElement | null;
    if (!rootEl) {
      rootEl = document.createElement("div");
      rootEl.id = TOAST_ROOT_ID;
      shadow.appendChild(rootEl);
    }

    const notifications = createNotifications();
    const root = createRoot(rootEl);
    root.render(
      createElement(ToastHost, {
        toastManager: notifications.toastManager,
        placement: "screen",
        portalContainer: shadow,
      })
    );

    if (!host.isConnected) {
      (document.documentElement ?? document.body ?? document).appendChild(host);
    }

    globalState.toastMount = {
      host,
      shadow,
      root,
      toastManager: notifications.toastManager,
      notify: notifications.notify,
    };
    return globalState.toastMount;
  }

  function showNotification(message: string): void {
    const text = message.trim();
    if (!text) {
      return;
    }
    const mount = ensureToastMount();
    mount.notify.info(text);
  }

  async function copyToClipboard(
    text: string
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const trimmed = text.trim();
    if (!trimmed) {
      return { ok: false, error: "コピーする内容がありません" };
    }

    if (!navigator.clipboard?.writeText) {
      return {
        ok: false,
        error: "この環境ではクリップボードにコピーできません",
      };
    }

    try {
      await navigator.clipboard.writeText(trimmed);
      return { ok: true };
    } catch {
      return { ok: false, error: "コピーに失敗しました" };
    }
  }
  function buildSelectionTarget(text: string): SummaryTarget {
    return {
      text,
      source: "selection",
      title: document.title ?? "",
      url: window.location.href,
    };
  }

  function buildPageTarget(text: string): SummaryTarget {
    return {
      text,
      source: "page",
      title: document.title ?? "",
      url: window.location.href,
    };
  }

  function getLiveSelectionTarget(): SummaryTarget | null {
    const selection = window.getSelection()?.toString().trim() ?? "";
    if (!selection) {
      return null;
    }
    return buildSelectionTarget(selection);
  }

  async function getCachedSelectionTarget(): Promise<SummaryTarget | null> {
    try {
      const stored = (await storageLocalGet([
        "selectedText",
        "selectedTextUpdatedAt",
      ])) as {
        selectedText?: string;
        selectedTextUpdatedAt?: number;
      };
      const selection = stored.selectedText?.trim() ?? "";
      const updatedAt = stored.selectedTextUpdatedAt ?? 0;
      const isFresh = Date.now() - updatedAt <= 30_000;
      if (!(isFresh && selection)) {
        return null;
      }
      return buildSelectionTarget(selection);
    } catch {
      return null;
    }
  }
  async function getSummaryTargetText(options?: {
    ignoreSelection?: boolean;
  }): Promise<SummaryTarget> {
    if (!options?.ignoreSelection) {
      const selectionTarget = getLiveSelectionTarget();
      if (selectionTarget) {
        return selectionTarget;
      }
      const cachedSelectionTarget = await getCachedSelectionTarget();
      if (cachedSelectionTarget) {
        return cachedSelectionTarget;
      }
    }

    const bodyText = document.body?.innerText ?? "";
    const MAX_RETURN_CHARS = 60_000;
    const normalized = normalizeText(bodyText);
    const clipped =
      normalized.length > MAX_RETURN_CHARS
        ? `${normalized.slice(0, MAX_RETURN_CHARS)}\n\n(以下略)`
        : normalized;
    return buildPageTarget(clipped);
  }

  function normalizeText(text: string): string {
    return text
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  // ========================================
  // 5. Overlay (React + Shadow DOM)
  // ========================================

  // Overlay styles live in src/styles/tokens/components.css

  function ensureOverlayMount(): OverlayMount {
    if (globalState.overlayMount?.host.isConnected) {
      return globalState.overlayMount;
    }

    const existing = document.getElementById(
      OVERLAY_HOST_ID
    ) as HTMLDivElement | null;
    const host = existing || document.createElement("div");
    host.id = OVERLAY_HOST_ID;

    const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    ensureShadowUiBaseStyles(shadow);
    applyTheme(currentTheme, shadow);

    let rootEl = shadow.getElementById(
      OVERLAY_ROOT_ID
    ) as HTMLDivElement | null;
    if (!rootEl) {
      rootEl = document.createElement("div");
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
    if (!mount) {
      return;
    }
    try {
      mount.root.unmount();
    } catch {
      // no-op
    }
    mount.host.remove();
    globalState.overlayMount = null;
  }

  function getSelectionAnchorRect(): OverlayViewModel["anchorRect"] {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return null;
    }

    const range = selection.getRangeAt(0);
    const rects = Array.from(range.getClientRects());
    const rect =
      rects.length > 0 ? rects.at(-1) : range.getBoundingClientRect();

    if (!rect || (rect.width === 0 && rect.height === 0)) {
      return null;
    }
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
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
      })
    );
  }

  function stripSourceSuffix(title: string): string {
    return title.replace(SOURCE_SUFFIX_REGEX, "").trim();
  }

  let summarizeOverlayTitleCache: string | null = null;
  let summarizeOverlayTitleInFlight: Promise<string> | null = null;

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }

  function getTrimmedStringProp(
    record: Record<string, unknown>,
    key: string
  ): string {
    const value = record[key];
    return typeof value === "string" ? value.trim() : "";
  }

  function findContextActionTitle(actions: unknown, id: string): string | null {
    if (!Array.isArray(actions)) {
      return null;
    }
    for (const item of actions) {
      if (!isRecord(item)) {
        continue;
      }
      if (getTrimmedStringProp(item, "id") !== id) {
        continue;
      }
      const title = getTrimmedStringProp(item, "title");
      return title || null;
    }
    return null;
  }

  function getSummarizeOverlayTitle(): Promise<string> {
    if (summarizeOverlayTitleCache) {
      return Promise.resolve(summarizeOverlayTitleCache);
    }
    if (summarizeOverlayTitleInFlight) {
      return summarizeOverlayTitleInFlight;
    }

    summarizeOverlayTitleInFlight = (async () => {
      try {
        const stored = (await storageSyncGet(["contextActions"])) as {
          contextActions?: unknown;
        };
        const title = findContextActionTitle(
          stored.contextActions,
          "builtin:summarize"
        );
        summarizeOverlayTitleCache = stripSourceSuffix(title ?? "") || "要約";
      } catch {
        summarizeOverlayTitleCache = "要約";
      } finally {
        summarizeOverlayTitleInFlight = null;
      }
      return summarizeOverlayTitleCache;
    })();

    return summarizeOverlayTitleInFlight;
  }

  type ActionOverlayRequest = Extract<
    ContentRequest,
    { action: "showActionOverlay" }
  >;

  function trimmedOrEmpty(value: string | undefined): string {
    return value?.trim() ?? "";
  }

  function optionalTrimmed(value: string | undefined): string | undefined {
    const trimmed = value?.trim() ?? "";
    return trimmed || undefined;
  }

  function anchorRectBySource(
    source: SummarySource
  ): OverlayViewModel["anchorRect"] {
    return source === "selection" ? getSelectionAnchorRect() : null;
  }

  function actionOverlayPrimaryText(
    status: ActionOverlayRequest["status"],
    primary: string
  ): string {
    if (status === "ready") {
      return primary || "結果が空でした";
    }
    if (status === "error") {
      return primary || "処理に失敗しました";
    }
    return "";
  }

  function actionOverlaySecondaryText(
    status: ActionOverlayRequest["status"],
    secondary: string
  ): string {
    return status === "loading"
      ? secondary || "処理に数秒かかることがあります。"
      : secondary;
  }

  function actionOverlayEventPayload(
    mode: ActionOverlayRequest["mode"],
    status: ActionOverlayRequest["status"],
    event: ExtractedEvent | undefined
  ): ExtractedEvent | undefined {
    if (!(mode === "event" && status === "ready")) {
      return;
    }
    return event;
  }

  function showActionOverlay(
    request: Extract<ContentRequest, { action: "showActionOverlay" }>
  ): void {
    const primary = trimmedOrEmpty(request.primary);
    const secondary = trimmedOrEmpty(request.secondary);

    renderOverlay({
      open: true,
      status: request.status,
      mode: request.mode,
      source: request.source,
      title: stripSourceSuffix(request.title),
      primary: actionOverlayPrimaryText(request.status, primary),
      secondary: actionOverlaySecondaryText(request.status, secondary),
      event: actionOverlayEventPayload(
        request.mode,
        request.status,
        request.event
      ),
      calendarUrl: optionalTrimmed(request.calendarUrl),
      ics: optionalTrimmed(request.ics),
      anchorRect: anchorRectBySource(request.source),
    });
  }

  function renderSummaryOverlayWithTitle(
    request: Extract<ContentRequest, { action: "showSummaryOverlay" }>,
    title: string
  ): void {
    const summary = request.summary?.trim() ?? "";
    const error = request.error?.trim() ?? "";

    const anchorRect =
      request.source === "selection" ? getSelectionAnchorRect() : null;

    let primaryText = "";
    if (request.status === "ready") {
      primaryText = summary || "要約結果が空でした";
    } else if (request.status === "error") {
      primaryText = error || "要約に失敗しました";
    }

    let secondaryText = "";
    if (request.status === "loading") {
      secondaryText = "処理に数秒かかることがあります。";
    } else if (request.status === "error") {
      secondaryText =
        "OpenAI API Token未設定の場合は、拡張機能のポップアップ「設定」タブで設定してください。";
    }

    renderOverlay({
      open: true,
      status: request.status,
      mode: "text",
      source: request.source,
      title,
      primary: primaryText,
      secondary: secondaryText,
      anchorRect,
    });
  }

  function showSummaryOverlay(
    request: Extract<ContentRequest, { action: "showSummaryOverlay" }>
  ): void {
    const fallbackTitle = summarizeOverlayTitleCache ?? "要約";
    renderSummaryOverlayWithTitle(request, fallbackTitle);

    (async () => {
      const title = await getSummarizeOverlayTitle();
      if (title === fallbackTitle) {
        return;
      }
      renderSummaryOverlayWithTitle(request, title);
    })().catch(() => {
      // no-op
    });
  }

  // ========================================
  // 6. メッセージリスナー
  // ========================================

  chrome.runtime.onMessage.addListener(
    (
      request: ContentRequest,
      _sender: chrome.runtime.MessageSender,
      sendResponse
    ) => {
      switch (request.action) {
        case "enableTableSort": {
          enableTableSort();
          startTableObserver();
          sendResponse({ success: true });
          return;
        }
        case "showNotification": {
          showNotification(request.message);
          sendResponse({ ok: true });
          return;
        }
        case "copyToClipboard": {
          (async () => {
            const result = await copyToClipboard(request.text);
            if (result.ok && request.successMessage?.trim()) {
              const mount = ensureToastMount();
              mount.notify.success(request.successMessage.trim());
            }
            sendResponse(result);
          })().catch(() => {
            sendResponse({ ok: false, error: "コピーに失敗しました" });
          });
          return true;
        }
        case "getSummaryTargetText": {
          (async () => {
            try {
              const target = await getSummaryTargetText({
                ignoreSelection: request.ignoreSelection,
              });
              sendResponse(target);
            } catch {
              sendResponse({
                text: "",
                source: "page",
                title: document.title ?? "",
                url: window.location.href,
              } satisfies SummaryTarget);
            }
          })().catch(() => {
            // no-op
          });
          return true;
        }
        case "showSummaryOverlay": {
          showSummaryOverlay(request);
          sendResponse({ ok: true });
          return;
        }
        case "showActionOverlay": {
          showActionOverlay(request);
          sendResponse({ ok: true });
          return;
        }
        default: {
          sendResponse({ ok: false });
          return;
        }
      }
    }
  );

  // ========================================
  // 7. 自動実行ロジック（SPA URL変化も含む）
  // ========================================

  let tableConfig: { domainPatterns: string[]; autoEnableSort: boolean } = {
    domainPatterns: [],
    autoEnableSort: false,
  };

  function normalizePatterns(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  }

  function maybeEnableTableSortFromConfig(): void {
    if (tableConfig.autoEnableSort) {
      enableTableSort();
      startTableObserver();
      return;
    }
    if (
      tableConfig.domainPatterns.length > 0 &&
      matchesAnyPattern(tableConfig.domainPatterns)
    ) {
      enableTableSort();
      startTableObserver();
    }
  }

  async function refreshTableConfig(): Promise<void> {
    try {
      const data = (await storageSyncGet([
        "domainPatterns",
        "autoEnableSort",
      ])) as StorageData;
      tableConfig = {
        domainPatterns: normalizePatterns(data.domainPatterns),
        autoEnableSort: Boolean(data.autoEnableSort),
      };
    } catch {
      tableConfig = { domainPatterns: [], autoEnableSort: false };
    }
  }

  function resetSummarizeOverlayTitleState(): void {
    summarizeOverlayTitleCache = null;
    summarizeOverlayTitleInFlight = null;
  }

  async function refreshTableConfigAndMaybeEnable(): Promise<void> {
    await refreshTableConfig();
    maybeEnableTableSortFromConfig();
  }

  function handleSyncStorageChange(
    changes: Record<string, chrome.storage.StorageChange>
  ): void {
    if ("contextActions" in changes) {
      resetSummarizeOverlayTitleState();
    }

    const hasTableConfigChange =
      "domainPatterns" in changes || "autoEnableSort" in changes;
    if (!hasTableConfigChange) {
      return;
    }

    refreshTableConfigAndMaybeEnable().catch(() => {
      // no-op
    });
  }

  function handleLocalStorageChange(
    changes: Record<string, chrome.storage.StorageChange>
  ): void {
    if (!("theme" in changes)) {
      return;
    }
    const change = changes.theme as chrome.storage.StorageChange | undefined;
    currentTheme = normalizeTheme(change?.newValue);
    applyThemeToMounts(currentTheme);
  }

  refreshTableConfigAndMaybeEnable().catch(() => {
    // no-op
  });

  if (chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === "sync") {
        handleSyncStorageChange(changes);
        return;
      }

      if (areaName === "local") {
        handleLocalStorageChange(changes);
      }
    });
  }

  let lastHref = window.location.href;
  window.setInterval(() => {
    const href = window.location.href;
    if (href === lastHref) {
      return;
    }
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

      chrome.storage.sync.get(keys, (items) => {
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

      chrome.storage.local.get(keys, (items) => {
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
