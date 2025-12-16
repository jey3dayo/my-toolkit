export type PopupNavigationEnvironment = {
  isExtensionPage: boolean;
  storagePrefix: string;
  document: Document;
  window: Window;
};

type NavigationElements = {
  body: HTMLElement;
  content: HTMLElement | null;
  navItems: HTMLElement[];
  panes: HTMLElement[];
  heroChip: HTMLSpanElement | null;
  ctaPill: HTMLButtonElement | null;
  sidebarToggle: HTMLButtonElement | null;
  sidebarHome: HTMLButtonElement | null;
};

const SIDEBAR_COLLAPSED_KEY_SUFFIX = 'sidebarCollapsed';

function getElements(document: Document): NavigationElements {
  return {
    body: document.body,
    content: document.querySelector<HTMLElement>('.content'),
    navItems: Array.from(document.querySelectorAll<HTMLElement>('.nav-item[data-target]')),
    panes: Array.from(document.querySelectorAll<HTMLElement>('.pane')),
    heroChip: document.getElementById('hero-chip') as HTMLSpanElement | null,
    ctaPill: document.getElementById('cta-pill') as HTMLButtonElement | null,
    sidebarToggle: document.getElementById('sidebar-toggle') as HTMLButtonElement | null,
    sidebarHome: document.getElementById('sidebar-home') as HTMLButtonElement | null,
  };
}

function updateHero(elements: NavigationElements, activeTargetId?: string): void {
  const { heroChip, ctaPill } = elements;
  if (!heroChip || !ctaPill) return;

  ctaPill.textContent = '';
  ctaPill.hidden = true;

  if (activeTargetId === 'pane-actions') {
    heroChip.textContent = 'アクション';
    return;
  }
  if (activeTargetId === 'pane-settings') {
    heroChip.textContent = '設定';
    return;
  }
  heroChip.textContent = 'テーブルソート';
}

function resolveTargetId(elements: NavigationElements, targetId?: string): string | undefined {
  if (targetId) return targetId;
  const fromActive = elements.navItems.find(item => item.classList.contains('active'))?.dataset.target;
  if (fromActive) return fromActive;
  return elements.panes[0]?.id;
}

function setActive(elements: NavigationElements, targetId?: string): void {
  const resolvedTargetId = resolveTargetId(elements, targetId);
  if (!resolvedTargetId) return;

  elements.navItems.forEach(nav => {
    const isActive = nav.dataset.target === resolvedTargetId;
    nav.classList.toggle('active', isActive);
    nav.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  elements.panes.forEach(pane => {
    pane.classList.toggle('active', pane.id === resolvedTargetId);
  });

  updateHero(elements, resolvedTargetId);

  if (elements.content) {
    elements.content.scrollTop = 0;
    elements.content.scrollLeft = 0;
  }
}

function getTargetFromHash(document: Document, window: Window): string | undefined {
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return undefined;
  if (!document.getElementById(hash)) return undefined;
  return hash;
}

function safelyReplaceHash(window: Window, nextHash: string): void {
  try {
    if (window.location.hash === nextHash) return;
    window.history.replaceState(null, '', nextHash);
  } catch {
    window.location.hash = nextHash;
  }
}

function readSidebarCollapsed(window: Window, storageKey: string): boolean {
  try {
    const raw = window.localStorage.getItem(storageKey);
    // 右側レール（アイコン中心）を基本にしたいので、未設定時は折りたたみ状態をデフォルトにする。
    if (raw === null) return true;
    return raw === '1';
  } catch {
    return true;
  }
}

function writeSidebarCollapsed(window: Window, storageKey: string, collapsed: boolean): void {
  try {
    window.localStorage.setItem(storageKey, collapsed ? '1' : '0');
  } catch {
    // ignore
  }
}

function applySidebarCollapsed(elements: NavigationElements, collapsed: boolean): void {
  elements.body.classList.toggle('sidebar-collapsed', collapsed);
  if (elements.sidebarToggle) {
    elements.sidebarToggle.setAttribute('aria-pressed', collapsed ? 'true' : 'false');
    elements.sidebarToggle.title = collapsed ? 'メニューを開く' : 'メニューを折りたたむ';
  }
}

function setupSidebarCollapse(env: PopupNavigationEnvironment, elements: NavigationElements): void {
  const storageKey = `${env.storagePrefix}${SIDEBAR_COLLAPSED_KEY_SUFFIX}`;
  applySidebarCollapsed(elements, readSidebarCollapsed(env.window, storageKey));

  elements.sidebarToggle?.addEventListener('click', () => {
    const nextCollapsed = !elements.body.classList.contains('sidebar-collapsed');
    applySidebarCollapsed(elements, nextCollapsed);
    writeSidebarCollapsed(env.window, storageKey, nextCollapsed);
  });
}

function setupSidebarHome(env: PopupNavigationEnvironment, elements: NavigationElements): void {
  elements.sidebarHome?.addEventListener('click', () => {
    if (!env.isExtensionPage) {
      env.window.location.hash = '#pane-actions';
      return;
    }

    setActive(elements, 'pane-actions');
    safelyReplaceHash(env.window, '#pane-actions');
  });
}

function setupTabs(env: PopupNavigationEnvironment, elements: NavigationElements): void {
  elements.navItems.forEach(item => {
    item.addEventListener('click', event => {
      if (!env.isExtensionPage) {
        // 通常ページ（file:// など）ではアンカーのデフォルト挙動に任せて `:target` を更新する。
        // `hashchange` で setActive が呼ばれるので、ここで何もしなくてOK。
        return;
      }

      // `href="#pane-..."` のデフォルト挙動（アンカーへのスクロール）を止めて、
      // タブ切り替え時にスクロール位置が意図せず動かないようにする。
      event.preventDefault();

      const targetId = item.dataset.target;
      if (!targetId) return;

      setActive(elements, targetId);
      safelyReplaceHash(env.window, `#${targetId}`);
    });
  });

  env.window.addEventListener('hashchange', () => {
    setActive(elements, getTargetFromHash(env.document, env.window));
  });

  setActive(elements, getTargetFromHash(env.document, env.window));
}

export function setupPopupNavigation(env: PopupNavigationEnvironment): void {
  const elements = getElements(env.document);

  // 拡張機能ページではJSでタブ切り替え（.active）を制御できるので、
  // CSSの `:target` フォールバック（no-js）を無効化する。
  if (env.isExtensionPage) {
    elements.body.classList.remove('no-js');
  }

  if (elements.ctaPill && !env.isExtensionPage) {
    elements.ctaPill.disabled = true;
  }

  setupSidebarCollapse(env, elements);
  setupSidebarHome(env, elements);
  setupTabs(env, elements);
}
