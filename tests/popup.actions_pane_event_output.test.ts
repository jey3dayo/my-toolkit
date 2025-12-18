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

function createChromeStub(): ChromeStub {
  const runtime = {
    lastError: null as { message: string } | null,
    sendMessage: vi.fn(),
  };

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
}

async function flush(window: Window, times = 5): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await new Promise<void>(resolve => window.setTimeout(resolve, 0));
  }
}

describe('popup Actions pane: event output actions', () => {
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
          contextActions: [{ id: 'builtin:calendar', title: 'カレンダー登録', kind: 'event', prompt: '' }],
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
        callback({
          ok: true,
          resultType: 'event',
          event: { title: 'ミーティング', start: '2025-01-01', allDay: true },
          eventText: '予定: ミーティング',
          calendarUrl: 'https://calendar.google.com/calendar/render?action=TEMPLATE',
          source: 'selection',
        });
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

    Object.defineProperty(dom.window.URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:mbu-test'),
    });
    Object.defineProperty(dom.window.URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
    vi.stubGlobal('URL', dom.window.URL);

    await act(async () => {
      await import('../src/popup.ts');
      await flush(dom.window);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens the calendar URL via chrome.tabs.create', async () => {
    const runButton = dom.window.document.querySelector<HTMLButtonElement>('button[data-action-id="builtin:calendar"]');
    await act(async () => {
      runButton?.click();
      await flush(dom.window);
    });

    const openButton = dom.window.document.querySelector<HTMLButtonElement>('[data-testid="open-calendar"]');
    expect(openButton).not.toBeNull();

    await act(async () => {
      openButton?.click();
      await flush(dom.window);
    });

    expect(chromeStub.tabs.create).toHaveBeenCalledWith({
      url: 'https://calendar.google.com/calendar/render?action=TEMPLATE',
    });
  });

  it('downloads an .ics file for event results', async () => {
    const runButton = dom.window.document.querySelector<HTMLButtonElement>('button[data-action-id="builtin:calendar"]');
    await act(async () => {
      runButton?.click();
      await flush(dom.window);
    });

    const clickSpy = vi.spyOn(dom.window.HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    const downloadButton = dom.window.document.querySelector<HTMLButtonElement>('[data-testid="download-ics"]');
    expect(downloadButton).not.toBeNull();

    await act(async () => {
      downloadButton?.click();
      await flush(dom.window);
    });

    expect((URL as unknown as { createObjectURL: ReturnType<typeof vi.fn> }).createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
  });
});
