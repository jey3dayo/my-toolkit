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
  menuDrawer: HTMLElement | null;
  menuScrim: HTMLElement | null;
  menuClose: HTMLButtonElement | null;
};

function getElements(document: Document): NavigationElements {
  return {
    body: document.body,
    content: document.querySelector<HTMLElement>('.content-body'),
    navItems: Array.from(document.querySelectorAll<HTMLElement>('[data-target]')),
    panes: Array.from(document.querySelectorAll<HTMLElement>('.pane')),
    heroChip: document.getElementById('hero-chip') as HTMLSpanElement | null,
    ctaPill: document.getElementById('cta-pill') as HTMLButtonElement | null,
    sidebarToggle: document.getElementById('sidebar-toggle') as HTMLButtonElement | null,
    menuDrawer: document.getElementById('menu-drawer'),
    menuScrim: document.getElementById('menu-scrim'),
    menuClose: document.getElementById('menu-close') as HTMLButtonElement | null,
  };
}

function updateHero(elements: NavigationElements, activeTargetId?: string): void {
  const { heroChip, ctaPill } = elements;
  if (!(heroChip && ctaPill)) return;

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
  if (!hash) return;
  if (!document.getElementById(hash)) return;
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

type MenuDrawerApi = {
  closeMenu: () => void;
  openMenu: () => void;
  toggleMenu: () => void;
  isOpen: () => boolean;
};

function setupMenuDrawer(env: PopupNavigationEnvironment, elements: NavigationElements): MenuDrawerApi {
  let lastActiveElement: HTMLElement | null = null;

  const isOpen = (): boolean => elements.body.classList.contains('menu-open');

  const applyOpen = (open: boolean): void => {
    elements.body.classList.toggle('menu-open', open);
    if (elements.sidebarToggle) {
      elements.sidebarToggle.setAttribute('aria-pressed', open ? 'true' : 'false');
      elements.sidebarToggle.title = open ? 'メニューを閉じる' : 'メニュー';
    }
    if (elements.menuDrawer) {
      elements.menuDrawer.setAttribute('aria-hidden', open ? 'false' : 'true');
      // ドロワーが閉じている間はフォーカスできないようにする（aria-hidden警告を避ける）
      elements.menuDrawer.toggleAttribute('inert', !open);
    }
  };

  const openMenu = (): void => {
    if (isOpen()) return;
    lastActiveElement = env.document.activeElement instanceof HTMLElement ? env.document.activeElement : null;
    applyOpen(true);
    env.window.setTimeout(() => {
      const focusTarget =
        elements.menuClose ||
        (elements.menuDrawer?.querySelector<HTMLElement>('a[href],button,[tabindex]:not([tabindex="-1"])') ?? null);
      focusTarget?.focus();
    }, 0);
  };

  const closeMenu = (): void => {
    if (!isOpen()) return;
    // aria-hidden を付与する前にフォーカスを外へ退避させる（警告回避）
    const active = env.document.activeElement;
    if (active instanceof HTMLElement && elements.menuDrawer?.contains(active)) {
      const body = elements.body;
      const prevTabIndex = body.getAttribute('tabindex');
      body.setAttribute('tabindex', '-1');
      body.focus();
      if (prevTabIndex === null) {
        body.removeAttribute('tabindex');
      } else {
        body.setAttribute('tabindex', prevTabIndex);
      }
    }

    applyOpen(false);

    env.window.setTimeout(() => {
      let focusTarget = lastActiveElement;
      if (focusTarget && !focusTarget.isConnected) {
        focusTarget = null;
      }
      if (focusTarget && elements.menuDrawer?.contains(focusTarget)) {
        focusTarget = null;
      }
      if (!focusTarget) {
        focusTarget = elements.sidebarToggle;
      }
      focusTarget?.focus();
    }, 0);
  };

  const toggleMenu = (): void => {
    if (isOpen()) {
      closeMenu();
      return;
    }
    openMenu();
  };

  elements.sidebarToggle?.addEventListener('click', () => {
    toggleMenu();
  });

  elements.menuClose?.addEventListener('click', () => {
    closeMenu();
  });

  elements.menuScrim?.addEventListener('click', () => {
    closeMenu();
  });

  env.window.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    closeMenu();
  });

  // ドロワー内のメニュー選択後は閉じる
  elements.menuDrawer?.addEventListener('click', event => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const menuItem = target.closest<HTMLElement>('[data-target]');
    if (!menuItem) return;
    closeMenu();
  });

  // 通常ページ（file:// など）で開いた場合は初期状態で閉じておく
  applyOpen(false);

  return { closeMenu, openMenu, toggleMenu, isOpen };
}

function setupTabs(env: PopupNavigationEnvironment, elements: NavigationElements, menu: MenuDrawerApi): void {
  elements.navItems.forEach(item => {
    item.addEventListener('click', event => {
      // ドロワー内/外どちらからでも、タブ切り替え時はメニューを閉じる
      menu.closeMenu();

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
    menu.closeMenu();
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

  const menu = setupMenuDrawer(env, elements);
  setupTabs(env, elements, menu);
}
