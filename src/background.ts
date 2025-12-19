// Background Service Worker

import { Result } from "@praha/byethrow";
import {
  type ContextAction,
  DEFAULT_CONTEXT_ACTIONS,
  normalizeContextActions,
} from "@/context_actions";
import { parseDateOnlyToYyyyMmDd, parseDateTimeLoose } from "@/date_utils";
import { computeEventDateRange } from "@/event_date_range";
import { buildIcs } from "@/ics";
import { loadOpenAiModel, loadOpenAiSettings } from "@/openai/settings";
import type { ExtractedEvent, SummarySource } from "@/shared_types";
import type { LocalStorageData } from "@/storage/types";
import { toErrorMessage } from "@/utils/errors";
import { safeParseJsonObject } from "@/utils/json";
import {
  fetchOpenAiChatCompletionOk,
  fetchOpenAiChatCompletionText,
} from "@/utils/openai";

type SummaryTarget = {
  text: string;
  source: SummarySource;
  title?: string;
  url?: string;
};

type ContentScriptMessage =
  | { action: "showNotification"; message: string }
  | { action: "getSummaryTargetText"; ignoreSelection?: boolean }
  | { action: "copyToClipboard"; text: string; successMessage?: string }
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

type BackgroundRequest =
  | { action: "summarizeTab"; tabId: number }
  | { action: "runContextAction"; tabId: number; actionId: string };

type BackgroundResponse =
  | { ok: true; summary: string; source: SummarySource }
  | { ok: false; error: string };

type RunContextActionResponse =
  | { ok: true; resultType: "text"; text: string; source: SummarySource }
  | {
      ok: true;
      resultType: "event";
      event: ExtractedEvent;
      eventText: string;
      calendarUrl: string;
      source: SummarySource;
    }
  | { ok: false; error: string };

type SyncStorageData = {
  contextActions?: ContextAction[];
};

const CONTEXT_MENU_ROOT_ID = "mbu-root";
const CONTEXT_MENU_ACTION_PREFIX = "mbu-action:";
const CONTEXT_MENU_COPY_TITLE_LINK_ID = "mbu-copy-title-link";
const CONTEXT_MENU_BUILTIN_SEPARATOR_ID = "mbu-separator:builtins";

// Regex patterns at module level for performance (lint/performance/useTopLevelRegex)
const WAVE_SEPARATOR_REGEX = /^(.*?)\s*(?:〜|~|–|—)\s*(.*?)$/;
const DASH_SEPARATOR_REGEX = /^(.*?)\s+-\s+(.*?)$/;
const TIME_DASH_REGEX =
  /^(.+\d{1,2}:\d{2}(?::\d{2})?)\s*-\s*(\d{1,2}:\d{2}(?::\d{2})?)$/;
const DATE_PREFIX_REGEX =
  /^(\d{4}-\d{1,2}-\d{1,2}|\d{4}\/\d{1,2}\/\d{1,2}|\d{4}年\d{1,2}月\d{1,2}日|\d{1,2}[/-]\d{1,2}|\d{1,2}月\d{1,2}日)\s+/;
const TIME_ONLY_REGEX = /^(\d{1,2}:\d{2}(?::\d{2})?)$/;

chrome.runtime.onInstalled.addListener(() => {
  console.log("My Browser Utils installed");
  scheduleRefreshContextMenus();
});

chrome.runtime.onStartup.addListener(() => {
  scheduleRefreshContextMenus();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync") {
    return;
  }
  if (!("contextActions" in changes)) {
    return;
  }
  scheduleRefreshContextMenus();
});

let contextMenuRefreshQueue: Promise<void> = Promise.resolve();

function scheduleRefreshContextMenus(): Promise<void> {
  // 直前の更新が失敗しても次回を止めないようにしつつ、
  // 非標準の thenable 等が混入しても壊れないように Promise.resolve で正規化する。
  contextMenuRefreshQueue = Promise.resolve(contextMenuRefreshQueue)
    .catch(() => {
      // no-op
    })
    .then(() => refreshContextMenus());
  return contextMenuRefreshQueue;
}

scheduleRefreshContextMenus();

// Helper functions to reduce cognitive complexity (extracted from context menu handler)
type OverlayContext = {
  tabId: number;
  action: ContextAction;
  target: SummaryTarget;
  resolvedTitle: string;
  selectionSecondary: string | undefined;
  tokenHintSecondary: string;
};

