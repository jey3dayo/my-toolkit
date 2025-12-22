import { Result } from "@praha/byethrow";
import type { ContextAction } from "@/context_actions";
import type { ExtractedEvent, SummarySource } from "@/shared_types";
import type { LocalStorageData } from "@/storage/types";
import { toErrorMessage } from "@/utils/errors";
import type { LinkFormat } from "@/utils/link_format";

export type SyncStorageData = {
  domainPatterns?: string[];
  autoEnableSort?: boolean;
  contextActions?: ContextAction[];
  linkFormat?: LinkFormat;
};

export type EnableTableSortMessage = { action: "enableTableSort" };
export type EnableTableSortResponse = { success: boolean };

export type RunContextActionRequest = {
  action: "runContextAction";
  tabId: number;
  actionId: string;
};
export type RunContextActionResponse =
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

export type TestOpenAiTokenRequest = {
  action: "testOpenAiToken";
  token?: string;
};
export type TestOpenAiTokenResponse =
  | { ok: true }
  | { ok: false; error: string };

export type ActiveTabInfo = {
  id: number;
  title?: string;
  url?: string;
};

export type PopupRuntime = {
  isExtensionPage: boolean;
  storageSyncGet: (
    keys: (keyof SyncStorageData)[]
  ) => Result.ResultAsync<Partial<SyncStorageData>, string>;
  storageSyncSet: (
    items: Partial<SyncStorageData>
  ) => Result.ResultAsync<void, string>;
  storageLocalGet: (
    keys: (keyof LocalStorageData)[]
  ) => Result.ResultAsync<Partial<LocalStorageData>, string>;
  storageLocalSet: (
    items: Partial<LocalStorageData>
  ) => Result.ResultAsync<void, string>;
  storageLocalRemove: (
    keys: (keyof LocalStorageData)[] | keyof LocalStorageData
  ) => Result.ResultAsync<void, string>;
  getActiveTab: () => Result.ResultAsync<ActiveTabInfo | null, string>;
  getActiveTabId: () => Result.ResultAsync<number | null, string>;
  sendMessageToBackground: <TRequest, TResponse>(
    message: TRequest
  ) => Result.ResultAsync<TResponse, string>;
  sendMessageToTab: <TRequest, TResponse>(
    tabId: number,
    message: TRequest
  ) => Result.ResultAsync<TResponse, string>;
  openUrl: (url: string) => void;
};

const FALLBACK_STORAGE_PREFIX = "mbu:popup:";

function fallbackStorageGet(
  scope: "sync" | "local",
  keys: string[]
): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const key of keys) {
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(
        `${FALLBACK_STORAGE_PREFIX}${scope}:${key}`
      );
    } catch {
      raw = null;
    }
    if (raw === null) {
      continue;
    }
    try {
      data[key] = JSON.parse(raw) as unknown;
    } catch {
      data[key] = raw;
    }
  }
  return data;
}

function fallbackStorageSet(
  scope: "sync" | "local",
  items: Record<string, unknown>
): void {
  for (const [key, value] of Object.entries(items)) {
    try {
      window.localStorage.setItem(
        `${FALLBACK_STORAGE_PREFIX}${scope}:${key}`,
        JSON.stringify(value)
      );
    } catch {
      // no-op
    }
  }
}

function fallbackStorageRemove(
  scope: "sync" | "local",
  keys: string[] | string
): void {
  const list = Array.isArray(keys) ? keys : [keys];
  for (const key of list) {
    try {
      window.localStorage.removeItem(
        `${FALLBACK_STORAGE_PREFIX}${scope}:${key}`
      );
    } catch {
      // no-op
    }
  }
}

