import { Result } from '@praha/byethrow';
import {
  type ContextAction,
  type ContextActionKind,
  DEFAULT_CONTEXT_ACTIONS,
  normalizeContextActions,
} from './context_actions';
import { formatUtcDateTimeFromDate } from './date_utils';
import { computeEventDateRange } from './event_date_range';
import { setupPopupNavigation } from './popup/navigation';
import { ensureOpenAiTokenConfigured } from './popup/token_guard';
import type { ExtractedEvent, SummarySource } from './shared_types';
import type { LocalStorageData } from './storage/types';

(() => {
  type SyncStorageData = {
    domainPatterns?: string[];
    autoEnableSort?: boolean;
    contextActions?: ContextAction[];
  };

  type EnableResponse = {
    success: boolean;
  };

  type NotificationType = 'info' | 'error';

  type PopupToContentMessage = {
    action: 'enableTableSort';
  };

  type PopupToBackgroundTestTokenMessage = {
    action: 'testOpenAiToken';
    token?: string;
  };

  type RunContextActionRequest = {
    action: 'runContextAction';
    tabId: number;
    actionId: string;
  };

  type RunContextActionResponse =
    | { ok: true; resultType: 'text'; text: string; source: SummarySource }
    | {
        ok: true;
        resultType: 'event';
        event: ExtractedEvent;
        eventText: string;
        calendarUrl: string;
        source: SummarySource;
      }
    | { ok: false; error: string };

  type TestTokenResponse = { ok: true } | { ok: false; error: string };

  const isExtensionPage = window.location.protocol === 'chrome-extension:';
  const fallbackStoragePrefix = 'mbu:popup:';

  const start = (): void => {
    void initializePopup().catch(error => {
      // 初期化が途中で落ちると、ボタンが一切反応しないように見えるため通知しておく
      console.error('Popup initialization failed:', error);
      showNotification(
        error instanceof Error ? error.message : '初期化に失敗しました（拡張機能を再読み込みしてください）',
        'error',
      );
    });
  };

  // `popup.js` が遅れて読み込まれるケースでも初期化できるようにする
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  async function initializePopup(): Promise<void> {
    if (isExtensionPage) {
      document.body.classList.add('is-extension');
    }

    const autoEnableCheckbox = document.getElementById('auto-enable-sort') as HTMLInputElement | null;
    const enableButton = document.getElementById('enable-table-sort') as HTMLButtonElement | null;
    const addPatternButton = document.getElementById('add-pattern') as HTMLButtonElement | null;
    const patternInput = document.getElementById('pattern-input') as HTMLInputElement | null;
    const tokenInput = document.getElementById('openai-token') as HTMLInputElement | null;
    const saveTokenButton = document.getElementById('save-openai-token') as HTMLButtonElement | null;
    const clearTokenButton = document.getElementById('clear-openai-token') as HTMLButtonElement | null;
    const toggleTokenVisibilityButton = document.getElementById(
      'toggle-openai-token-visibility',
    ) as HTMLButtonElement | null;
    const testTokenButton = document.getElementById('test-openai-token') as HTMLButtonElement | null;
    const customPromptInput = document.getElementById('openai-custom-prompt') as HTMLTextAreaElement | null;
    const saveCustomPromptButton = document.getElementById('save-openai-custom-prompt') as HTMLButtonElement | null;
    const clearCustomPromptButton = document.getElementById('clear-openai-custom-prompt') as HTMLButtonElement | null;
    const actionButtons = document.getElementById('action-buttons') as HTMLDivElement | null;
    const actionSourceChip = document.getElementById('action-source-chip') as HTMLSpanElement | null;
    const actionOutputTitle = document.getElementById('action-output-title') as HTMLHeadingElement | null;
    const actionOutput = document.getElementById('action-output') as HTMLTextAreaElement | null;
    const copyActionOutputButton = document.getElementById('copy-action-output') as HTMLButtonElement | null;
    const openCalendarButton = document.getElementById('open-calendar') as HTMLButtonElement | null;
    const downloadIcsButton = document.getElementById('download-ics') as HTMLButtonElement | null;
    const actionTitleInput = document.getElementById('action-title') as HTMLInputElement | null;
    const actionKindSelect = document.getElementById('action-kind') as HTMLSelectElement | null;
    const actionPromptInput = document.getElementById('action-prompt') as HTMLTextAreaElement | null;
    const saveActionButton = document.getElementById('save-action') as HTMLButtonElement | null;
    const clearActionButton = document.getElementById('clear-action') as HTMLButtonElement | null;
    const resetActionsButton = document.getElementById('reset-actions') as HTMLButtonElement | null;
    const actionList = document.getElementById('action-list') as HTMLDivElement | null;

    let contextActions: ContextAction[] = [];
    let editingActionId: string | null = null;
    let lastCalendarUrl: string | null = null;
    let lastEvent: ExtractedEvent | null = null;

    setupPopupNavigation({ isExtensionPage, storagePrefix: fallbackStoragePrefix, document, window });

    const navigateToPane = (targetId: string): void => {
      const selector = `.nav-item[data-target="${CSS.escape(targetId)}"]`;
      const navItem = document.querySelector<HTMLElement>(selector);
      if (navItem) {
        navItem.click();
        return;
      }
      window.location.hash = `#${targetId}`;
    };

    const focusTokenInput = (): void => {
      window.setTimeout(() => {
        const tokenInput = document.getElementById('openai-token') as HTMLInputElement | null;
        tokenInput?.focus();
      }, 0);
    };

    if (autoEnableCheckbox) {
      autoEnableCheckbox.addEventListener('change', event => {
        const target = event.target as HTMLInputElement;
        void storageSyncSet({ autoEnableSort: target.checked }).catch(error => {
          showNotification(error instanceof Error ? error.message : '設定の保存に失敗しました', 'error');
        });
      });
    }

    enableButton?.addEventListener('click', async () => {
      try {
        const [tab] = await tabsQuery({
          active: true,
          currentWindow: true,
        });
        if (tab?.id === undefined) {
          showNotification('有効なタブが見つかりません', 'error');
          return;
        }

        const message: PopupToContentMessage = { action: 'enableTableSort' };

        chrome.tabs.sendMessage(tab.id, message, (response?: EnableResponse) => {
          if (response?.success) {
            showNotification('テーブルソートを有効化しました');
          }
        });
      } catch (error) {
        showNotification(error instanceof Error ? error.message : 'テーブルソートの実行に失敗しました', 'error');
      }
    });

    addPatternButton?.addEventListener('click', () => {
      void handleAddPattern();
    });

    patternInput?.addEventListener('keypress', (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        void handleAddPattern();
      }
    });

    saveTokenButton?.addEventListener('click', () => {
      void handleSaveToken(tokenInput);
    });

    clearTokenButton?.addEventListener('click', () => {
      void handleClearToken(tokenInput);
    });

    toggleTokenVisibilityButton?.addEventListener('click', () => {
      if (!tokenInput) return;
      const nextType = tokenInput.type === 'password' ? 'text' : 'password';
      tokenInput.type = nextType;
      toggleTokenVisibilityButton.textContent = nextType === 'text' ? '非表示' : '表示';
    });

    testTokenButton?.addEventListener('click', async () => {
      if (testTokenButton) testTokenButton.disabled = true;
      showNotification('OpenAI API Tokenを確認中...');
      try {
        const token = tokenInput?.value.trim() ?? '';
        const response = await sendMessageToBackground<PopupToBackgroundTestTokenMessage, TestTokenResponse>({
          action: 'testOpenAiToken',
          token: token || undefined,
        });

        if (!response.ok) {
          showNotification(response.error, 'error');
          return;
        }

        showNotification('OK: トークンは有効です');
      } catch (error) {
        showNotification(error instanceof Error ? error.message : 'トークン確認に失敗しました', 'error');
      } finally {
        if (testTokenButton) testTokenButton.disabled = false;
      }
    });

    saveCustomPromptButton?.addEventListener('click', () => {
      void handleSaveCustomPrompt(customPromptInput);
    });

    clearCustomPromptButton?.addEventListener('click', () => {
      void handleClearCustomPrompt(customPromptInput);
    });

    copyActionOutputButton?.addEventListener('click', async () => {
      const text = actionOutput?.value ?? '';
      if (!text) return;
      await navigator.clipboard.writeText(text);
      showNotification('コピーしました');
    });

    openCalendarButton?.addEventListener('click', () => {
      const url = lastCalendarUrl?.trim() ?? '';
      if (!url) return;
      if (isExtensionPage && (chrome as unknown as { tabs?: unknown }).tabs) {
        void chrome.tabs.create({ url });
        return;
      }
      window.open(url, '_blank', 'noopener');
    });

    downloadIcsButton?.addEventListener('click', () => {
      if (!lastEvent) return;
      const ics = buildIcs(lastEvent);
      if (!ics) {
        showNotification('icsの生成に失敗しました', 'error');
        return;
      }

      const baseName = sanitizeFileName(lastEvent.title?.trim() || 'event');
      const fileName = `${baseName}.ics`;
      const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      showNotification('.icsをダウンロードしました');
    });

    const clearActionForm = (): void => {
      editingActionId = null;
      if (actionTitleInput) actionTitleInput.value = '';
      if (actionPromptInput) actionPromptInput.value = '';
      if (actionKindSelect) actionKindSelect.value = 'text';
    };

    const setEditingAction = (targetAction: ContextAction | null): void => {
      editingActionId = targetAction?.id ?? null;
      if (!targetAction) {
        clearActionForm();
        return;
      }
      if (actionTitleInput) actionTitleInput.value = targetAction.title;
      if (actionPromptInput) actionPromptInput.value = targetAction.prompt;
      if (actionKindSelect) actionKindSelect.value = targetAction.kind;
    };

    const persistContextActions = async (next: ContextAction[]): Promise<void> => {
      contextActions = next;
      await storageSyncSet({ contextActions: next });
      renderContextActions();
    };

    const renderContextActions = (): void => {
      if (actionButtons) {
        actionButtons.innerHTML = '';
        contextActions.forEach(action => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = action.kind === 'event' ? 'btn btn-ghost' : 'btn btn-primary';
          button.dataset.actionId = action.id;
          button.textContent = action.title;
          actionButtons.appendChild(button);
        });
      }

      if (actionList) {
        if (contextActions.length === 0) {
          actionList.innerHTML = '<p class="empty-message">登録されたアクションはありません</p>';
        } else {
          actionList.innerHTML = contextActions
            .map(action => {
              const kindLabel = action.kind === 'event' ? 'カレンダー' : 'テキスト';
              return `
	                <div class="pattern-item" data-action-id="${escapeHtml(action.id)}">
	                  <div class="pattern-text">
	                    <div><strong>${escapeHtml(action.title)}</strong></div>
	                    <div class="muted">${escapeHtml(kindLabel)}</div>
	                  </div>
	                  <div style="display:flex; gap:8px; align-items:center;">
	                    <button type="button" class="btn btn-ghost btn-small" data-action="edit" data-action-id="${escapeHtml(action.id)}">編集</button>
	                    <button type="button" class="btn-delete btn-small" data-action="delete" data-action-id="${escapeHtml(action.id)}">削除</button>
	                  </div>
	                </div>
	              `;
            })
            .join('');
        }
      }
    };

    const ensureContextActions = async (): Promise<void> => {
      try {
        const data = (await storageSyncGet(['contextActions'])) as SyncStorageData;
        const normalized = normalizeContextActions(data.contextActions);
        if (normalized.length > 0) {
          contextActions = normalized;
          renderContextActions();
          return;
        }

        contextActions = DEFAULT_CONTEXT_ACTIONS;
        await storageSyncSet({ contextActions });
        renderContextActions();
      } catch (error) {
        contextActions = DEFAULT_CONTEXT_ACTIONS;
        renderContextActions();
        showNotification(error instanceof Error ? error.message : 'アクションの読み込みに失敗しました', 'error');
      }
    };

    const runContextAction = async (actionId: string): Promise<void> => {
      const action = contextActions.find(item => item.id === actionId);
      if (!action) {
        showNotification('アクションが見つかりません', 'error');
        return;
      }

      const tokenConfigured = await ensureOpenAiTokenConfigured({
        storageLocalGet,
        showNotification,
        navigateToPane,
        focusTokenInput,
      });
      if (Result.isFailure(tokenConfigured)) {
        return;
      }

      if (actionOutputTitle) actionOutputTitle.textContent = action.title;
      if (actionOutput) actionOutput.value = '実行中...';
      if (copyActionOutputButton) copyActionOutputButton.disabled = true;
      if (openCalendarButton) openCalendarButton.hidden = true;
      if (downloadIcsButton) downloadIcsButton.hidden = true;
      lastCalendarUrl = null;
      lastEvent = null;

      try {
        const [tab] = await tabsQuery({
          active: true,
          currentWindow: true,
        });
        if (tab?.id === undefined) {
          showNotification('有効なタブが見つかりません', 'error');
          if (actionOutput) actionOutput.value = '';
          return;
        }

        const response = await sendMessageToBackground<RunContextActionRequest, RunContextActionResponse>({
          action: 'runContextAction',
          tabId: tab.id,
          actionId,
        });

        if (!response.ok) {
          showNotification(response.error, 'error');
          if (actionOutput) actionOutput.value = '';
          return;
        }

        if (actionSourceChip) {
          actionSourceChip.textContent = response.source === 'selection' ? '選択範囲' : 'ページ本文';
        }

        if (response.resultType === 'event') {
          if (actionOutput) actionOutput.value = response.eventText;
          lastCalendarUrl = response.calendarUrl;
          lastEvent = response.event;
          if (openCalendarButton) openCalendarButton.hidden = false;
          if (downloadIcsButton) downloadIcsButton.hidden = false;
        } else if (actionOutput) actionOutput.value = response.text;

        if (copyActionOutputButton) copyActionOutputButton.disabled = false;
        showNotification('完了しました');
      } catch (error) {
        showNotification(error instanceof Error ? error.message : 'アクションの実行に失敗しました', 'error');
        if (actionOutput) actionOutput.value = '';
      }
    };

    actionButtons?.addEventListener('click', event => {
      const target = event.target as HTMLElement | null;
      const actionId = target?.closest<HTMLElement>('button')?.dataset.actionId;
      if (!actionId) return;
      void runContextAction(actionId);
    });

    actionList?.addEventListener('click', event => {
      const target = event.target as HTMLElement | null;
      const action = target?.closest<HTMLElement>('button')?.dataset.action;
      const actionId = target?.closest<HTMLElement>('button')?.dataset.actionId;
      if (!(action && actionId)) return;

      if (action === 'edit') {
        const found = contextActions.find(item => item.id === actionId) ?? null;
        setEditingAction(found);
        return;
      }

      if (action === 'delete') {
        void persistContextActions(contextActions.filter(item => item.id !== actionId));
        if (editingActionId === actionId) {
          clearActionForm();
        }
      }
    });

    saveActionButton?.addEventListener('click', () => {
      void (async () => {
        const title = actionTitleInput?.value.trim() ?? '';
        const kind = (actionKindSelect?.value as ContextActionKind | undefined) ?? 'text';
        const prompt = actionPromptInput?.value ?? '';

        if (!title) {
          showNotification('タイトルを入力してください', 'error');
          return;
        }

        if (kind === 'text' && !prompt.trim()) {
          showNotification('プロンプトを入力してください', 'error');
          return;
        }

        const next: ContextAction = {
          id:
            editingActionId ||
            `user:${
              typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
                ? crypto.randomUUID()
                : String(Date.now())
            }`,
          title,
          kind,
          prompt,
        };

        const filtered = contextActions.filter(item => item.id !== next.id);
        await persistContextActions([next, ...filtered]);
        setEditingAction(null);
        showNotification('保存しました');
      })();
    });

    clearActionButton?.addEventListener('click', () => {
      setEditingAction(null);
    });

    resetActionsButton?.addEventListener('click', () => {
      const ok = window.confirm('登録アクションを初期状態に戻します。よろしいですか？');
      if (!ok) return;
      void (async () => {
        await persistContextActions([...DEFAULT_CONTEXT_ACTIONS]);
        setEditingAction(null);
        showNotification('リセットしました');
      })();
    });

    // 初期表示のロード（失敗しても、ボタン操作自体は動くようにしておく）
    try {
      const settings = (await storageSyncGet(['autoEnableSort'])) as SyncStorageData;
      if (autoEnableCheckbox) {
        autoEnableCheckbox.checked = settings.autoEnableSort ?? false;
      }
    } catch (error) {
      showNotification(error instanceof Error ? error.message : '設定の読み込みに失敗しました', 'error');
    }

    try {
      await loadPatterns();
    } catch (error) {
      showNotification(error instanceof Error ? error.message : 'ドメインパターンの読み込みに失敗しました', 'error');
    }

    try {
      await loadOpenAiCustomPrompt(customPromptInput);
    } catch (error) {
      showNotification(error instanceof Error ? error.message : 'カスタムプロンプトの読み込みに失敗しました', 'error');
    }

    try {
      await loadOpenAiToken(tokenInput);
    } catch (error) {
      showNotification(error instanceof Error ? error.message : 'OpenAIトークンの読み込みに失敗しました', 'error');
    }

    await ensureContextActions();
  }

  function showNotification(message: string, type: NotificationType = 'info'): void {
    const notification = document.createElement('div');
    notification.textContent = message;

    const bgColor = type === 'error' ? '#e53935' : '#3ecf8e';

    notification.style.cssText = `
    position: fixed;
    top: 12px;
    right: 12px;
    background: ${bgColor};
    color: white;
    padding: 10px 14px;
    border-radius: 10px;
    font-size: 13px;
    z-index: 10000;
    box-shadow: 0 10px 24px rgba(0,0,0,0.2);
  `;
    document.body.appendChild(notification);

    window.setTimeout(() => notification.remove(), 2000);
  }

  function sendMessageToBackground<TRequest, TResponse>(message: TRequest): Promise<TResponse> {
    if (!(isExtensionPage && (chrome as unknown as { runtime?: unknown }).runtime)) {
      return Promise.reject(new Error('拡張機能として開いてください（chrome-extension://...）'));
    }
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
  // ドメインパターン管理機能
  // ========================================

  function fallbackStorageGet(scope: 'sync' | 'local', keys: string[]): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    keys.forEach(key => {
      const raw = window.localStorage.getItem(`${fallbackStoragePrefix}${scope}:${key}`);
      if (raw === null) return;
      try {
        data[key] = JSON.parse(raw) as unknown;
      } catch {
        data[key] = raw;
      }
    });
    return data;
  }

  function fallbackStorageSet(scope: 'sync' | 'local', items: Record<string, unknown>): void {
    Object.entries(items).forEach(([key, value]) => {
      window.localStorage.setItem(`${fallbackStoragePrefix}${scope}:${key}`, JSON.stringify(value));
    });
  }

  function fallbackStorageRemove(scope: 'sync' | 'local', keys: string[] | string): void {
    const list = Array.isArray(keys) ? keys : [keys];
    list.forEach(key => {
      window.localStorage.removeItem(`${fallbackStoragePrefix}${scope}:${key}`);
    });
  }

  function storageSyncGet(keys: string[]): Promise<unknown> {
    if (!(isExtensionPage && (chrome as unknown as { storage?: unknown }).storage)) {
      return Promise.resolve(fallbackStorageGet('sync', keys));
    }
    return new Promise((resolve, reject) => {
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

  function storageSyncSet(items: Record<string, unknown>): Promise<void> {
    if (!(isExtensionPage && (chrome as unknown as { storage?: unknown }).storage)) {
      fallbackStorageSet('sync', items);
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      chrome.storage.sync.set(items, () => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message));
          return;
        }
        resolve();
      });
    });
  }

  function storageLocalGet(keys: string[]): Promise<unknown> {
    if (!(isExtensionPage && (chrome as unknown as { storage?: unknown }).storage)) {
      return Promise.resolve(fallbackStorageGet('local', keys));
    }
    return new Promise((resolve, reject) => {
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
    if (!(isExtensionPage && (chrome as unknown as { storage?: unknown }).storage)) {
      fallbackStorageSet('local', items);
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
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

  function storageLocalRemove(keys: string[] | string): Promise<void> {
    if (!(isExtensionPage && (chrome as unknown as { storage?: unknown }).storage)) {
      fallbackStorageRemove('local', keys);
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      chrome.storage.local.remove(keys, () => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message));
          return;
        }
        resolve();
      });
    });
  }

  function tabsQuery(queryInfo: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]> {
    if (!(isExtensionPage && (chrome as unknown as { tabs?: unknown }).tabs)) {
      return Promise.reject(new Error('拡張機能として開いてください（chrome-extension://...）'));
    }
    return new Promise((resolve, reject) => {
      chrome.tabs.query(queryInfo, tabs => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message));
          return;
        }
        resolve(tabs);
      });
    });
  }

  async function loadPatterns(): Promise<void> {
    const { domainPatterns = [] } = (await storageSyncGet(['domainPatterns'])) as SyncStorageData;
    renderPatternList(domainPatterns);
  }

  function renderPatternList(patterns: string[]): void {
    const listContainer = document.getElementById('pattern-list') as HTMLDivElement | null;

    if (!listContainer) return;

    if (patterns.length === 0) {
      listContainer.innerHTML = '<p class="empty-message">登録されたパターンはありません</p>';
      return;
    }

    listContainer.innerHTML = patterns
      .map(
        (pattern, index) => `
      <div class="pattern-item" data-index="${index}">
        <span class="pattern-text">${escapeHtml(pattern)}</span>
        <button class="btn-delete" data-index="${index}">削除</button>
      </div>
    `,
      )
      .join('');

    listContainer.querySelectorAll('.btn-delete').forEach(btn => {
      const button = btn as HTMLButtonElement;
      button.addEventListener('click', handleDeletePattern);
    });
  }

  async function handleAddPattern(): Promise<void> {
    const input = document.getElementById('pattern-input') as HTMLInputElement | null;
    const pattern = input?.value.trim() ?? '';

    if (!pattern) {
      showNotification('パターンを入力してください', 'error');
      return;
    }

    if (!validatePattern(pattern)) {
      showNotification('無効なパターンです', 'error');
      return;
    }

    let domainPatterns: string[] = [];
    try {
      ({ domainPatterns = [] } = (await storageSyncGet(['domainPatterns'])) as SyncStorageData);
    } catch (error) {
      showNotification(error instanceof Error ? error.message : 'パターンの読み込みに失敗しました', 'error');
      return;
    }

    if (domainPatterns.includes(pattern)) {
      showNotification('このパターンは既に登録されています', 'error');
      return;
    }

    if (domainPatterns.length >= 50) {
      showNotification('パターンは最大50個まで登録できます', 'error');
      return;
    }

    try {
      domainPatterns.push(pattern);
      await storageSyncSet({ domainPatterns });

      if (input) {
        input.value = '';
      }
      renderPatternList(domainPatterns);
      showNotification('パターンを追加しました');
    } catch (error) {
      if (error instanceof Error && error.message.includes('QUOTA_BYTES')) {
        showNotification('ストレージ容量を超えました', 'error');
      } else {
        showNotification('パターンの追加に失敗しました', 'error');
      }
    }
  }

  async function handleDeletePattern(event: Event): Promise<void> {
    const target = event.target as HTMLButtonElement | null;
    const index = target?.dataset.index ? Number(target.dataset.index) : Number.NaN;

    if (Number.isNaN(index)) {
      showNotification('削除に失敗しました', 'error');
      return;
    }

    let domainPatterns: string[] = [];
    try {
      ({ domainPatterns = [] } = (await storageSyncGet(['domainPatterns'])) as SyncStorageData);
    } catch (error) {
      showNotification(error instanceof Error ? error.message : '削除に失敗しました', 'error');
      return;
    }

    domainPatterns.splice(index, 1);
    await storageSyncSet({ domainPatterns });

    renderPatternList(domainPatterns);
    showNotification('パターンを削除しました');
  }

  function validatePattern(pattern: string): boolean {
    if (pattern.length === 0 || pattern.length > 200) return false;

    if (/\s/.test(pattern)) return false;

    // URLっぽい文字（? # & = % など）も許可して、コピペしたURLをそのまま登録できるようにする
    // RFC3986 の予約文字 + % + ワイルドカード(*) を許可
    if (!/^[A-Za-z0-9._~:/?#\][@!$&'()*+,;=%*-]+$/.test(pattern)) {
      return false;
    }

    return true;
  }

  function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function sanitizeFileName(name: string): string {
    const trimmed = name.trim() || 'event';
    return trimmed.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80) || 'event';
  }

  function buildIcs(event: ExtractedEvent): string | null {
    const title = event.title?.trim() || '予定';
    const description = event.description?.trim() || '';
    const location = event.location?.trim() || '';

    const escapeIcsText = (value: string): string =>
      value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r/g, '');

    const foldLine = (line: string): string => {
      const max = 75;
      if (line.length <= max) return line;
      let out = '';
      for (let i = 0; i < line.length; i += max) {
        out += (i === 0 ? '' : '\r\n ') + line.slice(i, i + max);
      }
      return out;
    };

    const range = computeEventDateRange({ start: event.start ?? '', end: event.end, allDay: event.allDay });
    if (!range) return null;

    const dtStartLine =
      range.kind === 'allDay' ? `DTSTART;VALUE=DATE:${range.startYyyyMmDd}` : `DTSTART:${range.startUtc}`;
    const dtEndLine =
      range.kind === 'allDay' ? `DTEND;VALUE=DATE:${range.endYyyyMmDdExclusive}` : `DTEND:${range.endUtc}`;

    const uid =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const dtStamp = formatUtcDateTimeFromDate(new Date());
    if (!dtStamp) return null;

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//my-browser-utils//EN',
      'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${dtStamp}`,
      dtStartLine,
      dtEndLine,
      `SUMMARY:${escapeIcsText(title)}`,
      location ? `LOCATION:${escapeIcsText(location)}` : '',
      description ? `DESCRIPTION:${escapeIcsText(description)}` : '',
      'END:VEVENT',
      'END:VCALENDAR',
    ].filter(Boolean);

    return lines.map(foldLine).join('\r\n') + '\r\n';
  }

  async function loadOpenAiToken(input: HTMLInputElement | null): Promise<void> {
    if (!input) return;
    const { openaiApiToken = '' } = (await storageLocalGet(['openaiApiToken'])) as LocalStorageData;
    input.value = openaiApiToken;
  }

  async function handleSaveToken(input: HTMLInputElement | null): Promise<void> {
    const token = input?.value.trim() ?? '';
    if (!token) {
      showNotification('トークンを入力してください', 'error');
      return;
    }

    try {
      await storageLocalSet({ openaiApiToken: token });
      showNotification('OpenAIトークンを保存しました');
    } catch (error) {
      showNotification(error instanceof Error ? error.message : '保存に失敗しました', 'error');
    }
  }

  async function handleClearToken(input: HTMLInputElement | null): Promise<void> {
    if (input) {
      input.value = '';
    }
    try {
      await storageLocalRemove('openaiApiToken');
      showNotification('トークンをクリアしました');
    } catch (error) {
      showNotification(error instanceof Error ? error.message : 'クリアに失敗しました', 'error');
    }
  }

  async function loadOpenAiCustomPrompt(input: HTMLTextAreaElement | null): Promise<void> {
    if (!input) return;
    const { openaiCustomPrompt = '' } = (await storageLocalGet(['openaiCustomPrompt'])) as LocalStorageData;
    input.value = openaiCustomPrompt;
  }

  async function handleSaveCustomPrompt(input: HTMLTextAreaElement | null): Promise<void> {
    const prompt = input?.value ?? '';
    try {
      await storageLocalSet({ openaiCustomPrompt: prompt });
      showNotification('カスタムプロンプトを保存しました');
    } catch (error) {
      showNotification(error instanceof Error ? error.message : '保存に失敗しました', 'error');
    }
  }

  async function handleClearCustomPrompt(input: HTMLTextAreaElement | null): Promise<void> {
    if (input) input.value = '';
    try {
      await storageLocalRemove('openaiCustomPrompt');
      showNotification('カスタムプロンプトをクリアしました');
    } catch (error) {
      showNotification(error instanceof Error ? error.message : 'クリアに失敗しました', 'error');
    }
  }
})();