type ContextMenuSelectionContext = {
  selection: string;
  initialSource: SummarySource;
  selectionSecondary: string | undefined;
  tokenHintSecondary: string;
};

function buildSelectionSecondary(selection: string): string | undefined {
  const trimmed = selection.trim();
  if (!trimmed) {
    return;
  }

  const clipped =
    trimmed.length > 4000 ? `${trimmed.slice(0, 4000)}…` : trimmed;
  return `選択範囲:\n${clipped}`;
}

function buildContextMenuSelectionContext(
  info: chrome.contextMenus.OnClickData
): ContextMenuSelectionContext {
  const selection = info.selectionText?.trim() ?? "";
  const initialSource: SummarySource = selection ? "selection" : "page";
  const selectionSecondary = buildSelectionSecondary(selection);
  const tokenHintBase =
    "OpenAI API Token未設定の場合は、拡張機能のポップアップ「設定」タブで設定してください。";
  const tokenHintSecondary = selectionSecondary
    ? `${selectionSecondary}\n\n${tokenHintBase}`
    : tokenHintBase;
  return { selection, initialSource, selectionSecondary, tokenHintSecondary };
}

function buildTitleLinkCopyText(tab?: chrome.tabs.Tab): string {
  const title = tab?.title?.trim() ?? "";
  const url = tab?.url?.trim() ?? "";
  if (title && url) {
    return `${title}\n${url}`;
  }
  return url || title;
}

function buildCopyTitleLinkOverlayTitle(): string {
  return "タイトルとリンクをコピー";
}

function buildCopyTitleLinkFallbackSecondary(errorMessage: string): string {
  return [
    "自動コピーに失敗しました。上のボタンでコピーしてください。",
    "",
    errorMessage,
  ].join("\n");
}

async function showCopyTitleLinkOverlay(params: {
  tabId: number;
  text: string;
  secondary: string;
}): Promise<void> {
  await sendMessageToTab(params.tabId, {
    action: "showActionOverlay",
    status: "ready",
    mode: "text",
    source: "page",
    title: buildCopyTitleLinkOverlayTitle(),
    primary: params.text,
    secondary: params.secondary,
  } satisfies ContentScriptMessage);
}

async function handleCopyTitleLinkContextMenuClick(params: {
  tabId: number;
  tab?: chrome.tabs.Tab;
}): Promise<void> {
  const text = buildTitleLinkCopyText(params.tab);
  if (!text.trim()) {
    await sendMessageToTab(params.tabId, {
      action: "showNotification",
      message: "コピーする内容がありません",
    } satisfies ContentScriptMessage).catch(() => {
      // no-op
    });
    return;
  }

  try {
    const result: { ok: true } | { ok: false; error: string } =
      await sendMessageToTab(params.tabId, {
        action: "copyToClipboard",
        text,
        successMessage: "コピーしました",
      } satisfies ContentScriptMessage);

    if (result.ok) {
      return;
    }

    await showCopyTitleLinkOverlay({
      tabId: params.tabId,
      text,
      secondary: buildCopyTitleLinkFallbackSecondary(result.error),
    });
  } catch (error) {
    console.error("copy title/link failed:", error);
    const message =
      error instanceof Error ? error.message : "コピーに失敗しました";
    await showCopyTitleLinkOverlay({
      tabId: params.tabId,
      text,
      secondary: message,
    }).catch(() => {
      // no-op
    });
  }
}

function titleSuffixBySource(source: SummarySource): string {
  return source === "selection" ? "選択範囲" : "ページ本文";
}

async function showContextActionNotFoundOverlay(
  tabId: number,
  source: SummarySource
): Promise<void> {
  await sendMessageToTab(tabId, {
    action: "showActionOverlay",
    status: "error",
    mode: "text",
    source,
    title: "My Browser Utils",
    primary: "アクションが見つかりません（ポップアップで再保存してください）",
  });
}

async function showContextActionLoadingOverlay(
  tabId: number,
  action: ContextAction,
  context: ContextMenuSelectionContext
): Promise<void> {
  const titleSuffix = titleSuffixBySource(context.initialSource);
  await sendMessageToTab(tabId, {
    action: "showActionOverlay",
    status: "loading",
    mode: action.kind === "event" ? "event" : "text",
    source: context.initialSource,
    title: `${action.title}（${titleSuffix}）`,
    secondary: context.selectionSecondary,
  });
}

