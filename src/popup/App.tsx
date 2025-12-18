import { Dialog, Tabs } from '@base-ui/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createNotifications, ToastHost } from '../ui/toast';
import { coercePaneId, getPaneIdFromHash, type PaneId } from './panes';
import { ActionsPane } from './panes/ActionsPane';
import { SettingsPane } from './panes/SettingsPane';
import { TablePane } from './panes/TablePane';
import { createPopupRuntime } from './runtime';

function replaceHash(nextHash: string): void {
  try {
    if (window.location.hash === nextHash) return;
    window.history.replaceState(null, '', nextHash);
  } catch {
    window.location.hash = nextHash;
  }
}

export function PopupApp(): React.JSX.Element {
  const initialValue = useMemo<PaneId>(() => getPaneIdFromHash(window.location.hash) ?? 'pane-actions', []);
  const [tabValue, setTabValue] = useState<PaneId>(initialValue);
  const [menuOpen, setMenuOpen] = useState(false);
  const tokenInputRef = useRef<HTMLInputElement | null>(null);

  const runtime = useMemo(() => createPopupRuntime(), []);
  const notifications = useMemo(() => createNotifications(), []);

  const focusTokenInput = useCallback(() => {
    window.setTimeout(() => {
      try {
        tokenInputRef.current?.focus();
      } catch {
        // no-op
      }
    }, 0);
  }, []);

  const navigateToPane = useCallback((paneId: PaneId) => {
    setTabValue(paneId);
    setMenuOpen(false);
  }, []);

  const syncFromHash = useCallback(() => {
    const next = getPaneIdFromHash(window.location.hash);
    if (!next) return;
    setTabValue(next);
  }, []);

  useEffect(() => {
    window.addEventListener('hashchange', syncFromHash);
    return () => {
      window.removeEventListener('hashchange', syncFromHash);
    };
  }, [syncFromHash]);

  useEffect(() => {
    replaceHash(`#${tabValue}`);
  }, [tabValue]);

  useEffect(() => {
    document.body.classList.toggle('menu-open', menuOpen);
    return () => {
      document.body.classList.remove('menu-open');
    };
  }, [menuOpen]);

  return (
    <Tabs.Root
      onValueChange={value => {
        setTabValue(coercePaneId(value));
        setMenuOpen(false);
      }}
      value={tabValue}
    >
      <div className="app-shell mbu-surface">
        <ToastHost portalContainer={document.body} toastManager={notifications.toastManager} />
        <main className="content">
          <header className="content-header">
            <div className="title-block">
              <div className="hero-logo-wrap">
                <img alt="My Browser Utils" className="hero-logo" height={32} src="icons/icon48.png" width={32} />
              </div>
              <div className="title-text">
                <div className="title-row">
                  <h1>ブラウザ作業を整える相棒</h1>
                </div>
              </div>
            </div>
          </header>

          <div className="content-body">
            <Tabs.Panel data-pane="pane-actions" value="pane-actions">
              <ActionsPane
                focusTokenInput={focusTokenInput}
                navigateToPane={navigateToPane}
                notify={notifications.notify}
                runtime={runtime}
              />
            </Tabs.Panel>
            <Tabs.Panel data-pane="pane-table" value="pane-table">
              <TablePane notify={notifications.notify} runtime={runtime} />
            </Tabs.Panel>
            <Tabs.Panel data-pane="pane-settings" value="pane-settings">
              <SettingsPane notify={notifications.notify} runtime={runtime} tokenInputRef={tokenInputRef} />
            </Tabs.Panel>
          </div>
        </main>

        <aside aria-label="メニュー" className="sidebar">
          <Dialog.Root onOpenChange={setMenuOpen} open={menuOpen}>
            <Dialog.Trigger aria-label="メニュー" className="sidebar-brand">
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <line x1="3" x2="21" y1="6" y2="6" />
                <line x1="3" x2="21" y1="12" y2="12" />
                <line x1="3" x2="21" y1="18" y2="18" />
              </svg>
            </Dialog.Trigger>
            <Tabs.List>
              <Tabs.Tab
                aria-label="アクション"
                className="nav-item"
                data-tooltip="アクション"
                data-value="pane-actions"
                value="pane-actions"
              >
                <span aria-hidden="true" className="nav-icon">
                  <svg aria-hidden="true" viewBox="0 0 24 24">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                </span>
                <span className="nav-label">アクション</span>
              </Tabs.Tab>
              <Tabs.Tab
                aria-label="テーブルソート"
                className="nav-item"
                data-tooltip="テーブルソート"
                data-value="pane-table"
                value="pane-table"
              >
                <span aria-hidden="true" className="nav-icon">
                  <svg aria-hidden="true" viewBox="0 0 24 24">
                    <rect height="18" rx="2" width="18" x="3" y="3" />
                    <line x1="3" x2="21" y1="9" y2="9" />
                    <line x1="9" x2="9" y1="9" y2="21" />
                    <line x1="15" x2="15" y1="9" y2="21" />
                  </svg>
                </span>
                <span className="nav-label">テーブルソート</span>
              </Tabs.Tab>
              <Tabs.Tab
                aria-label="設定"
                className="nav-item"
                data-tooltip="設定"
                data-value="pane-settings"
                value="pane-settings"
              >
                <span aria-hidden="true" className="nav-icon">
                  <svg aria-hidden="true" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l0 0a2 2 0 0 1 -2.83 2.83l0 0a1.65 1.65 0 0 0 -1.82 -.33a1.65 1.65 0 0 0 -1 1.51V21a2 2 0 0 1 -4 0v0a1.65 1.65 0 0 0 -1 -1.51a1.65 1.65 0 0 0 -1.82 .33l0 0a2 2 0 0 1 -2.83 -2.83l0 0a1.65 1.65 0 0 0 .33 -1.82a1.65 1.65 0 0 0 -1.51 -1H3a2 2 0 0 1 0 -4h0a1.65 1.65 0 0 0 1.51 -1a1.65 1.65 0 0 0 -.33 -1.82l0 0a2 2 0 0 1 2.83 -2.83l0 0a1.65 1.65 0 0 0 1.82 .33H9a1.65 1.65 0 0 0 1 -1.51V3a2 2 0 0 1 4 0v0a1.65 1.65 0 0 0 1 1.51a1.65 1.65 0 0 0 1.82 -.33l0 0a2 2 0 0 1 2.83 2.83l0 0a1.65 1.65 0 0 0 -.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h0a1.65 1.65 0 0 0 -1.51 1z" />
                  </svg>
                </span>
                <span className="nav-label">設定</span>
              </Tabs.Tab>
            </Tabs.List>

            <Dialog.Portal>
              <Dialog.Backdrop className="menu-scrim mbu-drawer-backdrop" />
              <Dialog.Popup aria-label="メニュー" className="menu-drawer">
                <div className="menu-drawer-header">
                  <h2 className="menu-drawer-title">メニュー</h2>
                  <button aria-label="閉じる" className="menu-close" onClick={() => setMenuOpen(false)} type="button">
                    <svg aria-hidden="true" viewBox="0 0 24 24">
                      <line x1="18" x2="6" y1="6" y2="18" />
                      <line x1="6" x2="18" y1="6" y2="18" />
                    </svg>
                  </button>
                </div>
                <nav className="menu-drawer-nav">
                  <button
                    aria-current={tabValue === 'pane-actions' ? 'page' : undefined}
                    className={tabValue === 'pane-actions' ? 'menu-item active' : 'menu-item'}
                    onClick={() => navigateToPane('pane-actions')}
                    type="button"
                  >
                    <span aria-hidden="true" className="menu-icon">
                      <svg aria-hidden="true" viewBox="0 0 24 24">
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                      </svg>
                    </span>
                    アクション
                  </button>
                  <button
                    aria-current={tabValue === 'pane-table' ? 'page' : undefined}
                    className={tabValue === 'pane-table' ? 'menu-item active' : 'menu-item'}
                    onClick={() => navigateToPane('pane-table')}
                    type="button"
                  >
                    <span aria-hidden="true" className="menu-icon">
                      <svg aria-hidden="true" viewBox="0 0 24 24">
                        <rect height="18" rx="2" width="18" x="3" y="3" />
                        <line x1="3" x2="21" y1="9" y2="9" />
                        <line x1="9" x2="9" y1="9" y2="21" />
                        <line x1="15" x2="15" y1="9" y2="21" />
                      </svg>
                    </span>
                    テーブルソート
                  </button>
                  <button
                    aria-current={tabValue === 'pane-settings' ? 'page' : undefined}
                    className={tabValue === 'pane-settings' ? 'menu-item active' : 'menu-item'}
                    onClick={() => navigateToPane('pane-settings')}
                    type="button"
                  >
                    <span aria-hidden="true" className="menu-icon">
                      <svg aria-hidden="true" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l0 0a2 2 0 0 1 -2.83 2.83l0 0a1.65 1.65 0 0 0 -1.82 -.33a1.65 1.65 0 0 0 -1 1.51V21a2 2 0 0 1 -4 0v0a1.65 1.65 0 0 0 -1 -1.51a1.65 1.65 0 0 0 -1.82 .33l0 0a2 2 0 0 1 -2.83 -2.83l0 0a1.65 1.65 0 0 0 .33 -1.82a1.65 1.65 0 0 0 -1.51 -1H3a2 2 0 0 1 0 -4h0a1.65 1.65 0 0 0 1.51 -1a1.65 1.65 0 0 0 -.33 -1.82l0 0a2 2 0 0 1 2.83 -2.83l0 0a1.65 1.65 0 0 0 1.82 .33H9a1.65 1.65 0 0 0 1 -1.51V3a2 2 0 0 1 4 0v0a1.65 1.65 0 0 0 1 1.51a1.65 1.65 0 0 0 1.82 -.33l0 0a2 2 0 0 1 2.83 2.83l0 0a1.65 1.65 0 0 0 -.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h0a1.65 1.65 0 0 0 -1.51 1z" />
                      </svg>
                    </span>
                    設定
                  </button>
                </nav>
              </Dialog.Popup>
            </Dialog.Portal>
          </Dialog.Root>
        </aside>
      </div>
    </Tabs.Root>
  );
}
