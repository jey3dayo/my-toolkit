// Background Service Worker

import { addHours } from 'date-fns';
import {
  formatLocalYyyyMmDdFromDate,
  formatUtcDateTimeFromDate,
  nextDateYyyyMmDd,
  parseDateOnlyToYyyyMmDd,
  parseDateTimeLoose,
} from './date_utils';

type SummarySource = 'selection' | 'page';

type SummaryTarget = {
  text: string;
  source: SummarySource;
  title?: string;
  url?: string;
};

type ContextActionKind = 'text' | 'event';

type ContextAction = {
  id: string;
  title: string;
  kind: ContextActionKind;
  prompt: string;
};

type ContentScriptMessage =
  | { action: 'showNotification'; message: string }
  | { action: 'getSummaryTargetText' }
  | {
      action: 'showSummaryOverlay';
      status: 'loading' | 'ready' | 'error';
      source: SummarySource;
      summary?: string;
      error?: string;
    };

type BackgroundRequest = { action: 'summarizeTab'; tabId: number } | { action: 'runContextAction'; tabId: number; actionId: string };

type BackgroundResponse = { ok: true; summary: string; source: SummarySource } | { ok: false; error: string };

type RunContextActionResponse =
  | { ok: true; resultType: 'text'; text: string; source: SummarySource }
  | { ok: true; resultType: 'event'; event: ExtractedEvent; eventText: string; calendarUrl: string; source: SummarySource }
  | { ok: false; error: string };

type LocalStorageData = {
  openaiApiToken?: string;
  openaiCustomPrompt?: string;
};

type SyncStorageData = {
  contextActions?: ContextAction[];
};

type ExtractedEvent = {
  title: string;
  start: string;
  end?: string;
  allDay?: boolean;
  location?: string;
  description?: string;
};

const CONTEXT_MENU_ROOT_ID = 'mbu-root';
const CONTEXT_MENU_ACTION_PREFIX = 'mbu-action:';

const DEFAULT_CONTEXT_ACTIONS: ContextAction[] = [
  {
    id: 'builtin:summarize',
    title: '要約',
    kind: 'text',
    prompt: [
      '次のテキストを日本語で要約してください。',
      '',
      '要件:',
      '- 重要ポイントを箇条書き(3〜7個)',
      '- 最後に一文で結論/要約',
      '- 事実と推測を混同しない',
      '',
      '{{text}}',
    ].join('\n'),
  },
  {
    id: 'builtin:translate-ja',
    title: '日本語に翻訳',
    kind: 'text',
    prompt: ['次のテキストを自然な日本語に翻訳してください。', '', '{{text}}'].join('\n'),
  },
  {
    id: 'builtin:calendar',
    title: 'カレンダー登録する',
    kind: 'event',
    prompt: '',
  },
];

chrome.runtime.onInstalled.addListener(() => {
  console.log('My Browser Utils installed');
  void refreshContextMenus();
});

chrome.runtime.onStartup.addListener(() => {
  void refreshContextMenus();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'sync') return;
  if (!('contextActions' in changes)) return;
  void refreshContextMenus();
});

void refreshContextMenus();