async function resolveTargetFromContextMenuClick(params: {
  tabId: number;
  selection: string;
  tab?: chrome.tabs.Tab;
}): Promise<SummaryTarget> {
  if (params.selection) {
    return {
      text: params.selection,
      source: "selection",
      title: params.tab?.title,
      url: params.tab?.url,
    };
  }

  return await sendMessageToTab(params.tabId, {
    action: "getSummaryTargetText",
    ignoreSelection: true,
  });
}

function buildResolvedTitle(
  action: ContextAction,
  source: SummarySource
): string {
  const resolvedSuffix = titleSuffixBySource(source);
  return `${action.title}（${resolvedSuffix}）`;
}

async function showContextMenuUnexpectedErrorOverlay(
  tabId: number,
  source: SummarySource,
  error: unknown
): Promise<void> {
  const message = error instanceof Error ? error.message : "要約に失敗しました";
  await sendMessageToTab(tabId, {
    action: "showActionOverlay",
    status: "error",
    mode: "text",
    source,
    title: "My Browser Utils",
    primary: message,
  }).catch(() => {
    // コンテンツスクリプトに送れないページでは、黙って諦める
  });
}

async function handleContextMenuClick(params: {
  tabId: number;
  menuItemId: string;
  info: chrome.contextMenus.OnClickData;
  tab?: chrome.tabs.Tab;
}): Promise<void> {
  const context = buildContextMenuSelectionContext(params.info);
  const actionId = params.menuItemId.slice(CONTEXT_MENU_ACTION_PREFIX.length);

  const actions = await ensureContextActionsInitialized();
  const action = actions.find((item) => item.id === actionId);
  if (!action) {
    await showContextActionNotFoundOverlay(params.tabId, context.initialSource);
    return;
  }

  await showContextActionLoadingOverlay(params.tabId, action, context);

  const target = await resolveTargetFromContextMenuClick({
    tabId: params.tabId,
    selection: context.selection,
    tab: params.tab,
  });
  const resolvedTitle = buildResolvedTitle(action, target.source);

  const overlayContext: OverlayContext = {
    tabId: params.tabId,
    action,
    target,
    resolvedTitle,
    selectionSecondary: context.selectionSecondary,
    tokenHintSecondary: context.tokenHintSecondary,
  };

  if (action.kind === "event") {
    await handleEventAction(overlayContext);
  } else {
    await handlePromptAction(overlayContext);
  }
}

async function handleEventAction(context: OverlayContext): Promise<void> {
  const {
    tabId,
    action,
    target,
    resolvedTitle,
    selectionSecondary,
    tokenHintSecondary,
  } = context;

  const extraInstruction = action.prompt?.trim()
    ? renderInstructionTemplate(action.prompt, target)
    : undefined;
  const result = await extractEventWithOpenAI(target, extraInstruction);

  if (!result.ok) {
    await sendMessageToTab(tabId, {
      action: "showActionOverlay",
      status: "error",
      mode: "event",
      source: target.source,
      title: resolvedTitle,
      primary: result.error,
      secondary: tokenHintSecondary,
    });
    return;
  }

  const calendarUrl = buildGoogleCalendarUrl(result.event);
  if (!calendarUrl) {
    await sendMessageToTab(tabId, {
      action: "showActionOverlay",
      status: "error",
      mode: "event",
      source: target.source,
      title: resolvedTitle,
      primary: `日時の解析に失敗しました（Googleカレンダーリンクを生成できません）\nstart: ${result.event.start}${
        result.event.end ? `\nend: ${result.event.end}` : ""
      }`,
      secondary: selectionSecondary,
    });
    return;
  }

  const ics = buildIcs(result.event) ?? undefined;
  await sendMessageToTab(tabId, {
    action: "showActionOverlay",
    status: "ready",
    mode: "event",
    source: target.source,
    title: resolvedTitle,
    primary: formatEventText(result.event),
    secondary: selectionSecondary,
    calendarUrl,
    ics,
    event: result.event,
  });
}

