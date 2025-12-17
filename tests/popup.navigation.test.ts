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
          <button id="cta-pill" type="button"></button>
        </header>
        <div class="content-body">
          <section class="pane active" id="pane-actions" role="tabpanel"></section>
          <section class="pane" id="pane-table" role="tabpanel"></section>
          <section class="pane" id="pane-settings" role="tabpanel"></section>
        </div>
      </main>
      <div id="menu-scrim"></div>
      <aside id="menu-drawer">
        <button id="menu-close" type="button">close</button>
        <a class="menu-item" data-target="pane-actions" href="#pane-actions"></a>
        <a class="menu-item" data-target="pane-table" href="#pane-table"></a>
        <a class="menu-item" data-target="pane-settings" href="#pane-settings"></a>
      </aside>
      <aside class="sidebar">
        <button id="sidebar-toggle" type="button" aria-label="メニューを切り替え" aria-pressed="false">toggle</button>
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

  it('opens and closes the menu drawer via toggle', () => {
    const dom = createPopupDom();
    setupPopupNavigation({
      isExtensionPage: true,
      storagePrefix: 'mbu:popup:',
      window: dom.window,
      document: dom.window.document,
    });

    expect(dom.window.document.body.classList.contains('menu-open')).toBe(false);

    dom.window.document.getElementById('sidebar-toggle')?.click();
    expect(dom.window.document.body.classList.contains('menu-open')).toBe(true);
    expect(dom.window.document.getElementById('menu-drawer')?.getAttribute('aria-hidden')).toBe('false');
    expect(dom.window.document.getElementById('sidebar-toggle')?.getAttribute('aria-pressed')).toBe('true');

    dom.window.document.getElementById('sidebar-toggle')?.click();
    expect(dom.window.document.body.classList.contains('menu-open')).toBe(false);
    expect(dom.window.document.getElementById('menu-drawer')?.getAttribute('aria-hidden')).toBe('true');
    expect(dom.window.document.getElementById('sidebar-toggle')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('closes the menu drawer via scrim and escape', () => {
    const dom = createPopupDom();
    setupPopupNavigation({
      isExtensionPage: true,
      storagePrefix: 'mbu:popup:',
      window: dom.window,
      document: dom.window.document,
    });

    dom.window.document.getElementById('sidebar-toggle')?.click();
    expect(dom.window.document.body.classList.contains('menu-open')).toBe(true);

    dom.window.document.getElementById('menu-scrim')?.dispatchEvent(new dom.window.Event('click'));
    expect(dom.window.document.body.classList.contains('menu-open')).toBe(false);

    dom.window.document.getElementById('sidebar-toggle')?.click();
    expect(dom.window.document.body.classList.contains('menu-open')).toBe(true);

    dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' }));
    expect(dom.window.document.body.classList.contains('menu-open')).toBe(false);
  });

  it('switches panes and updates hash for extension pages', () => {
    const dom = createPopupDom('https://example.test/popup.html#pane-settings');
    setupPopupNavigation({
      isExtensionPage: true,
      storagePrefix: 'mbu:popup:',
      window: dom.window,
      document: dom.window.document,
    });

    const tableTab = dom.window.document.querySelector<HTMLElement>('.menu-item[data-target="pane-table"]');
    tableTab?.click();

    expect(dom.window.location.hash).toBe('#pane-table');
    expect(dom.window.document.getElementById('pane-table')?.classList.contains('active')).toBe(true);
    expect(dom.window.document.querySelector('.nav-item.active')?.getAttribute('data-target')).toBe('pane-table');
    expect(dom.window.document.querySelector('.nav-item.active')?.getAttribute('aria-selected')).toBe('true');
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
