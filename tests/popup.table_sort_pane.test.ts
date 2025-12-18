import { JSDOM } from 'jsdom';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type ChromeStub = {
  runtime: {
    lastError: { message: string } | null;
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
  };
};

function createPopupDom(url = 'chrome-extension://test/popup.html#pane-table'): JSDOM {
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
  const runtime = { lastError: null as { message: string } | null };
  return {
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
        get: vi.fn((_keys: string[], callback: (items: unknown) => void) => callback({})),
        set: vi.fn((_items: unknown, callback: () => void) => callback()),
        remove: vi.fn((_keys: unknown, callback: () => void) => callback()),
      },
    },
    tabs: {
      query: vi.fn(),
      sendMessage: vi.fn(),
    },
  };
}

async function flush(window: Window, times = 5): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await new Promise<void>(resolve => window.setTimeout(resolve, 0));
  }
}

function inputValue(window: Window, el: HTMLInputElement, value: string): void {
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

describe('popup Table Sort pane', () => {
  let dom: JSDOM;
  let chromeStub: ChromeStub;

  beforeEach(async () => {
    vi.resetModules();

    dom = createPopupDom();
    chromeStub = createChromeStub();

    chromeStub.storage.sync.get.mockImplementation((keys: string[], callback: (items: unknown) => void) => {
      chromeStub.runtime.lastError = null;
      const keyList = Array.isArray(keys) ? keys : [String(keys)];
      const items: Record<string, unknown> = {};
      if (keyList.includes('domainPatterns')) items.domainPatterns = ['example.com/foo*'];
      if (keyList.includes('autoEnableSort')) items.autoEnableSort = false;
      callback(items);
    });

    chromeStub.tabs.query.mockImplementation((_queryInfo: unknown, callback: (tabs: unknown[]) => void) => {
      chromeStub.runtime.lastError = null;
      callback([{ id: 10 }]);
    });

    chromeStub.tabs.sendMessage.mockImplementation(
      (_tabId: number, _message: unknown, callback: (resp: unknown) => void) => {
        chromeStub.runtime.lastError = null;
        callback({ success: true });
      },
    );

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

  it('sends enableTableSort to the active tab and shows feedback', async () => {
    const enable = dom.window.document.querySelector<HTMLButtonElement>('[data-testid="enable-table-sort"]');
    expect(enable).not.toBeNull();

    await act(async () => {
      enable?.click();
      await flush(dom.window);
    });

    expect(chromeStub.tabs.sendMessage).toHaveBeenCalledWith(10, { action: 'enableTableSort' }, expect.any(Function));
    expect(dom.window.document.body.textContent).toContain('テーブルソートを有効化');
  });

  it('persists auto-enable toggle in sync storage', async () => {
    const checkbox = dom.window.document.querySelector<HTMLInputElement>('[data-testid="auto-enable-sort"]');
    expect(checkbox).not.toBeNull();
    expect(checkbox?.checked).toBe(false);

    await act(async () => {
      checkbox?.click();
      await flush(dom.window);
    });

    expect(chromeStub.storage.sync.set).toHaveBeenCalledWith(
      expect.objectContaining({ autoEnableSort: true }),
      expect.any(Function),
    );
  });

  it('adds and removes URL patterns in sync storage', async () => {
    expect(dom.window.document.body.textContent).toContain('example.com/foo*');

    const input = dom.window.document.querySelector<HTMLInputElement>('[data-testid="pattern-input"]');
    const add = dom.window.document.querySelector<HTMLButtonElement>('[data-testid="pattern-add"]');
    expect(input).not.toBeNull();
    expect(add).not.toBeNull();

    await act(async () => {
      inputValue(dom.window, input as HTMLInputElement, 'foo.com/*');
      add?.click();
      await flush(dom.window);
    });

    expect(chromeStub.storage.sync.set).toHaveBeenCalledWith(
      expect.objectContaining({
        domainPatterns: expect.arrayContaining(['example.com/foo*', 'foo.com/*']),
      }),
      expect.any(Function),
    );

    const remove = dom.window.document.querySelector<HTMLButtonElement>(
      'button[data-pattern-remove="example.com/foo*"]',
    );
    expect(remove).not.toBeNull();

    await act(async () => {
      remove?.click();
      await flush(dom.window);
    });

    const lastCall = chromeStub.storage.sync.set.mock.calls.at(-1)?.[0] as { domainPatterns?: string[] } | undefined;
    expect(lastCall?.domainPatterns).toEqual(['foo.com/*']);
  });
});
