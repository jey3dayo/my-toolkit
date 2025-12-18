import { vi } from 'vitest';

export type ChromeStub = {
  runtime: {
    lastError: { message: string } | null;
    onInstalled: { addListener: ReturnType<typeof vi.fn> };
    onStartup: { addListener: ReturnType<typeof vi.fn> };
    onMessage: { addListener: ReturnType<typeof vi.fn> };
    sendMessage: ReturnType<typeof vi.fn>;
  };
  storage: {
    local: {
      get: ReturnType<typeof vi.fn>;
      set: ReturnType<typeof vi.fn>;
      remove: ReturnType<typeof vi.fn>;
    };
    sync: {
      get: ReturnType<typeof vi.fn>;
      set: ReturnType<typeof vi.fn>;
    };
    onChanged: { addListener: ReturnType<typeof vi.fn> };
  };
  contextMenus: {
    removeAll: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    onClicked: { addListener: ReturnType<typeof vi.fn> };
  };
  tabs: {
    sendMessage: ReturnType<typeof vi.fn>;
  };
};

type Options = {
  listeners?: Array<(...args: unknown[]) => unknown>;
  runtimeSendMessageResponse?: unknown;
  tabsSendMessageResponse?: unknown;
};

export function createChromeStub(options: Options = {}): ChromeStub {
  const runtimeSendMessageResponse = options.runtimeSendMessageResponse ?? { ok: true };
  const tabsSendMessageResponse = options.tabsSendMessageResponse ?? { ok: true };

  const runtime = {
    lastError: null as { message: string } | null,
    onInstalled: { addListener: vi.fn() },
    onStartup: { addListener: vi.fn() },
    onMessage: {
      addListener: vi.fn((listener: (...args: unknown[]) => unknown) => {
        options.listeners?.push(listener);
      }),
    },
    sendMessage: vi.fn((_message: unknown, callback?: (resp: unknown) => void) => {
      runtime.lastError = null;
      callback?.(runtimeSendMessageResponse);
    }),
  };

  const clearError = (): void => {
    runtime.lastError = null;
  };

  return {
    runtime,
    storage: {
      local: {
        get: vi.fn((_keys: unknown, callback?: (items: unknown) => void) => {
          clearError();
          callback?.({});
        }),
        set: vi.fn((_items: unknown, callback?: () => void) => {
          clearError();
          callback?.();
        }),
        remove: vi.fn((_keys: unknown, callback?: () => void) => {
          clearError();
          callback?.();
        }),
      },
      sync: {
        get: vi.fn((_keys: unknown, callback?: (items: unknown) => void) => {
          clearError();
          callback?.({});
        }),
        set: vi.fn((_items: unknown, callback?: () => void) => {
          clearError();
          callback?.();
        }),
      },
      onChanged: {
        addListener: vi.fn(),
      },
    },
    contextMenus: {
      removeAll: vi.fn((callback?: () => void) => {
        clearError();
        callback?.();
      }),
      create: vi.fn((_createProperties: unknown, callback?: () => void) => {
        clearError();
        callback?.();
      }),
      onClicked: {
        addListener: vi.fn(),
      },
    },
    tabs: {
      sendMessage: vi.fn((...args: unknown[]) => {
        clearError();
        const last = args.at(-1);
        if (typeof last === 'function') {
          (last as (resp: unknown) => void)(tabsSendMessageResponse);
        }
      }),
    },
  };
}
