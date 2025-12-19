import { Dialog, Tabs } from '@base-ui/react';
import { Button } from '@base-ui/react/button';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/icon';
import { createNotifications, ToastHost } from '@/ui/toast';
import { coercePaneId, getPaneIdFromHash, type PaneId } from './panes';
import { ActionsPane } from './panes/ActionsPane';
import { CreateLinkPane } from './panes/CreateLinkPane';
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
        <ToastHost placement="surface" portalContainer={document.body} toastManager={notifications.toastManager} />
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
            <Tabs.Panel data-pane="pane-create-link" value="pane-create-link">
              <CreateLinkPane notify={notifications.notify} runtime={runtime} />
            </Tabs.Panel>
            <Tabs.Panel data-pane="pane-settings" value="pane-settings">
              <SettingsPane notify={notifications.notify} runtime={runtime} tokenInputRef={tokenInputRef} />
            </Tabs.Panel>
          </div>
        </main>

        <aside aria-label="メニュー" className="sidebar">
          <Dialog.Root onOpenChange={setMenuOpen} open={menuOpen}>
            <Dialog.Trigger aria-label="メニュー" className="sidebar-brand">
              <Icon aria-hidden="true" name="menu" />
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
                  <Icon aria-hidden="true" name="zap" />
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
                  <Icon aria-hidden="true" name="table" />
                </span>
                <span className="nav-label">テーブルソート</span>
              </Tabs.Tab>
              <Tabs.Tab
                aria-label="リンク作成"
                className="nav-item"
                data-tooltip="リンク作成"
                data-value="pane-create-link"
                value="pane-create-link"
              >
                <span aria-hidden="true" className="nav-icon">
                  <Icon aria-hidden="true" name="link" />
                </span>
                <span className="nav-label">リンク作成</span>
              </Tabs.Tab>
              <Tabs.Tab
                aria-label="設定"
                className="nav-item"
                data-tooltip="設定"
                data-value="pane-settings"
                value="pane-settings"
              >
                <span aria-hidden="true" className="nav-icon">
                  <Icon aria-hidden="true" name="settings" />
                </span>
                <span className="nav-label">設定</span>
              </Tabs.Tab>
            </Tabs.List>

            <Dialog.Portal>
              <Dialog.Backdrop className="menu-scrim mbu-drawer-backdrop" />
              <Dialog.Popup aria-label="メニュー" className="menu-drawer">
                <div className="menu-drawer-header">
                  <h2 className="menu-drawer-title">メニュー</h2>
                  <Button aria-label="閉じる" className="menu-close" onClick={() => setMenuOpen(false)} type="button">
                    <Icon aria-hidden="true" name="close" />
                  </Button>
                </div>
                <nav className="menu-drawer-nav">
                  <Button
                    aria-current={tabValue === 'pane-actions' ? 'page' : undefined}
                    className={tabValue === 'pane-actions' ? 'menu-item active' : 'menu-item'}
                    onClick={() => navigateToPane('pane-actions')}
                    type="button"
                  >
                    <span aria-hidden="true" className="menu-icon">
                      <Icon aria-hidden="true" name="zap" />
                    </span>
                    アクション
                  </Button>
                  <Button
                    aria-current={tabValue === 'pane-table' ? 'page' : undefined}
                    className={tabValue === 'pane-table' ? 'menu-item active' : 'menu-item'}
                    onClick={() => navigateToPane('pane-table')}
                    type="button"
                  >
                    <span aria-hidden="true" className="menu-icon">
                      <Icon aria-hidden="true" name="table" />
                    </span>
                    テーブルソート
                  </Button>
                  <Button
                    aria-current={tabValue === 'pane-create-link' ? 'page' : undefined}
                    className={tabValue === 'pane-create-link' ? 'menu-item active' : 'menu-item'}
                    onClick={() => navigateToPane('pane-create-link')}
                    type="button"
                  >
                    <span aria-hidden="true" className="menu-icon">
                      <Icon aria-hidden="true" name="link" />
                    </span>
                    リンク作成
                  </Button>
                  <Button
                    aria-current={tabValue === 'pane-settings' ? 'page' : undefined}
                    className={tabValue === 'pane-settings' ? 'menu-item active' : 'menu-item'}
                    onClick={() => navigateToPane('pane-settings')}
                    type="button"
                  >
                    <span aria-hidden="true" className="menu-icon">
                      <Icon aria-hidden="true" name="settings" />
                    </span>
                    設定
                  </Button>
                </nav>
              </Dialog.Popup>
            </Dialog.Portal>
          </Dialog.Root>
        </aside>
      </div>
    </Tabs.Root>
  );
}