async function handlePromptAction(context: OverlayContext): Promise<void> {
  const {
    tabId,
    action,
    target,
    resolvedTitle,
    selectionSecondary,
    tokenHintSecondary,
  } = context;

  const prompt = action.prompt.trim();
  if (!prompt) {
    await sendMessageToTab(tabId, {
      action: "showActionOverlay",
      status: "error",
      mode: "text",
      source: target.source,
      title: resolvedTitle,
      primary: "プロンプトが空です",
      secondary: selectionSecondary,
    });
    return;
  }

  const result = await runPromptActionWithOpenAI(target, prompt);
  if (!result.ok) {
    await sendMessageToTab(tabId, {
      action: "showActionOverlay",
      status: "error",
      mode: "text",
      source: target.source,
      title: resolvedTitle,
      primary: result.error,
      secondary: tokenHintSecondary,
    });
    return;
  }

  await sendMessageToTab(tabId, {
    action: "showActionOverlay",
    status: "ready",
    mode: "text",
    source: target.source,
    title: resolvedTitle,
    primary: result.text,
    secondary: selectionSecondary,
  });
}

chrome.contextMenus.onClicked.addListener(
  (info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab) => {
    if (typeof info.menuItemId !== "string") {
      return;
    }

    const tabId = tab?.id;
    if (tabId === undefined) {
      return;
    }

    const menuItemId = info.menuItemId;

    if (menuItemId === CONTEXT_MENU_COPY_TITLE_LINK_ID) {
      handleCopyTitleLinkContextMenuClick({ tabId, tab }).catch(() => {
        // no-op
      });
      return;
    }

    if (!menuItemId.startsWith(CONTEXT_MENU_ACTION_PREFIX)) {
      return;
    }

    const selectionContext = buildContextMenuSelectionContext(info);
    handleContextMenuClick({ tabId, menuItemId, info, tab }).catch((error) => {
      showContextMenuUnexpectedErrorOverlay(
        tabId,
        selectionContext.initialSource,
        error
      ).catch(() => {
        // no-op
      });
    });
  }
);

async function refreshContextMenus(): Promise<void> {
  try {
    await new Promise<void>((resolve) => {
      chrome.contextMenus.removeAll(() => resolve());
    });

    await new Promise<void>((resolve, reject) => {
      chrome.contextMenus.create(
        {
          id: CONTEXT_MENU_ROOT_ID,
          title: "My Browser Utils",
          contexts: ["page", "selection"],
        },
        () => {
          const err = chrome.runtime.lastError;
          if (err) {
            reject(new Error(err.message));
            return;
          }
          resolve();
        }
      );
    });

    await new Promise<void>((resolve, reject) => {
      chrome.contextMenus.create(
        {
          id: CONTEXT_MENU_COPY_TITLE_LINK_ID,
          parentId: CONTEXT_MENU_ROOT_ID,
          title: "タイトルとリンクをコピー",
          contexts: ["page", "selection"],
        },
        () => {
          const err = chrome.runtime.lastError;
          if (err) {
            reject(new Error(err.message));
            return;
          }
          resolve();
        }
      );
    });

    await new Promise<void>((resolve, reject) => {
      chrome.contextMenus.create(
        {
          id: CONTEXT_MENU_BUILTIN_SEPARATOR_ID,
          parentId: CONTEXT_MENU_ROOT_ID,
          type: "separator",
          contexts: ["page", "selection"],
        },
        () => {
          const err = chrome.runtime.lastError;
          if (err) {
            reject(new Error(err.message));
            return;
          }
          resolve();
        }
      );
    });

    const actions = await ensureContextActionsInitialized();
    for (const action of actions) {
      await new Promise<void>((resolve, reject) => {
        chrome.contextMenus.create(
          {
            id: `${CONTEXT_MENU_ACTION_PREFIX}${action.id}`,
            parentId: CONTEXT_MENU_ROOT_ID,
            title: action.title,
            contexts: ["page", "selection"],
          },
          () => {
            const err = chrome.runtime.lastError;
            if (err) {
              reject(new Error(err.message));
              return;
            }
            resolve();
          }
        );
      });
    }
  } catch (error) {
    console.error("refreshContextMenus failed:", error);
  }
}

async function ensureContextActionsInitialized(): Promise<ContextAction[]> {
  const stored = (await storageSyncGet(["contextActions"])) as SyncStorageData;
  const existing = normalizeContextActions(stored.contextActions);
  if (existing.length > 0) {
    return existing;
  }
  await storageSyncSet({ contextActions: DEFAULT_CONTEXT_ACTIONS });
  return DEFAULT_CONTEXT_ACTIONS;
}

