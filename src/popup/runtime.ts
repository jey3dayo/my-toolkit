import type { ContextAction } from "@/context_actions";
import type { ExtractedEvent, SummarySource } from "@/shared_types";
import type { LocalStorageData } from "@/storage/types";

export type SyncStorageData = {
  domainPatterns?: string[];
  autoEnableSort?: boolean;
  contextActions?: ContextAction[];
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
  ) => Promise<Partial<SyncStorageData>>;
  storageSyncSet: (items: Partial<SyncStorageData>) => Promise<void>;
  storageLocalGet: (
    keys: (keyof LocalStorageData)[]
  ) => Promise<Partial<LocalStorageData>>;
  storageLocalSet: (items: Partial<LocalStorageData>) => Promise<void>;
  storageLocalRemove: (
    keys: (keyof LocalStorageData)[] | keyof LocalStorageData
  ) => Promise<void>;
  getActiveTab: () => Promise<ActiveTabInfo | null>;
  getActiveTabId: () => Promise<number | null>;
  sendMessageToBackground: <TRequest, TResponse>(
    message: TRequest
  ) => Promise<TResponse>;
  sendMessageToTab: <TRequest, TResponse>(
    tabId: number,
    message: TRequest
  ) => Promise<TResponse>;
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
      return fallbackStorageGet(
        "sync",
        keys.map(String)
      ) as Partial<SyncStorageData>;
    }
    return await new Promise<Partial<SyncStorageData>>((resolve, reject) => {
      chrome.storage.sync.get(keys as string[], (items) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message));
          return;
        }
        resolve(items as Partial<SyncStorageData>);
      });
    });
  };

  const storageSyncSet: PopupRuntime["storageSyncSet"] = async (items) => {
    if (
      !(isExtensionPage && (chrome as unknown as { storage?: unknown }).storage)
    ) {
      fallbackStorageSet("sync", items as Record<string, unknown>);
      return;
    }
    await new Promise<void>((resolve, reject) => {
      chrome.storage.sync.set(items as Record<string, unknown>, () => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message));
          return;
        }
        resolve();
      });
    });
  };

  const storageLocalGet: PopupRuntime["storageLocalGet"] = async (keys) => {
    if (
      !(isExtensionPage && (chrome as unknown as { storage?: unknown }).storage)
    ) {
      return fallbackStorageGet(
        "local",
        keys.map(String)
      ) as Partial<LocalStorageData>;
    }
    return await new Promise<Partial<LocalStorageData>>((resolve, reject) => {
      chrome.storage.local.get(keys as string[], (items) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message));
          return;
        }
        resolve(items as Partial<LocalStorageData>);
      });
    });
  };

  const storageLocalSet: PopupRuntime["storageLocalSet"] = async (items) => {
    if (
      !(isExtensionPage && (chrome as unknown as { storage?: unknown }).storage)
    ) {
      fallbackStorageSet("local", items as Record<string, unknown>);
      return;
    }
    await new Promise<void>((resolve, reject) => {
      chrome.storage.local.set(items as Record<string, unknown>, () => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message));
          return;
        }
        resolve();
      });
    });
  };

  const storageLocalRemove: PopupRuntime["storageLocalRemove"] = async (
    keys
  ) => {
    if (
      !(isExtensionPage && (chrome as unknown as { storage?: unknown }).storage)
    ) {
      fallbackStorageRemove("local", keys as string[] | string);
      return;
    }
    await new Promise<void>((resolve, reject) => {
      chrome.storage.local.remove(keys as string[] | string, () => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message));
          return;
        }
        resolve();
      });
    });
  };

  const getActiveTab: PopupRuntime["getActiveTab"] = async () => {
    if (!(isExtensionPage && (chrome as unknown as { tabs?: unknown }).tabs)) {
      return null;
    }
    const tabs = await new Promise<chrome.tabs.Tab[]>((resolve, reject) => {
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
          resolve(result);
        }
      );
    });
    const [tab] = tabs;
    const id = tab?.id;
    if (id === undefined) {
      return null;
    }
    return { id, title: tab?.title, url: tab?.url };
  };

  const getActiveTabId: PopupRuntime["getActiveTabId"] = async () =>
    (await getActiveTab())?.id ?? null;

  const sendMessageToBackground: PopupRuntime["sendMessageToBackground"] =
    async <TRequest, TResponse>(message: TRequest): Promise<TResponse> => {
      if (
        !(
          isExtensionPage &&
          (chrome as unknown as { runtime?: unknown }).runtime
        )
      ) {
        throw new Error(
          "拡張機能として開いてください（chrome-extension://...）"
        );
      }
      return await new Promise<TResponse>((resolve, reject) => {
        chrome.runtime.sendMessage(message, (response) => {
          const err = chrome.runtime.lastError;
          if (err) {
            reject(new Error(err.message));
            return;
          }
          resolve(response as TResponse);
        });
      });
    };

  const sendMessageToTab: PopupRuntime["sendMessageToTab"] = async <
    TRequest,
    TResponse,
  >(
    tabId: number,
    message: TRequest
  ): Promise<TResponse> => {
    if (!(isExtensionPage && (chrome as unknown as { tabs?: unknown }).tabs)) {
      throw new Error("拡張機能として開いてください（chrome-extension://...）");
    }
    return await new Promise<TResponse>((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message));
          return;
        }
        resolve(response as TResponse);
      });
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