chrome.contextMenus.onClicked.addListener((info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab) => {
  if (typeof info.menuItemId !== 'string') return;
  if (!info.menuItemId.startsWith(CONTEXT_MENU_ACTION_PREFIX)) return;

  const tabId = tab?.id;
  if (tabId === undefined) {
    return;
  }

  const menuItemId = info.menuItemId;

  void (async () => {
    const selection = info.selectionText?.trim() ?? '';
    const initialSource: SummarySource = selection ? 'selection' : 'page';
    const actionId = menuItemId.slice(CONTEXT_MENU_ACTION_PREFIX.length);

    try {
      const actions = await ensureContextActionsInitialized();
      const action = actions.find(item => item.id === actionId);
      if (!action) {
        await sendMessageToTab(tabId, {
          action: 'showActionOverlay',
          status: 'error',
          mode: 'text',
          source: initialSource,
          title: 'My Browser Utils',
          primary: 'アクションが見つかりません（ポップアップで再保存してください）',
        });
        return;
      }

      const titleSuffix = initialSource === 'selection' ? '選択範囲' : 'ページ本文';
      await sendMessageToTab(tabId, {
        action: 'showActionOverlay',
        status: 'loading',
        mode: action.kind === 'event' ? 'event' : 'text',
        source: initialSource,
        title: `${action.title}（${titleSuffix}）`,
      });

      const target: SummaryTarget = selection
        ? {
            text: selection,
            source: 'selection',
            title: tab?.title,
            url: tab?.url,
          }
        : await sendMessageToTab(tabId, { action: 'getSummaryTargetText' });

      const resolvedSuffix = target.source === 'selection' ? '選択範囲' : 'ページ本文';
      const resolvedTitle = `${action.title}（${resolvedSuffix}）`;

      if (action.kind === 'event') {
        const extraInstruction = action.prompt?.trim() ? renderInstructionTemplate(action.prompt, target) : undefined;
        const result = await extractEventWithOpenAI(target, extraInstruction);
        if (!result.ok) {
          await sendMessageToTab(tabId, {
            action: 'showActionOverlay',
            status: 'error',
            mode: 'event',
            source: target.source,
            title: resolvedTitle,
            primary: result.error,
            secondary: 'OpenAI API Token未設定の場合は、拡張機能のポップアップ「設定」タブで設定してください。',
          });
          return;
        }

        const calendarUrl = buildGoogleCalendarUrl(result.event);
        if (!calendarUrl) {
          await sendMessageToTab(tabId, {
            action: 'showActionOverlay',
            status: 'error',
            mode: 'event',
            source: target.source,
            title: resolvedTitle,
            primary: `日時の解析に失敗しました（Googleカレンダーリンクを生成できません）\nstart: ${result.event.start}${
              result.event.end ? `\nend: ${result.event.end}` : ''
            }`,
          });
          return;
        }

        await sendMessageToTab(tabId, {
          action: 'showActionOverlay',
          status: 'ready',
          mode: 'event',
          source: target.source,
          title: resolvedTitle,
          primary: formatEventText(result.event),
          calendarUrl,
        });
        return;
      }

      const prompt = action.prompt.trim();
      if (!prompt) {
        await sendMessageToTab(tabId, {
          action: 'showActionOverlay',
          status: 'error',
          mode: 'text',
          source: target.source,
          title: resolvedTitle,
          primary: 'プロンプトが空です',
        });
        return;
      }

      const result = await runPromptActionWithOpenAI(target, prompt);
      if (!result.ok) {
        await sendMessageToTab(tabId, {
          action: 'showActionOverlay',
          status: 'error',
          mode: 'text',
          source: target.source,
          title: resolvedTitle,
          primary: result.error,
          secondary: 'OpenAI API Token未設定の場合は、拡張機能のポップアップ「設定」タブで設定してください。',
        });
        return;
      }

      await sendMessageToTab(tabId, {
        action: 'showActionOverlay',
        status: 'ready',
        mode: 'text',
        source: target.source,
        title: resolvedTitle,
        primary: result.text,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '要約に失敗しました';
      await sendMessageToTab(tabId, {
        action: 'showActionOverlay',
        status: 'error',
        mode: 'text',
        source: initialSource,
        title: 'My Browser Utils',
        primary: message,
      }).catch(() => {
        // コンテンツスクリプトに送れないページでは、黙って諦める
      });
    }
  })();
});

async function refreshContextMenus(): Promise<void> {
  await new Promise<void>(resolve => {
    chrome.contextMenus.removeAll(() => resolve());
  });

  chrome.contextMenus.create({
    id: CONTEXT_MENU_ROOT_ID,
    title: 'My Browser Utils',
    contexts: ['page', 'selection'],
  });

  const actions = await ensureContextActionsInitialized();
  actions.forEach(action => {
    chrome.contextMenus.create({
      id: `${CONTEXT_MENU_ACTION_PREFIX}${action.id}`,
      parentId: CONTEXT_MENU_ROOT_ID,
      title: action.title,
      contexts: ['page', 'selection'],
    });
  });
}

async function ensureContextActionsInitialized(): Promise<ContextAction[]> {
  const stored = (await storageSyncGet(['contextActions'])) as SyncStorageData;
  const existing = normalizeContextActions(stored.contextActions);
  if (existing.length > 0) return existing;
  await storageSyncSet({ contextActions: DEFAULT_CONTEXT_ACTIONS });
  return DEFAULT_CONTEXT_ACTIONS;
}

chrome.runtime.onMessage.addListener(
  (
    request:
      | BackgroundRequest
      | { action: 'summarizeText'; target: SummaryTarget }
      | { action: 'testOpenAiToken'; token?: string }
      | { action: 'summarizeEvent'; target: SummaryTarget },
    _sender: chrome.runtime.MessageSender,
    sendResponse: (
      response?:
        | BackgroundResponse
        | RunContextActionResponse
        | { ok: true }
        | { ok: false; error: string }
        | {
            ok: true;
            event: ExtractedEvent;
            calendarUrl: string;
            eventText: string;
          },
    ) => void,
  ) => {
    if (request.action === 'summarizeTab') {
      void (async () => {
        try {
          const target = await sendMessageToTab<ContentScriptMessage, SummaryTarget>(request.tabId, {
            action: 'getSummaryTargetText',
          });

          const result = await summarizeWithOpenAI(target);
          sendResponse(result);
        } catch (error) {
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : '要約に失敗しました',
          });
        }
      })();
      return true;
    }

    if (request.action === 'summarizeText') {
      void (async () => {
        try {
          const result = await summarizeWithOpenAI(request.target);
          sendResponse(result);
        } catch (error) {
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : '要約に失敗しました',
          });
        }
      })();
      return true;
    }

    if (request.action === 'runContextAction') {
      void (async () => {
        try {
          const target = await sendMessageToTab<ContentScriptMessage, SummaryTarget>(request.tabId, {
            action: 'getSummaryTargetText',
          });

          const actions = await loadContextActions();
          const action = actions.find(item => item.id === request.actionId);
          if (!action) {
            sendResponse({ ok: false, error: 'アクションが見つかりません（ポップアップで再保存してください）' });
            return;
          }

          if (action.kind === 'event') {
            const extraInstruction = action.prompt?.trim() ? renderInstructionTemplate(action.prompt, target) : undefined;
            const result = await extractEventWithOpenAI(target, extraInstruction);
            if (!result.ok) {
              sendResponse(result);
              return;
            }

            const calendarUrl = buildGoogleCalendarUrl(result.event);
            if (!calendarUrl) {
              sendResponse({
                ok: false,
                error: `日時の解析に失敗しました（Googleカレンダーリンクを生成できません）\nstart: ${result.event.start}${
                  result.event.end ? `\nend: ${result.event.end}` : ''
                }`,
              });
              return;
            }

            sendResponse({
              ok: true,
              resultType: 'event',
              event: result.event,
              calendarUrl,
              eventText: formatEventText(result.event),
              source: target.source,
            });
            return;
          }

          const prompt = action.prompt.trim();
          if (!prompt) {
            sendResponse({ ok: false, error: 'プロンプトが空です' });
            return;
          }

          const result = await runPromptActionWithOpenAI(target, prompt);
          if (!result.ok) {
            sendResponse({ ok: false, error: result.error });
            return;
          }

          sendResponse({
            ok: true,
            resultType: 'text',
            text: result.text,
            source: target.source,
          });
        } catch (error) {
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : 'アクションの実行に失敗しました',
          });
        }
      })();
      return true;
    }

    if (request.action === 'testOpenAiToken') {
      void (async () => {
        try {
          const result = await testOpenAiToken(request.token);
          sendResponse(result);
        } catch (error) {
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : 'トークン確認に失敗しました',
          });
        }
      })();
      return true;
    }

    if (request.action === 'summarizeEvent') {
      void (async () => {
        try {
          const result = await extractEventWithOpenAI(request.target);
          if (!result.ok) {
            sendResponse(result);
            return;
          }

          const calendarUrl = buildGoogleCalendarUrl(result.event);
          if (!calendarUrl) {
            sendResponse({
              ok: false,
              error: `日時の解析に失敗しました（Googleカレンダーリンクを生成できません）\nstart: ${result.event.start}${
                result.event.end ? `\nend: ${result.event.end}` : ''
              }`,
            });
            return;
          }

          sendResponse({
            ok: true,
            event: result.event,
            calendarUrl,
            eventText: formatEventText(result.event),
          });
        } catch (error) {
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : 'イベント要約に失敗しました',
          });
        }
      })();
      return true;
    }

    return true;
  },
);