// Helper function for handling event actions in message listener
async function handleEventActionInMessage(
  _tabId: number,
  target: SummaryTarget,
  action: ContextAction,
  sendResponse: (response: RunContextActionResponse) => void
): Promise<void> {
  const extraInstruction = action.prompt?.trim()
    ? renderInstructionTemplate(action.prompt, target)
    : undefined;
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
        result.event.end ? `\nend: ${result.event.end}` : ""
      }`,
    });
    return;
  }

  sendResponse({
    ok: true,
    resultType: "event",
    event: result.event,
    calendarUrl,
    eventText: formatEventText(result.event),
    source: target.source,
  });
}

// Helper function for handling prompt actions in message listener
async function handlePromptActionInMessage(
  target: SummaryTarget,
  action: ContextAction,
  sendResponse: (response: RunContextActionResponse) => void
): Promise<void> {
  const prompt = action.prompt.trim();
  if (!prompt) {
    sendResponse({ ok: false, error: "プロンプトが空です" });
    return;
  }

  const result = await runPromptActionWithOpenAI(target, prompt);
  if (!result.ok) {
    sendResponse({ ok: false, error: result.error });
    return;
  }

  sendResponse({
    ok: true,
    resultType: "text",
    text: result.text,
    source: target.source,
  });
}

async function handleSummarizeEventInMessage(
  target: SummaryTarget,
  sendResponse: (
    response:
      | { ok: false; error: string }
      | {
          ok: true;
          event: ExtractedEvent;
          calendarUrl: string;
          eventText: string;
        }
  ) => void
): Promise<void> {
  const result = await extractEventWithOpenAI(target);
  if (!result.ok) {
    sendResponse(result);
    return;
  }

  const calendarUrl = buildGoogleCalendarUrl(result.event);
  if (!calendarUrl) {
    sendResponse({
      ok: false,
      error: `日時の解析に失敗しました（Googleカレンダーリンクを生成できません）\nstart: ${result.event.start}${
        result.event.end ? `\nend: ${result.event.end}` : ""
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
}

chrome.runtime.onMessage.addListener(
  (
    request:
      | BackgroundRequest
      | { action: "summarizeText"; target: SummaryTarget }
      | { action: "testOpenAiToken"; token?: string }
      | { action: "summarizeEvent"; target: SummaryTarget },
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
          }
    ) => void
  ) => {
    if (request.action === "summarizeTab") {
      (async () => {
        try {
          const target = await sendMessageToTab<
            ContentScriptMessage,
            SummaryTarget
          >(request.tabId, {
            action: "getSummaryTargetText",
            ignoreSelection: true,
          });

          const result = await summarizeWithOpenAI(target);
          sendResponse(result);
        } catch (error) {
          sendResponse({
            ok: false,
            error:
              error instanceof Error ? error.message : "要約に失敗しました",
          });
        }
      })();
      return true;
    }

    if (request.action === "summarizeText") {
      (async () => {
        try {
          const result = await summarizeWithOpenAI(request.target);
          sendResponse(result);
        } catch (error) {
          sendResponse({
            ok: false,
            error:
              error instanceof Error ? error.message : "要約に失敗しました",
          });
        }
      })();
      return true;
    }

    if (request.action === "runContextAction") {
      (async () => {
        try {
          const target = await sendMessageToTab<
            ContentScriptMessage,
            SummaryTarget
          >(request.tabId, {
            action: "getSummaryTargetText",
          });

          const actions = await loadContextActions();
          const action = actions.find((item) => item.id === request.actionId);
          if (!action) {
            sendResponse({
              ok: false,
              error:
                "アクションが見つかりません（ポップアップで再保存してください）",
            });
            return;
          }

          if (action.kind === "event") {
            await handleEventActionInMessage(
              request.tabId,
              target,
              action,
              sendResponse
            );
          } else {
            await handlePromptActionInMessage(target, action, sendResponse);
          }
        } catch (error) {
          sendResponse({
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "アクションの実行に失敗しました",
          });
        }
      })();
      return true;
    }

    if (request.action === "testOpenAiToken") {
      (async () => {
        try {
          const result = await testOpenAiToken(request.token);
          sendResponse(result);
        } catch (error) {
          sendResponse({
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "トークン確認に失敗しました",
          });
        }
      })();
      return true;
    }

    if (request.action === "summarizeEvent") {
      handleSummarizeEventInMessage(request.target, sendResponse).catch(
        (error) => {
          sendResponse({
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "イベント要約に失敗しました",
          });
        }
      );
      return true;
    }

    return true;
  }
);

