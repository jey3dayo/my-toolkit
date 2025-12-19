import type {
  ActiveTabInfo,
  PopupRuntime,
  RunContextActionRequest,
  SyncStorageData,
  TestOpenAiTokenRequest,
} from "@/popup/runtime";
import type { LocalStorageData } from "@/storage/types";

type Options = {
  sync?: Partial<SyncStorageData>;
  local?: Partial<LocalStorageData>;
  activeTab?: ActiveTabInfo | null;
  activeTabId?: number | null;
  background?: {
    testOpenAiToken?: (
      message: TestOpenAiTokenRequest
    ) => unknown | Promise<unknown>;
    runContextAction?: (
      message: RunContextActionRequest
    ) => unknown | Promise<unknown>;
  };
};

type InMemoryStorageArea<T extends Record<string, unknown>> = {
  get: (keys: (keyof T)[]) => Promise<Partial<T>>;
  set: (items: Partial<T>) => Promise<void>;
  remove: (keys: (keyof T)[] | keyof T) => Promise<void>;
};

function createInMemoryStorageArea<T extends Record<string, unknown>>(
  initial?: Partial<T>
): InMemoryStorageArea<T> {
  const data = new Map<string, unknown>(Object.entries(initial ?? {}));

  return {
    get: (keys) => {
      const result: Partial<T> = {};
      for (const key of keys) {
        const stored = data.get(String(key));
        if (typeof stored === "undefined") {
          continue;
        }
        (result as Record<string, unknown>)[String(key)] = stored;
      }
      return Promise.resolve(result);
    },
    set: (items) => {
      for (const [key, value] of Object.entries(items)) {
        if (typeof value === "undefined") {
          continue;
        }
        data.set(key, value);
      }
      return Promise.resolve();
    },
    remove: (keys) => {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const key of list) {
        data.delete(String(key));
      }
      return Promise.resolve();
    },
  };
}

function getMessageAction(message: unknown): unknown {
  if (typeof message !== "object" || message === null) {
    return null;
  }
  return (message as { action?: unknown }).action ?? null;
}

export function createStoryPopupRuntime(options: Options = {}): PopupRuntime {
  let activeTab: ActiveTabInfo | null;
  if (typeof options.activeTab !== "undefined") {
    activeTab = options.activeTab;
  } else if (options.activeTabId === null) {
    activeTab = null;
  } else {
    activeTab = { id: options.activeTabId ?? 123 };
  }
  const sync = createInMemoryStorageArea<SyncStorageData>(options.sync);
  const local = createInMemoryStorageArea<LocalStorageData>(options.local);

  return {
    isExtensionPage: false,
    storageSyncGet: sync.get,
    storageSyncSet: sync.set,
    storageLocalGet: local.get,
    storageLocalSet: local.set,
    storageLocalRemove: local.remove,
    getActiveTab: async () => activeTab,
    getActiveTabId: async () => activeTab?.id ?? null,
    sendMessageToBackground: async (message) => {
      const action = getMessageAction(message);

      if (action === "testOpenAiToken") {
        if (options.background?.testOpenAiToken) {
          return (await options.background.testOpenAiToken(
            message as TestOpenAiTokenRequest
          )) as never;
        }
        return { ok: true } as never;
      }

      if (action === "runContextAction") {
        if (options.background?.runContextAction) {
          return (await options.background.runContextAction(
            message as RunContextActionRequest
          )) as never;
        }
        return {
          ok: false,
          error: "storybook runtime: not implemented",
        } as never;
      }

      return {} as never;
    },
    sendMessageToTab: async () => ({ success: true }) as never,
    openUrl: (url) => {
      try {
        const trimmed = url.trim();
        if (!trimmed) {
          return;
        }
        window.open(trimmed, "_blank", "noopener,noreferrer");
      } catch {
        // no-op
      }
    },
  };
}
