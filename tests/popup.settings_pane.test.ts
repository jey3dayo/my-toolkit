import { JSDOM } from 'jsdom';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type ChromeStub = {
  runtime: {
    lastError: { message: string } | null;
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
  };
  tabs: {
    query: ReturnType<typeof vi.fn>;
  };
};

function createPopupDom(url = 'chrome-extension://test/popup.html#pane-settings'): JSDOM {
  const html = `<!doctype html>
  <html lang="ja">
    <head></head>
    <body>
      <div id="root"></div>
    </body>
  </html>`;

  return new JSDOM(html, { url });
}

function createChromeStub(): ChromeStub {
  const runtime = {
    lastError: null as { message: string } | null,
    sendMessage: vi.fn(),
  };

  return {
    runtime,
    storage: {
      local: {
        get: vi.fn(),
        set: vi.fn((_items: unknown, callback: () => void) => {
          runtime.lastError = null;
          callback();
        }),
        remove: vi.fn((_keys: unknown, callback: () => void) => {
          runtime.lastError = null;
          callback();
        }),
      },
      sync: {
        get: vi.fn((_keys: unknown, callback: (items: unknown) => void) => callback({})),
        set: vi.fn((_items: unknown, callback: () => void) => callback()),
      },
    },
    tabs: {
      query: vi.fn(),
    },
  };
}

async function flush(window: Window, times = 5): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await new Promise<void>(resolve => window.setTimeout(resolve, 0));
  }
}

function inputValue(
  window: Window,
  el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
): void {
  const proto = Object.getPrototypeOf(el) as object;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  if (descriptor?.set) {
    descriptor.set.call(el, value);
  } else {
    el.value = value;
  }
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
  el.dispatchEvent(new window.Event('change', { bubbles: true }));
}

describe('popup Settings pane', () => {
  let dom: JSDOM;
  let chromeStub: ChromeStub;

  beforeEach(async () => {
    vi.resetModules();

    dom = createPopupDom();
    chromeStub = createChromeStub();

    chromeStub.storage.local.get.mockImplementation((keys: string[], callback: (items: unknown) => void) => {
      chromeStub.runtime.lastError = null;
      const keyList = Array.isArray(keys) ? keys : [String(keys)];
      const items: Record<string, unknown> = {};
      if (keyList.includes('openaiApiToken')) items.openaiApiToken = 'sk-existing';
      if (keyList.includes('openaiCustomPrompt')) items.openaiCustomPrompt = 'prompt';
      if (keyList.includes('openaiModel')) items.openaiModel = 'gpt-4o';
      callback(items);
    });

    chromeStub.runtime.sendMessage.mockImplementation((message: unknown, callback: (resp: unknown) => void) => {
      chromeStub.runtime.lastError = null;
      const action = (message as { action?: unknown }).action;
      if (action === 'testOpenAiToken') {
        callback({ ok: true });
        return;
      }
      callback({ ok: true });
    });

    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('navigator', dom.window.navigator);
    vi.stubGlobal('chrome', chromeStub);

    await act(async () => {
      await import('../src/popup.ts');
      await flush(dom.window);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('toggles token visibility without changing the token value', async () => {
    const token = dom.window.document.querySelector<HTMLInputElement>('[data-testid="openai-token"]');
    const toggle = dom.window.document.querySelector<HTMLInputElement>('[data-testid="token-visible"]');
    expect(token).not.toBeNull();
    expect(toggle).not.toBeNull();

    expect(token?.type).toBe('password');
    expect(token?.value).toBe('sk-existing');

    await act(async () => {
      toggle?.click();
      await flush(dom.window);
    });

    expect(token?.type).toBe('text');
    expect(token?.value).toBe('sk-existing');
  });

  it('saves and clears the token using local storage', async () => {
    const token = dom.window.document.querySelector<HTMLInputElement>('[data-testid="openai-token"]');
    const save = dom.window.document.querySelector<HTMLButtonElement>('[data-testid="token-save"]');
    const clear = dom.window.document.querySelector<HTMLButtonElement>('[data-testid="token-clear"]');

    await act(async () => {
      inputValue(dom.window, token as HTMLInputElement, 'sk-new');
      save?.click();
      await flush(dom.window);
    });

    expect(chromeStub.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({ openaiApiToken: 'sk-new' }),
      expect.any(Function),
    );

    await act(async () => {
      clear?.click();
      await flush(dom.window);
    });

    expect(chromeStub.storage.local.remove).toHaveBeenCalledWith('openaiApiToken', expect.any(Function));
  });

  it('tests the token via background messaging and shows feedback', async () => {
    const testButton = dom.window.document.querySelector<HTMLButtonElement>('[data-testid="token-test"]');
    expect(testButton).not.toBeNull();

    await act(async () => {
      testButton?.click();
      await flush(dom.window);
    });

    expect(chromeStub.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'testOpenAiToken' }),
      expect.any(Function),
    );
    expect(dom.window.document.body.textContent).toContain('トークン');
  });

  it('saves and clears the custom prompt using local storage', async () => {
    const prompt = dom.window.document.querySelector<HTMLTextAreaElement>('[data-testid="custom-prompt"]');
    const save = dom.window.document.querySelector<HTMLButtonElement>('[data-testid="prompt-save"]');
    const clear = dom.window.document.querySelector<HTMLButtonElement>('[data-testid="prompt-clear"]');

    await act(async () => {
      inputValue(dom.window, prompt as HTMLTextAreaElement, 'custom prompt');
      save?.click();
      await flush(dom.window);
    });

    expect(chromeStub.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({ openaiCustomPrompt: 'custom prompt' }),
      expect.any(Function),
    );

    await act(async () => {
      clear?.click();
      await flush(dom.window);
    });

    expect(chromeStub.storage.local.remove).toHaveBeenCalledWith('openaiCustomPrompt', expect.any(Function));
  });

  it('saves the selected model using local storage', async () => {
    const modelSelect = dom.window.document.querySelector<HTMLSelectElement>('[data-testid="openai-model"]');
    const save = dom.window.document.querySelector<HTMLButtonElement>('[data-testid="model-save"]');
    expect(modelSelect).not.toBeNull();
    expect(save).not.toBeNull();

    expect(modelSelect?.value).toBe('gpt-4o');

    await act(async () => {
      inputValue(dom.window, modelSelect as HTMLSelectElement, 'gpt-4o-mini');
      save?.click();
      await flush(dom.window);
    });

    expect(chromeStub.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({ openaiModel: 'gpt-4o-mini' }),
      expect.any(Function),
    );
  });
});