function sendMessageToTab<TRequest, TResponse>(tabId: number, message: TRequest): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response: TResponse) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(`このページでは実行できません（${err.message}）`));
        return;
      }
      resolve(response);
    });
  });
}

async function summarizeWithOpenAI(target: SummaryTarget): Promise<BackgroundResponse> {
  const { openaiApiToken, openaiCustomPrompt } = (await storageLocalGet([
    'openaiApiToken',
    'openaiCustomPrompt',
  ])) as LocalStorageData;

  if (!openaiApiToken) {
    return {
      ok: false,
      error: 'OpenAI API Tokenが未設定です（ポップアップの「設定」タブで設定してください）',
    };
  }

  const MAX_INPUT_CHARS = 20000;
  const rawText = target.text.trim();
  if (!rawText) {
    return { ok: false, error: '要約対象のテキストが見つかりませんでした' };
  }

  const clippedText = rawText.length > MAX_INPUT_CHARS ? `${rawText.slice(0, MAX_INPUT_CHARS)}\n\n(以下略)` : rawText;

  const meta = target.title || target.url ? `\n\n---\nタイトル: ${target.title ?? '-'}\nURL: ${target.url ?? '-'}` : '';

  const body = {
    model: 'gpt-4o-mini',
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content: [
          'あなたは日本語の要約アシスタントです。入力テキストを読み、要点を短く整理して出力してください。',
          openaiCustomPrompt?.trim() ? `\n\nユーザーの追加指示:\n${openaiCustomPrompt.trim()}` : '',
        ]
          .join('')
          .trim(),
      },
      {
        role: 'user',
        content: [
          '次のテキストを日本語で要約してください。',
          '',
          '要件:',
          '- 重要ポイントを箇条書き(3〜7個)',
          '- 最後に一文で結論/要約',
          '- 事実と推測を混同しない',
          '',
          clippedText + meta,
        ].join('\n'),
      },
    ],
  };

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiApiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof json === 'object' &&
      json !== null &&
      'error' in json &&
      typeof (json as { error?: unknown }).error === 'object' &&
      (json as { error: { message?: unknown } }).error !== null &&
      typeof (json as { error: { message?: unknown } }).error.message === 'string'
        ? (json as { error: { message: string } }).error.message
        : `OpenAI APIエラー: ${response.status}`;
    return { ok: false, error: message };
  }

  const summary = extractChatCompletionText(json);
  if (!summary) {
    return { ok: false, error: '要約結果の取得に失敗しました' };
  }

  return { ok: true, summary, source: target.source };
}

