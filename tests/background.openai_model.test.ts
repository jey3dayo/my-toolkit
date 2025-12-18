import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ChromeStub = {
  runtime: {
    lastError: { message: string } | null;
    onInstalled: { addListener: ReturnType<typeof vi.fn> };
    onStartup: { addListener: ReturnType<typeof vi.fn> };
    onMessage: { addListener: ReturnType<typeof vi.fn> };
  };
  storage: {
    local: { get: ReturnType<typeof vi.fn> };
    sync: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> };
    onChanged: { addListener: ReturnType<typeof vi.fn> };
  };
  contextMenus: {
    removeAll: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    onClicked: { addListener: ReturnType<typeof vi.fn> };
  };
  tabs: { sendMessage: ReturnType<typeof vi.fn> };
};

function createChromeStub(listeners: Array<(...args: unknown[]) => unknown>): ChromeStub {
  const runtime = {
    lastError: null as { message: string } | null,
    onInstalled: { addListener: vi.fn() },
    onStartup: { addListener: vi.fn() },
    onMessage: {
      addListener: vi.fn((listener: (...args: unknown[]) => unknown) => {
        listeners.push(listener);
      }),
    },
  };

  return {
    runtime,
    storage: {
      local: {
        get: vi.fn(),
      },
      sync: {
        get: vi.fn((_keys: unknown, callback: (items: unknown) => void) => {
          runtime.lastError = null;
          callback({});
        }),
        set: vi.fn((_items: unknown, callback: () => void) => {
          runtime.lastError = null;
          callback();
        }),
      },
      onChanged: {
        addListener: vi.fn(),
      },
    },
    contextMenus: {
      removeAll: vi.fn((callback: () => void) => {
        runtime.lastError = null;
        callback();
      }),
      create: vi.fn((_createProperties: unknown, callback: () => void) => {
        runtime.lastError = null;
        callback();
      }),
      onClicked: {
        addListener: vi.fn(),
      },
    },
    tabs: {
      sendMessage: vi.fn(),
    },
  };
}

async function flush(times = 6): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
}

describe('background: OpenAI model selection', () => {
  let listeners: Array<(...args: unknown[]) => unknown>;
  let chromeStub: ChromeStub;

  beforeEach(async () => {
    vi.resetModules();
    listeners = [];
    chromeStub = createChromeStub(listeners);

    chromeStub.storage.local.get.mockImplementation((keys: string[], callback: (items: unknown) => void) => {
      chromeStub.runtime.lastError = null;
      const keyList = Array.isArray(keys) ? keys : [String(keys)];
      const items: Record<string, unknown> = {};
      if (keyList.includes('openaiApiToken')) items.openaiApiToken = 'sk-test';
      if (keyList.includes('openaiCustomPrompt')) items.openaiCustomPrompt = '';
      if (keyList.includes('openaiModel')) items.openaiModel = 'gpt-4o';
      callback(items);
    });

    vi.stubGlobal('chrome', chromeStub);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses openaiModel from local storage in chat completion requests', async () => {
    let capturedModel: string | null = null;

    const fetchSpy = vi.fn(async (_url: string, options?: unknown) => {
      const body = typeof (options as { body?: unknown })?.body === 'string' ? (options as { body: string }).body : '';
      capturedModel = (JSON.parse(body) as { model?: string }).model ?? null;
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
      } as unknown;
    });

    vi.stubGlobal('fetch', fetchSpy as unknown as typeof fetch);

    await import('../src/background.ts');

    const [listener] = listeners;
    if (!listener) throw new Error('missing runtime.onMessage listener');

    const sendResponse = vi.fn();
    listener(
      {
        action: 'summarizeText',
        target: { text: 'hello', source: 'page', title: 't', url: 'u' },
      },
      {},
      sendResponse,
    );

    await flush();
    expect(capturedModel).toBe('gpt-4o');
  });
});