function sendMessageToTab<TRequest, TResponse>(
  tabId: number,
  message: TRequest
): Promise<TResponse> {
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

function storageLocalGetTyped(
  keys: (keyof LocalStorageData)[]
): Promise<Partial<LocalStorageData>> {
  return storageLocalGet(keys as string[]) as Promise<
    Partial<LocalStorageData>
  >;
}

async function summarizeWithOpenAI(
  target: SummaryTarget
): Promise<BackgroundResponse> {
  const settingsResult = await loadOpenAiSettings(storageLocalGetTyped);
  if (Result.isFailure(settingsResult)) {
    return { ok: false, error: settingsResult.error };
  }
  const settings = settingsResult.value;

  const MAX_INPUT_CHARS = 20_000;
  const rawText = target.text.trim();
  if (!rawText) {
    return { ok: false, error: "要約対象のテキストが見つかりませんでした" };
  }

  const clippedText =
    rawText.length > MAX_INPUT_CHARS
      ? `${rawText.slice(0, MAX_INPUT_CHARS)}\n\n(以下略)`
      : rawText;

  const meta =
    target.title || target.url
      ? `\n\n---\nタイトル: ${target.title ?? "-"}\nURL: ${target.url ?? "-"}`
      : "";

  const body = {
    model: settings.model,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: [
          "あなたは日本語の要約アシスタントです。入力テキストを読み、要点を短く整理して出力してください。",
          settings.customPrompt
            ? `\n\nユーザーの追加指示:\n${settings.customPrompt}`
            : "",
        ]
          .join("")
          .trim(),
      },
      {
        role: "user",
        content: [
          "次のテキストを日本語で要約してください。",
          "",
          "要件:",
          "- 重要ポイントを箇条書き(3〜7個)",
          "- 最後に一文で結論/要約",
          "- 事実と推測を混同しない",
          "",
          clippedText + meta,
        ].join("\n"),
      },
    ],
  };

  const summaryResult = await fetchOpenAiChatCompletionText(
    fetch,
    settings.token,
    body,
    "要約結果の取得に失敗しました"
  );
  if (Result.isFailure(summaryResult)) {
    return { ok: false, error: summaryResult.error };
  }

  return { ok: true, summary: summaryResult.value, source: target.source };
}

async function loadContextActions(): Promise<ContextAction[]> {
  const data = (await storageSyncGet(["contextActions"])) as SyncStorageData;
  return normalizeContextActions(data.contextActions);
}

async function runPromptActionWithOpenAI(
  target: SummaryTarget,
  promptTemplate: string
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const settingsResult = await loadOpenAiSettings(storageLocalGetTyped);
  if (Result.isFailure(settingsResult)) {
    return { ok: false, error: settingsResult.error };
  }
  const settings = settingsResult.value;

  const MAX_INPUT_CHARS = 20_000;
  const rawText = target.text.trim();
  if (!rawText) {
    return { ok: false, error: "対象のテキストが見つかりませんでした" };
  }

  const clippedText =
    rawText.length > MAX_INPUT_CHARS
      ? `${rawText.slice(0, MAX_INPUT_CHARS)}\n\n(以下略)`
      : rawText;

  const metaLines: string[] = [];
  if (target.title) {
    metaLines.push(`タイトル: ${target.title}`);
  }
  if (target.url) {
    metaLines.push(`URL: ${target.url}`);
  }
  const meta = metaLines.length > 0 ? `\n\n---\n${metaLines.join("\n")}` : "";

  const variables: Record<string, string> = {
    text: clippedText,
    title: target.title ?? "",
    url: target.url ?? "",
    source: target.source,
  };

  let rendered = promptTemplate;
  for (const [key, value] of Object.entries(variables)) {
    rendered = rendered.split(`{{${key}}}`).join(value);
  }

  const needsText = !promptTemplate.includes("{{text}}");
  const needsMeta = !(
    promptTemplate.includes("{{title}}") || promptTemplate.includes("{{url}}")
  );
  const userContent = [
    rendered.trim(),
    needsText ? `\n\n${clippedText}` : "",
    needsMeta ? meta : "",
  ]
    .join("")
    .trim();

  const body = {
    model: settings.model,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: [
          "あなたはユーザーの「Context Action」を実行するアシスタントです。指示に従い、必要な結果だけを簡潔に出力してください。",
          settings.customPrompt
            ? `\n\nユーザーの追加指示:\n${settings.customPrompt}`
            : "",
        ]
          .join("")
          .trim(),
      },
      { role: "user", content: userContent },
    ],
  };

  const textResult = await fetchOpenAiChatCompletionText(
    fetch,
    settings.token,
    body,
    "結果の取得に失敗しました"
  );
  if (Result.isFailure(textResult)) {
    return { ok: false, error: textResult.error };
  }

  return { ok: true, text: textResult.value };
}