async function loadContextActions(): Promise<ContextAction[]> {
  const data = (await storageSyncGet(['contextActions'])) as SyncStorageData;
  return normalizeContextActions(data.contextActions);
}

function normalizeContextActions(value: unknown): ContextAction[] {
  if (!Array.isArray(value)) return [];
  const actions: ContextAction[] = [];
  value.forEach(item => {
    if (typeof item !== 'object' || item === null) return;
    const raw = item as Partial<ContextAction>;
    const id = typeof raw.id === 'string' ? raw.id.trim() : '';
    const title = typeof raw.title === 'string' ? raw.title.trim() : '';
    const kind = raw.kind === 'event' ? 'event' : raw.kind === 'text' ? 'text' : null;
    const prompt = typeof raw.prompt === 'string' ? raw.prompt : '';
    if (!id || !title || !kind) return;
    actions.push({ id, title, kind, prompt });
  });
  return actions;
}

async function runPromptActionWithOpenAI(
  target: SummaryTarget,
  promptTemplate: string,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const { openaiApiToken, openaiCustomPrompt } = (await storageLocalGet([
    'openaiApiToken',
    'openaiCustomPrompt',
  ])) as LocalStorageData;

  if (!openaiApiToken) {
    return {
      ok: false,
      error: 'OpenAI API Tokenが未設定です（ポップアップの「設定」タブで設定してください）',
    };
  }

  const MAX_INPUT_CHARS = 20000;
  const rawText = target.text.trim();
  if (!rawText) {
    return { ok: false, error: '対象のテキストが見つかりませんでした' };
  }

  const clippedText = rawText.length > MAX_INPUT_CHARS ? `${rawText.slice(0, MAX_INPUT_CHARS)}\n\n(以下略)` : rawText;

  const metaLines: string[] = [];
  if (target.title) metaLines.push(`タイトル: ${target.title}`);
  if (target.url) metaLines.push(`URL: ${target.url}`);
  const meta = metaLines.length > 0 ? `\n\n---\n${metaLines.join('\n')}` : '';

  const variables: Record<string, string> = {
    text: clippedText,
    title: target.title ?? '',
    url: target.url ?? '',
    source: target.source,
  };

  let rendered = promptTemplate;
  Object.entries(variables).forEach(([key, value]) => {
    rendered = rendered.split(`{{${key}}}`).join(value);
  });

  const needsText = !promptTemplate.includes('{{text}}');
  const needsMeta = !(promptTemplate.includes('{{title}}') || promptTemplate.includes('{{url}}'));
  const userContent = [rendered.trim(), needsText ? `\n\n${clippedText}` : '', needsMeta ? meta : ''].join('').trim();

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiApiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: [
            'あなたはユーザーの「Context Action」を実行するアシスタントです。指示に従い、必要な結果だけを簡潔に出力してください。',
            openaiCustomPrompt?.trim() ? `\n\nユーザーの追加指示:\n${openaiCustomPrompt.trim()}` : '',
          ]
            .join('')
            .trim(),
        },
        { role: 'user', content: userContent },
      ],
    }),
  });

  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof json === 'object' &&
      json !== null &&
      'error' in json &&
      typeof (json as { error?: unknown }).error === 'object' &&
      (json as { error: { message?: unknown } }).error !== null &&
      typeof (json as { error: { message?: unknown } }).error.message === 'string'
        ? (json as { error: { message: string } }).error.message
        : `OpenAI APIエラー: ${response.status}`;
    return { ok: false, error: message };
  }

  const text = extractChatCompletionText(json);
  if (!text) {
    return { ok: false, error: '結果の取得に失敗しました' };
  }

  return { ok: true, text };
}