export function createPopupRuntime(): PopupRuntime {
  const isExtensionPage = window.location.protocol === "chrome-extension:";

  const storageSyncGet: PopupRuntime["storageSyncGet"] = async (keys) => {
    if (
      !(isExtensionPage && (chrome as unknown as { storage?: unknown }).storage)
    ) {
      return Result.succeed(
        fallbackStorageGet("sync", keys.map(String)) as Partial<SyncStorageData>
      );
    }
    return await Result.try({
      immediate: true,
      try: () =>
        new Promise<Partial<SyncStorageData>>((resolve, reject) => {
          chrome.storage.sync.get(keys as string[], (items) => {
            const err = chrome.runtime.lastError;
            if (err) {
              reject(new Error(err.message));
              return;
            }
            resolve(items as Partial<SyncStorageData>);
          });
        }),
      catch: (error) =>
        toErrorMessage(error, "同期ストレージの読み込みに失敗しました"),
    });
  };

  const storageSyncSet: PopupRuntime["storageSyncSet"] = async (items) => {
    if (
      !(isExtensionPage && (chrome as unknown as { storage?: unknown }).storage)
    ) {
      fallbackStorageSet("sync", items as Record<string, unknown>);
      return Result.succeed();
    }
    return await Result.try({
      immediate: true,
      try: () =>
        new Promise<void>((resolve, reject) => {
          chrome.storage.sync.set(items as Record<string, unknown>, () => {
            const err = chrome.runtime.lastError;
            if (err) {
              reject(new Error(err.message));
              return;
            }
            resolve();
          });
        }),
      catch: (error) =>
        toErrorMessage(error, "同期ストレージの保存に失敗しました"),
    });
  };

  const storageLocalGet: PopupRuntime["storageLocalGet"] = async (keys) => {
    if (
      !(isExtensionPage && (chrome as unknown as { storage?: unknown }).storage)
    ) {
      return Result.succeed(
        fallbackStorageGet(
          "local",
          keys.map(String)
        ) as Partial<LocalStorageData>
      );
    }
    return await Result.try({
      immediate: true,
      try: () =>
        new Promise<Partial<LocalStorageData>>((resolve, reject) => {
          chrome.storage.local.get(keys as string[], (items) => {
            const err = chrome.runtime.lastError;
            if (err) {
              reject(new Error(err.message));
              return;
            }
            resolve(items as Partial<LocalStorageData>);
          });
        }),
      catch: (error) =>
        toErrorMessage(error, "ローカルストレージの読み込みに失敗しました"),
    });
  };

  const storageLocalSet: PopupRuntime["storageLocalSet"] = async (items) => {
    if (
      !(isExtensionPage && (chrome as unknown as { storage?: unknown }).storage)
    ) {
      fallbackStorageSet("local", items as Record<string, unknown>);
      return Result.succeed();
    }
    return await Result.try({
      immediate: true,
      try: () =>
        new Promise<void>((resolve, reject) => {
          chrome.storage.local.set(items as Record<string, unknown>, () => {
            const err = chrome.runtime.lastError;
            if (err) {
              reject(new Error(err.message));
              return;
            }
            resolve();
          });
        }),
      catch: (error) =>
        toErrorMessage(error, "ローカルストレージの保存に失敗しました"),
    });
  };

  const storageLocalRemove: PopupRuntime["storageLocalRemove"] = async (
    keys
  ) => {
    if (
      !(isExtensionPage && (chrome as unknown as { storage?: unknown }).storage)
    ) {
      fallbackStorageRemove("local", keys as string[] | string);
      return Result.succeed();
    }
    return await Result.try({
      immediate: true,
      try: () =>
        new Promise<void>((resolve, reject) => {
          chrome.storage.local.remove(keys as string[] | string, () => {
            const err = chrome.runtime.lastError;
            if (err) {
              reject(new Error(err.message));
              return;
            }
            resolve();
          });
        }),
      catch: (error) =>
        toErrorMessage(error, "ローカルストレージの削除に失敗しました"),
    });
  };

  const getActiveTab: PopupRuntime["getActiveTab"] = async () => {
    if (!(isExtensionPage && (chrome as unknown as { tabs?: unknown }).tabs)) {
      return Result.succeed(null);
    }
    return await Result.try({
      immediate: true,
      try: () =>
        new Promise<ActiveTabInfo | null>((resolve, reject) => {
          chrome.tabs.query(
            {
              active: true,
              currentWindow: true,
            },
            (result) => {
              const err = chrome.runtime.lastError;
              if (err) {
                reject(new Error(err.message));
                return;
              }
              const [tab] = result;
              const id = tab?.id;
              if (id === undefined) {
                resolve(null);
                return;
              }
              resolve({ id, title: tab?.title, url: tab?.url });
            }
          );
        }),
      catch: (error) => toErrorMessage(error, "タブ情報の取得に失敗しました"),
    });
  };

  const getActiveTabId: PopupRuntime["getActiveTabId"] = async () => {
    const activeTab = await getActiveTab();
    if (Result.isFailure(activeTab)) {
      return activeTab;
    }
    return Result.succeed(activeTab.value?.id ?? null);
  };

  const sendMessageToBackground: PopupRuntime["sendMessageToBackground"] =
    async <TRequest, TResponse>(
      message: TRequest
    ): Promise<Result.Result<TResponse, string>> => {
      if (
        !(
          isExtensionPage &&
          (chrome as unknown as { runtime?: unknown }).runtime
        )
      ) {
        return Result.fail(
          "拡張機能として開いてください（chrome-extension://...）"
        );
      }
      return await Result.try({
        immediate: true,
        try: () =>
          new Promise<TResponse>((resolve, reject) => {
            chrome.runtime.sendMessage(message, (response) => {
              const err = chrome.runtime.lastError;
              if (err) {
                reject(new Error(err.message));
                return;
              }
              resolve(response as TResponse);
            });
          }),
        catch: (error) =>
          toErrorMessage(
            error,
            "バックグラウンドへのメッセージ送信に失敗しました"
          ),
      });
    };

  const sendMessageToTab: PopupRuntime["sendMessageToTab"] = async <
    TRequest,
    TResponse,
  >(
    tabId: number,
    message: TRequest
  ): Promise<Result.Result<TResponse, string>> => {
    if (!(isExtensionPage && (chrome as unknown as { tabs?: unknown }).tabs)) {
      return Result.fail(
        "拡張機能として開いてください（chrome-extension://...）"
      );
    }
    return await Result.try({
      immediate: true,
      try: () =>
        new Promise<TResponse>((resolve, reject) => {
          chrome.tabs.sendMessage(tabId, message, (response) => {
            const err = chrome.runtime.lastError;
            if (err) {
              reject(new Error(err.message));
              return;
            }
            resolve(response as TResponse);
          });
        }),
      catch: (error) =>
        toErrorMessage(error, "タブへのメッセージ送信に失敗しました"),
    });
  };

  const openUrl: PopupRuntime["openUrl"] = (url) => {
    const trimmed = url.trim();
    if (!trimmed) {
      return;
    }
    if (isExtensionPage && (chrome as unknown as { tabs?: unknown }).tabs) {
      chrome.tabs.create({ url: trimmed });
      return;
    }
    window.open(trimmed, "_blank", "noopener,noreferrer");
  };

  return {
    isExtensionPage,
    storageSyncGet,
    storageSyncSet,
    storageLocalGet,
    storageLocalSet,
    storageLocalRemove,
    getActiveTab,
    getActiveTabId,
    sendMessageToBackground,
    sendMessageToTab,
    openUrl,
  };
}