function renderInstructionTemplate(
  template: string,
  target: SummaryTarget
): string {
  const raw = template.trim();
  if (!raw) {
    return "";
  }
  const shortText = target.text.trim().slice(0, 1200);
  const variables: Record<string, string> = {
    text: shortText,
    title: target.title ?? "",
    url: target.url ?? "",
    source: target.source,
  };

  let rendered = raw;
  for (const [key, value] of Object.entries(variables)) {
    rendered = rendered.split(`{{${key}}}`).join(value);
  }
  return rendered.trim();
}

async function testOpenAiToken(
  tokenOverride?: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const overrideToken = tokenOverride?.trim() ?? "";

  const tokenResult = overrideToken
    ? Result.succeed(overrideToken)
    : Result.pipe(
        Result.try({
          immediate: true,
          try: () => storageLocalGet(["openaiApiToken"]),
          catch: (error) =>
            toErrorMessage(error, "OpenAI設定の読み込みに失敗しました"),
        }),
        Result.map(
          (data) => (data as LocalStorageData).openaiApiToken?.trim() ?? ""
        ),
        Result.andThen((storedToken) =>
          storedToken
            ? Result.succeed(storedToken)
            : Result.fail(
                "OpenAI API Tokenが未設定です（ポップアップの「設定」タブで設定してください）"
              )
        )
      );

  const token = await tokenResult;
  if (Result.isFailure(token)) {
    return { ok: false, error: token.error };
  }

  const checkResult = await fetchOpenAiChatCompletionOk(fetch, token.value, {
    model: await loadOpenAiModel(storageLocalGetTyped),
    max_tokens: 5,
    temperature: 0,
    messages: [
      { role: "system", content: "You are a health check bot." },
      { role: "user", content: "Reply with OK." },
    ],
  });

  if (Result.isFailure(checkResult)) {
    return { ok: false, error: checkResult.error };
  }

  return { ok: true };
}

async function extractEventWithOpenAI(
  target: SummaryTarget,
  extraInstruction?: string
): Promise<{ ok: true; event: ExtractedEvent } | { ok: false; error: string }> {
  const settingsResult = await loadOpenAiSettings(storageLocalGetTyped);
  if (Result.isFailure(settingsResult)) {
    return { ok: false, error: settingsResult.error };
  }
  const settings = settingsResult.value;

  const inputText = target.text.trim();
  if (!inputText) {
    return { ok: false, error: "要約対象のテキストが見つかりませんでした" };
  }

  const MAX_INPUT_CHARS = 20_000;
  const clippedText =
    inputText.length > MAX_INPUT_CHARS
      ? `${inputText.slice(0, MAX_INPUT_CHARS)}\n\n(以下略)`
      : inputText;

  const meta =
    target.title || target.url
      ? `\n\n---\nタイトル: ${target.title ?? "-"}\nURL: ${target.url ?? "-"}`
      : "";

  const body = {
    model: settings.model,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          "あなたはイベント抽出アシスタントです。入力テキストから、カレンダー登録に必要な情報を抽出してください。",
          "出力は必ずJSONのみ。コードフェンス禁止。キーは title,start,end,allDay,location,description を使う。",
          "start/end はISO 8601 (例: 2025-01-31T19:00:00+09:00) を優先。難しければ YYYY-MM-DD HH:mm でもOK。",
          "YYYY/MM/DD や「2025年1月31日 19:00」のような表記は避けてください。",
          "日付しか不明な場合は YYYY-MM-DD でOK。",
          "end が不明なら省略可。allDay は終日なら true、それ以外は false または省略。",
          "description はイベントの概要を日本語で短くまとめる。",
          settings.customPrompt
            ? `\n\nユーザーの追加指示（descriptionの文体に反映）:\n${settings.customPrompt}`
            : "",
          extraInstruction?.trim()
            ? `\n\nこのアクションの追加指示:\n${extraInstruction.trim()}`
            : "",
        ]
          .join("\n")
          .trim(),
      },
      {
        role: "user",
        content: [
          "次のテキストからイベント情報を抽出し、JSONで返してください。",
          "",
          clippedText + meta,
        ].join("\n"),
      },
    ],
  };

  const contentResult = await fetchOpenAiChatCompletionText(
    fetch,
    settings.token,
    body,
    "イベント要約結果の取得に失敗しました"
  );
  if (Result.isFailure(contentResult)) {
    return { ok: false, error: contentResult.error };
  }

  const eventResult = safeParseJsonObject<ExtractedEvent>(contentResult.value);
  if (Result.isFailure(eventResult)) {
    return { ok: false, error: "イベント情報の解析に失敗しました" };
  }

  const event = eventResult.value;
  if (typeof event.title !== "string" || typeof event.start !== "string") {
    return { ok: false, error: "イベント情報の解析に失敗しました" };
  }

  return { ok: true, event: normalizeEvent(event) };
}