function renderInstructionTemplate(template: string, target: SummaryTarget): string {
  const raw = template.trim();
  if (!raw) return '';
  const shortText = target.text.trim().slice(0, 1200);
  const variables: Record<string, string> = {
    text: shortText,
    title: target.title ?? '',
    url: target.url ?? '',
    source: target.source,
  };

  let rendered = raw;
  Object.entries(variables).forEach(([key, value]) => {
    rendered = rendered.split(`{{${key}}}`).join(value);
  });
  return rendered.trim();
}

function extractChatCompletionText(json: unknown): string | null {
  if (typeof json !== 'object' || json === null) return null;
  const choices = (json as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0] as { message?: { content?: unknown } };
  const content = first?.message?.content;
  if (typeof content !== 'string') return null;
  return content.trim();
}

async function testOpenAiToken(tokenOverride?: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { openaiApiToken } = (await storageLocalGet(['openaiApiToken'])) as LocalStorageData;

  const token = tokenOverride?.trim() || openaiApiToken?.trim() || '';
  if (!token) {
    return {
      ok: false,
      error: 'OpenAI API Tokenが未設定です（ポップアップの「設定」タブで設定してください）',
    };
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 5,
      temperature: 0,
      messages: [
        { role: 'system', content: 'You are a health check bot.' },
        { role: 'user', content: 'Reply with OK.' },
      ],
    }),
  });

  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof json === 'object' &&
      json !== null &&
      'error' in json &&
      typeof (json as { error?: unknown }).error === 'object' &&
      (json as { error: { message?: unknown } }).error !== null &&
      typeof (json as { error: { message?: unknown } }).error.message === 'string'
        ? (json as { error: { message: string } }).error.message
        : `OpenAI APIエラー: ${response.status}`;
    return { ok: false, error: message };
  }

  return { ok: true };
}

