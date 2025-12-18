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
    create: ReturnType<typeof vi.fn>;
  };
};

function createPopupDom(url = 'chrome-extension://test/popup.html#pane-actions'): JSDOM {
  const html = `<!doctype html>
  <html lang="ja">
    <head></head>
    <body>
      <div id="root"></div>
    </body>
  </html>`;

  return new JSDOM(html, { url });
}

function createChromeStub(overrides?: Partial<ChromeStub>): ChromeStub {
  const runtime = {
    lastError: null as { message: string } | null,
    sendMessage: vi.fn(),
  };

  const chromeStub: ChromeStub = {
    runtime,
    storage: {
      sync: {
        get: vi.fn(),
        set: vi.fn((_items: unknown, callback: () => void) => {
          runtime.lastError = null;
          callback();
        }),
      },
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
    },
    tabs: {
      query: vi.fn(),
      create: vi.fn(),
    },
  };

  return { ...chromeStub, ...overrides };
}

async function flush(window: Window, times = 5): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await new Promise<void>(resolve => window.setTimeout(resolve, 0));
  }
}

describe('popup context actions (React UI)', () => {
  let dom: JSDOM;
  let chromeStub: ChromeStub;

  beforeEach(async () => {
    vi.resetModules();

    dom = createPopupDom();
    chromeStub = createChromeStub();

    chromeStub.storage.sync.get.mockImplementation((keys: string[], callback: (items: unknown) => void) => {
      chromeStub.runtime.lastError = null;
      const keyList = Array.isArray(keys) ? keys : [String(keys)];
      if (keyList.includes('contextActions')) {
        callback({
          contextActions: [{ id: 'builtin:summarize', title: '要約', kind: 'text', prompt: '{{text}}' }],
        });
        return;
      }
      callback({});
    });

    chromeStub.storage.local.get.mockImplementation((keys: string[], callback: (items: unknown) => void) => {
      chromeStub.runtime.lastError = null;
      const keyList = Array.isArray(keys) ? keys : [String(keys)];
      if (keyList.includes('openaiApiToken')) {
        callback({ openaiApiToken: 'sk-test' });
        return;
      }
      callback({});
    });

    chromeStub.tabs.query.mockImplementation((_queryInfo: unknown, callback: (tabs: unknown[]) => void) => {
      chromeStub.runtime.lastError = null;
      callback([{ id: 1 }]);
    });

    chromeStub.runtime.sendMessage.mockImplementation((message: unknown, callback: (resp: unknown) => void) => {
      chromeStub.runtime.lastError = null;
      const action = (message as { action?: unknown }).action;
      if (action === 'runContextAction') {
        callback({ ok: true, resultType: 'text', text: 'summary', source: 'selection' });
        return;
      }
      callback({ ok: true });
    });

    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('navigator', dom.window.navigator);
    vi.stubGlobal('chrome', chromeStub);

    Object.defineProperty(dom.window.navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn(async () => undefined),
      },
    });

    await act(async () => {
      await import('../src/popup.ts');
      await flush(dom.window);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('runs builtin:summarize and renders the result + source', async () => {
    const button = dom.window.document.querySelector<HTMLButtonElement>('button[data-action-id="builtin:summarize"]');
    expect(button?.textContent).toContain('要約');

    await act(async () => {
      button?.click();
      await flush(dom.window);
    });

    const output = dom.window.document.querySelector<HTMLTextAreaElement>('[data-testid="action-output"]');
    expect(output?.value).toBe('summary');

    const source = dom.window.document.querySelector('[data-testid="action-source"]');
    expect(source?.textContent).toBe('選択範囲');

    expect(chromeStub.runtime.sendMessage).toHaveBeenCalled();
  });

  it('renders template variable hints', () => {
    const hints = dom.window.document.querySelector('[data-testid="template-vars"]');
    expect(hints?.textContent).toContain('{{text}}');
    expect(hints?.textContent).toContain('{{title}}');
    expect(hints?.textContent).toContain('{{url}}');
    expect(hints?.textContent).toContain('{{source}}');
  });

  it('copies output text to clipboard and shows a success toast', async () => {
    const button = dom.window.document.querySelector<HTMLButtonElement>('button[data-action-id="builtin:summarize"]');
    await act(async () => {
      button?.click();
      await flush(dom.window);
    });

    const copyButton = dom.window.document.querySelector<HTMLButtonElement>('[data-testid="copy-output"]');
    expect(copyButton).not.toBeNull();

    await act(async () => {
      copyButton?.click();
      await flush(dom.window);
    });

    const clipboard = dom.window.navigator.clipboard as unknown as { writeText: ReturnType<typeof vi.fn> };
    expect(clipboard.writeText).toHaveBeenCalledWith('summary');
    expect(dom.window.document.body.textContent).toContain('コピーしました');
  });

  it('shows an error toast when clipboard write fails and keeps output intact', async () => {
    const clipboard = dom.window.navigator.clipboard as unknown as { writeText: ReturnType<typeof vi.fn> };
    clipboard.writeText.mockRejectedValueOnce(new Error('denied'));

    const button = dom.window.document.querySelector<HTMLButtonElement>('button[data-action-id="builtin:summarize"]');
    await act(async () => {
      button?.click();
      await flush(dom.window);
    });

    const output = dom.window.document.querySelector<HTMLTextAreaElement>('[data-testid="action-output"]');
    expect(output?.value).toBe('summary');

    const copyButton = dom.window.document.querySelector<HTMLButtonElement>('[data-testid="copy-output"]');
    await act(async () => {
      copyButton?.click();
      await flush(dom.window);
    });

    expect(dom.window.document.body.textContent).toContain('コピーに失敗しました');
    expect(output?.value).toBe('summary');
  });

  it('does not crash when background returns an invalid response', async () => {
    chromeStub.runtime.sendMessage.mockImplementationOnce((_message: unknown, callback: (resp: unknown) => void) => {
      chromeStub.runtime.lastError = null;
      callback(undefined);
    });

    const button = dom.window.document.querySelector<HTMLButtonElement>('button[data-action-id="builtin:summarize"]');
    await act(async () => {
      button?.click();
      await flush(dom.window);
    });

    const output = dom.window.document.querySelector<HTMLTextAreaElement>('[data-testid="action-output"]');
    expect(output?.value).toBe('');
  });
});
