import { vi } from "vitest";

export type PopupChromeStub = {
  runtime: {
    lastError: { message: string } | null;
    sendMessage: ReturnType<typeof vi.fn>;
  };
  storage: {
    sync: {
      get: ReturnType<typeof vi.fn>;
      set: ReturnType<typeof vi.fn>;
    };
    local: {
      get: ReturnType<typeof vi.fn>;
      set: ReturnType<typeof vi.fn>;
      remove: ReturnType<typeof vi.fn>;
    };
  };
  tabs: {
    query: ReturnType<typeof vi.fn>;
    sendMessage: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
};

export function createPopupChromeStub(): PopupChromeStub {
  const runtime = {
    lastError: null as { message: string } | null,
    sendMessage: vi.fn(
      (_message: unknown, callback?: (resp: unknown) => void) => {
        runtime.lastError = null;
        callback?.({ ok: true });
      }
    ),
  };

  const clearError = (): void => {
    runtime.lastError = null;
  };

  return {
    runtime,
    storage: {
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
    },
    tabs: {
      query: vi.fn(
        (_queryInfo: unknown, callback?: (tabs: unknown[]) => void) => {
          clearError();
          callback?.([]);
        }
      ),
      sendMessage: vi.fn((...args: unknown[]) => {
        clearError();
        const callback = args.find((item) => typeof item === "function") as
          | ((resp: unknown) => void)
          | undefined;
        if (!callback) {
          return;
        }
        const message = args[1] as { action?: unknown } | undefined;
        if (message?.action === "getSummaryTargetText") {
          callback({
            text: "stub selection",
            source: "selection",
            title: "stub title",
            url: "https://example.com",
          });
          return;
        }
        callback({ ok: true });
      }),
      create: vi.fn((_createProperties: unknown, callback?: () => void) => {
        clearError();
        callback?.();
      }),
    },
  };
}