async function extractEventWithOpenAI(
  target: SummaryTarget,
  extraInstruction?: string,
): Promise<{ ok: true; event: ExtractedEvent } | { ok: false; error: string }> {
  const { openaiApiToken, openaiCustomPrompt } = (await storageLocalGet([
    'openaiApiToken',
    'openaiCustomPrompt',
  ])) as LocalStorageData;

  if (!openaiApiToken) {
    return {
      ok: false,
      error: 'OpenAI API Tokenが未設定です（ポップアップの「設定」タブで設定してください）',
    };
  }

  const rawText = target.text.trim();
  if (!rawText) {
    return { ok: false, error: '要約対象のテキストが見つかりませんでした' };
  }

  const MAX_INPUT_CHARS = 20000;
  const clippedText = rawText.length > MAX_INPUT_CHARS ? `${rawText.slice(0, MAX_INPUT_CHARS)}\n\n(以下略)` : rawText;

  const meta = target.title || target.url ? `\n\n---\nタイトル: ${target.title ?? '-'}\nURL: ${target.url ?? '-'}` : '';

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiApiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
	          content: [
	            'あなたはイベント抽出アシスタントです。入力テキストから、カレンダー登録に必要な情報を抽出してください。',
	            '出力は必ずJSONのみ。コードフェンス禁止。キーは title,start,end,allDay,location,description を使う。',
	            'start/end はISO 8601 (例: 2025-01-31T19:00:00+09:00) を優先。難しければ YYYY-MM-DD HH:mm でもOK。',
	            'YYYY/MM/DD や「2025年1月31日 19:00」のような表記は避けてください。',
	            '日付しか不明な場合は YYYY-MM-DD でOK。',
	            'end が不明なら省略可。allDay は終日なら true、それ以外は false または省略。',
	            'description はイベントの概要を日本語で短くまとめる。',
            openaiCustomPrompt?.trim()
              ? `\n\nユーザーの追加指示（descriptionの文体に反映）:\n${openaiCustomPrompt.trim()}`
              : '',
            extraInstruction?.trim() ? `\n\nこのアクションの追加指示:\n${extraInstruction.trim()}` : '',
          ]
            .join('\n')
            .trim(),
        },
        {
          role: 'user',
          content: ['次のテキストからイベント情報を抽出し、JSONで返してください。', '', clippedText + meta].join('\n'),
        },
      ],
    }),
  });

  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof json === 'object' &&
      json !== null &&
      'error' in json &&
      typeof (json as { error?: unknown }).error === 'object' &&
      (json as { error: { message?: unknown } }).error !== null &&
      typeof (json as { error: { message?: unknown } }).error.message === 'string'
        ? (json as { error: { message: string } }).error.message
        : `OpenAI APIエラー: ${response.status}`;
    return { ok: false, error: message };
  }

  const content = extractChatCompletionText(json);
  if (!content) return { ok: false, error: 'イベント要約結果の取得に失敗しました' };

  const event = safeParseJsonObject<ExtractedEvent>(content);
  if (!event || typeof event.title !== 'string' || typeof event.start !== 'string') {
    return { ok: false, error: 'イベント情報の解析に失敗しました' };
  }

  return { ok: true, event: normalizeEvent(event) };
}

