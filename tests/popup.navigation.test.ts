import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { setupPopupNavigation } from '../src/popup/navigation';

function createPopupDom(url = 'https://example.test/popup.html#pane-actions') {
  const html = `<!doctype html>
  <html lang="ja">
    <body class="no-js">
      <main class="content">
        <header class="content-header">
          <span id="hero-chip">-</span>
          <div class="header-actions">
            <button id="sidebar-toggle" type="button" aria-label="メニューを切り替え" aria-pressed="false">toggle</button>
            <button id="cta-pill" type="button"></button>
          </div>
        </header>
        <section class="pane active" id="pane-actions" role="tabpanel"></section>
        <section class="pane" id="pane-table" role="tabpanel"></section>
        <section class="pane" id="pane-settings" role="tabpanel"></section>
      </main>
      <aside class="sidebar">
        <button id="sidebar-home" type="button" data-tooltip="ホーム">home</button>
        <a class="nav-item active" data-target="pane-actions" href="#pane-actions" role="tab"></a>
        <a class="nav-item" data-target="pane-table" href="#pane-table" role="tab"></a>
        <a class="nav-item" data-target="pane-settings" href="#pane-settings" role="tab"></a>
      </aside>
    </body>
  </html>`;

  return new JSDOM(html, { url });
}

describe('setupPopupNavigation', () => {
  it('removes .no-js only for extension pages', () => {
    const dom = createPopupDom();
    setupPopupNavigation({
      isExtensionPage: true,
      storagePrefix: 'mbu:popup:',
      window: dom.window,
      document: dom.window.document,
    });
    expect(dom.window.document.body.classList.contains('no-js')).toBe(false);

    const dom2 = createPopupDom();
    setupPopupNavigation({
      isExtensionPage: false,
      storagePrefix: 'mbu:popup:',
      window: dom2.window,
      document: dom2.window.document,
    });
    expect(dom2.window.document.body.classList.contains('no-js')).toBe(true);
  });

  it('defaults sidebar to collapsed when storage unset and persists on toggle', () => {
    const dom = createPopupDom();
    dom.window.localStorage.clear();

    setupPopupNavigation({
      isExtensionPage: true,
      storagePrefix: 'mbu:popup:',
      window: dom.window,
      document: dom.window.document,
    });

    expect(dom.window.document.body.classList.contains('sidebar-collapsed')).toBe(true);

    dom.window.document.getElementById('sidebar-toggle')?.click();
    expect(dom.window.document.body.classList.contains('sidebar-collapsed')).toBe(false);
    expect(dom.window.localStorage.getItem('mbu:popup:sidebarCollapsed')).toBe('0');

    dom.window.document.getElementById('sidebar-toggle')?.click();
    expect(dom.window.document.body.classList.contains('sidebar-collapsed')).toBe(true);
    expect(dom.window.localStorage.getItem('mbu:popup:sidebarCollapsed')).toBe('1');
  });

  it('switches panes and updates hash for extension pages', () => {
    const dom = createPopupDom('https://example.test/popup.html#pane-settings');
    setupPopupNavigation({
      isExtensionPage: true,
      storagePrefix: 'mbu:popup:',
      window: dom.window,
      document: dom.window.document,
    });

    const tableTab = dom.window.document.querySelector<HTMLElement>('.nav-item[data-target="pane-table"]');
    tableTab?.click();

    expect(dom.window.location.hash).toBe('#pane-table');
    expect(dom.window.document.getElementById('pane-table')?.classList.contains('active')).toBe(true);
    expect(dom.window.document.querySelector('.nav-item.active')?.getAttribute('data-target')).toBe('pane-table');
    expect(dom.window.document.querySelector('.nav-item.active')?.getAttribute('aria-selected')).toBe('true');
  });

  it('sidebar home click navigates back to actions', async () => {
    const dom = createPopupDom('https://example.test/popup.html#pane-settings');
    setupPopupNavigation({
      isExtensionPage: true,
      storagePrefix: 'mbu:popup:',
      window: dom.window,
      document: dom.window.document,
    });

    dom.window.document.getElementById('sidebar-home')?.click();
    await new Promise(resolve => dom.window.setTimeout(resolve, 0));

    expect(dom.window.location.hash).toBe('#pane-actions');
    expect(dom.window.document.getElementById('pane-actions')?.classList.contains('active')).toBe(true);
    expect(dom.window.document.querySelector('.nav-item.active')?.getAttribute('data-target')).toBe('pane-actions');
  });

  it('non-extension pages update active pane via hashchange', () => {
    const dom = createPopupDom('https://example.test/popup.html');
    setupPopupNavigation({
      isExtensionPage: false,
      storagePrefix: 'mbu:popup:',
      window: dom.window,
      document: dom.window.document,
    });

    dom.window.location.hash = '#pane-settings';
    dom.window.dispatchEvent(new dom.window.Event('hashchange'));

    expect(dom.window.document.getElementById('pane-settings')?.classList.contains('active')).toBe(true);
    expect(dom.window.document.querySelector('.nav-item.active')?.getAttribute('data-target')).toBe('pane-settings');
  });
});