function storageSyncGet(keys: string[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
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

function normalizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function splitTextRange(value: string): [string, string] | null {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  const waveMatch = normalized.match(WAVE_SEPARATOR_REGEX);
  if (waveMatch) {
    return [waveMatch[1].trim(), waveMatch[2].trim()];
  }
  const dashMatch = normalized.match(DASH_SEPARATOR_REGEX);
  if (dashMatch) {
    return [dashMatch[1].trim(), dashMatch[2].trim()];
  }
  const timeDashMatch = normalized.match(TIME_DASH_REGEX);
  if (timeDashMatch) {
    return [timeDashMatch[1].trim(), timeDashMatch[2].trim()];
  }
  return null;
}

type NormalizedEventRange = {
  start: string;
  end?: string;
  allDay?: true;
};

function normalizeEventRange(
  start: string,
  end: string | undefined,
  allDay: true | undefined
): NormalizedEventRange {
  // モデルが `start: "2025-12-16 14:00〜15:00"` のようにレンジを一つの文字列に詰めるケースがあるため補正する。
  if (end || !start) {
    return { start, end, allDay };
  }

  const parts = splitTextRange(start);
  if (!parts) {
    return { start, end, allDay };
  }

  const [left, right] = parts;

  // date-only range: "2025-12-16〜2025-12-17"
  if (parseDateOnlyToYyyyMmDd(left) && parseDateOnlyToYyyyMmDd(right)) {
    return { start: left, end: right, allDay: allDay ?? true };
  }

  // datetime range with time-only end: "2025-12-16 14:00〜15:00"
  const leftDatePrefix = left.match(DATE_PREFIX_REGEX)?.[1];
  const rightTimeOnly = right.match(TIME_ONLY_REGEX)?.[1];

  if (leftDatePrefix && rightTimeOnly) {
    return { start: left, end: `${leftDatePrefix} ${rightTimeOnly}`, allDay };
  }
  if (parseDateTimeLoose(right)) {
    return { start: left, end: right, allDay };
  }

  return { start: left, end, allDay };
}

function normalizeEvent(event: ExtractedEvent): ExtractedEvent {
  const title = normalizeOptionalText(event.title) ?? "予定";
  const rawStart = normalizeOptionalText(event.start) ?? "";
  const rawEnd = normalizeOptionalText(event.end);
  const rawAllDay = event.allDay === true ? true : undefined;
  const location = normalizeOptionalText(event.location);
  const description = normalizeOptionalText(event.description);

  const { start, end, allDay } = normalizeEventRange(
    rawStart,
    rawEnd,
    rawAllDay
  );
  return { title, start, end, allDay, location, description };
}

function formatEventText(event: ExtractedEvent): string {
  const lines: string[] = [];
  lines.push(`タイトル: ${event.title}`);
  lines.push(`日時: ${event.start}${event.end ? ` 〜 ${event.end}` : ""}`);
  if (event.location) {
    lines.push(`場所: ${event.location}`);
  }
  if (event.description) {
    lines.push("");
    lines.push("概要:");
    lines.push(event.description);
  }
  return lines.join("\n");
}

function buildGoogleCalendarUrl(event: ExtractedEvent): string | null {
  const title = event.title?.trim() || "予定";
  const details = event.description?.trim() || "";
  const location = event.location?.trim() || "";

  const range = computeEventDateRange({
    start: event.start,
    end: event.end,
    allDay: event.allDay,
  });
  if (!range) {
    return null;
  }
  const dates =
    range.kind === "allDay"
      ? `${range.startYyyyMmDd}/${range.endYyyyMmDdExclusive}`
      : `${range.startUtc}/${range.endUtc}`;

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates,
  });
  if (details) {
    params.set("details", details);
  }
  if (location) {
    params.set("location", location);
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