function safeParseJsonObject<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    const trimmed = text.trim();
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1)) as T;
    } catch {
      return null;
    }
  }
}

function storageSyncGet(keys: string[]): Promise<unknown> {
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

function normalizeEvent(event: ExtractedEvent): ExtractedEvent {
  const title = (event.title ?? '').trim() || '予定';
  const start = (event.start ?? '').trim();
  const end = event.end?.trim() || undefined;
  const location = event.location?.trim() || undefined;
  const description = event.description?.trim() || undefined;
  const allDay = event.allDay === true ? true : undefined;
  return { title, start, end, allDay, location, description };
}

function formatEventText(event: ExtractedEvent): string {
  const lines: string[] = [];
  lines.push(`タイトル: ${event.title}`);
  lines.push(`日時: ${event.start}${event.end ? ` 〜 ${event.end}` : ''}`);
  if (event.location) lines.push(`場所: ${event.location}`);
  if (event.description) {
    lines.push('');
    lines.push('概要:');
    lines.push(event.description);
  }
  return lines.join('\n');
}

function buildGoogleCalendarUrl(event: ExtractedEvent): string | null {
  const title = event.title?.trim() || '予定';
  const details = event.description?.trim() || '';
  const location = event.location?.trim() || '';

  let dates = '';
  const startRaw = event.start.trim();
  const endRaw = event.end?.trim() || '';

  const startDateOnly = parseDateOnlyToYyyyMmDd(startRaw);
  const endDateOnly = endRaw ? parseDateOnlyToYyyyMmDd(endRaw) : null;

  if (event.allDay === true || startDateOnly) {
    const startDateFromTime =
      event.allDay === true && !startDateOnly ? parseDateTimeLoose(startRaw) : null;
    const startDate =
      startDateOnly || (startDateFromTime ? formatLocalYyyyMmDdFromDate(startDateFromTime) : null);
    if (!startDate) return null;
    const endDateFromTime =
      event.allDay === true && endRaw && !endDateOnly ? parseDateTimeLoose(endRaw) : null;
    let endDate =
      endDateOnly ||
      (endDateFromTime ? formatLocalYyyyMmDdFromDate(endDateFromTime) : null) ||
      nextDateYyyyMmDd(startDate);
    if (endDate.length !== 8) return null;
    if (endDate <= startDate) {
      endDate = nextDateYyyyMmDd(startDate);
    }
    dates = `${startDate}/${endDate}`;
	  } else {
	    const startDate = parseDateTimeLoose(startRaw);
	    if (!startDate) return null;
	    let endDate = endRaw ? parseDateTimeLoose(endRaw) : null;
	    if (!endDate || endDate.getTime() <= startDate.getTime()) {
	      endDate = addHours(startDate, 1);
	    }
	    const startUtc = formatUtcDateTimeFromDate(startDate);
	    if (!endDate) return null;
	    const endUtc = formatUtcDateTimeFromDate(endDate);
	    if (!startUtc || !endUtc) return null;
	    dates = `${startUtc}/${endUtc}`;
	  }

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates,
  });
  if (details) params.set('details', details);
  if (location) params.set('location', location);

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
