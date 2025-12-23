import { Dialog, Tabs } from "@base-ui/react";
import { Button } from "@base-ui/react/button";
import { Result } from "@praha/byethrow";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { APP_NAME } from "@/app_meta";
import { Icon } from "@/components/icon";
import { replaceHashSafely } from "@/popup/hash";
import { coercePaneId, getPaneIdFromHash, type PaneId } from "@/popup/panes";
import { ActionsPane } from "@/popup/panes/ActionsPane";
import { CalendarPane } from "@/popup/panes/CalendarPane";
import { CreateLinkPane } from "@/popup/panes/CreateLinkPane";
import { SettingsPane } from "@/popup/panes/SettingsPane";
import { TablePane } from "@/popup/panes/TablePane";
import { createPopupRuntime } from "@/popup/runtime";
import type { CopyTitleLinkFailure } from "@/storage/types";
import { createNotifications, ToastHost } from "@/ui/toast";
import { coerceLinkFormat, type LinkFormat } from "@/utils/link_format";

function canUseChromeAction(runtime: { isExtensionPage: boolean }): boolean {
  return (
    runtime.isExtensionPage &&
    typeof chrome !== "undefined" &&
    Boolean((chrome as unknown as { action?: unknown }).action)
  );
}

function clearActionBadgeForTab(tabId: number): void {
  try {
    chrome.action.setBadgeText({ text: "", tabId });
    chrome.action.setTitle({
      title: APP_NAME,
      tabId,
    });
  } catch {
    // no-op
  }
}

function coerceCopyTitleLinkFailure(
  value: unknown
): Result.Result<CopyTitleLinkFailure, "invalid"> {
  if (typeof value !== "object" || value === null) {
    return Result.fail("invalid");
  }
  const v = value as Record<string, unknown>;
  if (typeof v.occurredAt !== "number") {
    return Result.fail("invalid");
  }
  if (typeof v.tabId !== "number") {
    return Result.fail("invalid");
  }
  if (typeof v.pageTitle !== "string") {
    return Result.fail("invalid");
  }
  if (typeof v.pageUrl !== "string") {
    return Result.fail("invalid");
  }
  if (typeof v.text !== "string") {
    return Result.fail("invalid");
  }
  if (typeof v.error !== "string") {
    return Result.fail("invalid");
  }
  const format = coerceLinkFormat(v.format);
  return Result.succeed({
    occurredAt: v.occurredAt as number,
    tabId: v.tabId as number,
    pageTitle: v.pageTitle as string,
    pageUrl: v.pageUrl as string,
    text: v.text as string,
    error: v.error as string,
    ...(format ? { format } : {}),
  });
}

async function loadCopyTitleLinkFailure(runtime: {
  storageLocalGet: ReturnType<typeof createPopupRuntime>["storageLocalGet"];
}): Promise<
  | { ok: true; value: CopyTitleLinkFailure }
  | { ok: false; error: "none" | "storage-error" | "invalid" }
> {
  const loaded = await runtime.storageLocalGet(["lastCopyTitleLinkFailure"]);
  if (Result.isFailure(loaded)) {
    return { ok: false, error: "storage-error" };
  }

  const stored = loaded.value.lastCopyTitleLinkFailure;
  if (typeof stored === "undefined") {
    return { ok: false, error: "none" };
  }

  const result = coerceCopyTitleLinkFailure(stored);
  if (Result.isFailure(result)) {
    return { ok: false, error: result.error };
  }

  return { ok: true, value: result.value };
}

async function handleCopyTitleLinkFailureOnPopupOpen(params: {
  runtime: ReturnType<typeof createPopupRuntime>;
  notify: ReturnType<typeof createNotifications>["notify"];
  setCreateLinkInitialLink: (value: { title: string; url: string }) => void;
  setCreateLinkInitialFormat: (value: LinkFormat) => void;
  navigateToCreateLink: () => void;
}): Promise<void> {
  const MAX_AGE_MS = 2 * 60 * 1000;

  const failureLoaded = await loadCopyTitleLinkFailure(params.runtime);
  if (!failureLoaded.ok) {
    if (failureLoaded.error === "invalid") {
      await params.runtime.storageLocalRemove("lastCopyTitleLinkFailure");
    }
    return;
  }

  const failure = failureLoaded.value;
  const actionAvailable = canUseChromeAction(params.runtime);

  if (Date.now() - failure.occurredAt > MAX_AGE_MS) {
    await params.runtime.storageLocalRemove("lastCopyTitleLinkFailure");
    if (actionAvailable) {
      clearActionBadgeForTab(failure.tabId);
    }
    return;
  }

  const activeTabIdResult = await params.runtime.getActiveTabId();
  if (Result.isFailure(activeTabIdResult)) {
    return;
  }
  const activeTabId = activeTabIdResult.value;
  if (activeTabId === null || activeTabId !== failure.tabId) {
    return;
  }

  await params.runtime.storageLocalRemove("lastCopyTitleLinkFailure");
  if (actionAvailable) {
    clearActionBadgeForTab(failure.tabId);
  }

  params.setCreateLinkInitialLink({
    title: failure.pageTitle,
    url: failure.pageUrl,
  });
  params.setCreateLinkInitialFormat(failure.format ?? "text");
  params.navigateToCreateLink();

  params.notify.error(
    [
      "このページでは自動コピーできませんでした。",
      failure.pageTitle ? `タイトル: ${failure.pageTitle}` : null,
      failure.pageUrl ? `URL: ${failure.pageUrl}` : null,
      "",
      "このポップアップ「リンク作成」からコピーできます。",
    ]
      .filter(Boolean)
      .join("\n")
  );
}

export function PopupApp(): React.JSX.Element {
  const initialValue = useMemo<PaneId>(
    () => getPaneIdFromHash(window.location.hash) ?? "pane-actions",
    []
  );
  const [tabValue, setTabValue] = useState<PaneId>(initialValue);
  const [menuOpen, setMenuOpen] = useState(false);
  const tokenInputRef = useRef<HTMLInputElement | null>(null);

  const runtime = useMemo(() => createPopupRuntime(), []);
  const notifications = useMemo(() => createNotifications(), []);

  const [createLinkInitialLink, setCreateLinkInitialLink] = useState<{
    title: string;
    url: string;
  } | null>(null);
  const [createLinkInitialFormat, setCreateLinkInitialFormat] =
    useState<LinkFormat | null>(null);

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
    if (!next) {
      return;
    }
    setTabValue(next);
  }, []);

  useEffect(() => {
    window.addEventListener("hashchange", syncFromHash);
    return () => {
      window.removeEventListener("hashchange", syncFromHash);
    };
  }, [syncFromHash]);

  useEffect(() => {
    replaceHashSafely(window, `#${tabValue}`);
  }, [tabValue]);

  useEffect(() => {
    document.title = APP_NAME;
  }, []);

  useEffect(() => {
    document.body.classList.toggle("menu-open", menuOpen);
    return () => {
      document.body.classList.remove("menu-open");
    };
  }, [menuOpen]);

  useEffect(() => {
    handleCopyTitleLinkFailureOnPopupOpen({
      runtime,
      notify: notifications.notify,
      setCreateLinkInitialLink: (value) => setCreateLinkInitialLink(value),
      setCreateLinkInitialFormat: (value) => setCreateLinkInitialFormat(value),
      navigateToCreateLink: () => setTabValue("pane-create-link"),
    }).catch(() => {
      // no-op
    });
  }, [notifications.notify, runtime]);

  return (
    <Tabs.Root
      onValueChange={(value) => {
        setTabValue(coercePaneId(value));
        setMenuOpen(false);
      }}
      value={tabValue}
    >
      <div className="app-shell mbu-surface">
        <ToastHost
          placement="surface"
          portalContainer={document.body}
          toastManager={notifications.toastManager}
        />
        <main className="content">
          <header className="content-header">
            <div className="title-block">
              <div className="hero-logo-wrap">
                <img
                  alt={APP_NAME}
                  className="hero-logo"
                  height={32}
                  src="icons/icon48.png"
                  width={32}
                />
              </div>
              <div className="title-text">
                <div className="title-row">
                  <h1>{APP_NAME}</h1>
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
            <Tabs.Panel data-pane="pane-calendar" value="pane-calendar">
              <CalendarPane
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
              <CreateLinkPane
                initialFormat={createLinkInitialFormat ?? undefined}
                initialLink={createLinkInitialLink ?? undefined}
                notify={notifications.notify}
                runtime={runtime}
              />
            </Tabs.Panel>
            <Tabs.Panel data-pane="pane-settings" value="pane-settings">
              <SettingsPane
                notify={notifications.notify}
                runtime={runtime}
                tokenInputRef={tokenInputRef}
              />
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
                aria-label="カレンダー登録"
                className="nav-item"
                data-tooltip="カレンダー登録"
                data-value="pane-calendar"
                value="pane-calendar"
              >
                <span aria-hidden="true" className="nav-icon">
                  <Icon aria-hidden="true" name="calendar" />
                </span>
                <span className="nav-label">カレンダー登録</span>
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
                  <Button
                    aria-label="閉じる"
                    className="menu-close"
                    onClick={() => setMenuOpen(false)}
                    type="button"
                  >
                    <Icon aria-hidden="true" name="close" />
                  </Button>
                </div>
                <nav className="menu-drawer-nav">
                  <Button
                    aria-current={
                      tabValue === "pane-actions" ? "page" : undefined
                    }
                    className={
                      tabValue === "pane-actions"
                        ? "menu-item active"
                        : "menu-item"
                    }
                    onClick={() => navigateToPane("pane-actions")}
                    type="button"
                  >
                    <span aria-hidden="true" className="menu-icon">
                      <Icon aria-hidden="true" name="zap" />
                    </span>
                    アクション
                  </Button>
                  <Button
                    aria-current={
                      tabValue === "pane-calendar" ? "page" : undefined
                    }
                    className={
                      tabValue === "pane-calendar"
                        ? "menu-item active"
                        : "menu-item"
                    }
                    onClick={() => navigateToPane("pane-calendar")}
                    type="button"
                  >
                    <span aria-hidden="true" className="menu-icon">
                      <Icon aria-hidden="true" name="calendar" />
                    </span>
                    カレンダー登録
                  </Button>
                  <Button
                    aria-current={
                      tabValue === "pane-table" ? "page" : undefined
                    }
                    className={
                      tabValue === "pane-table"
                        ? "menu-item active"
                        : "menu-item"
                    }
                    onClick={() => navigateToPane("pane-table")}
                    type="button"
                  >
                    <span aria-hidden="true" className="menu-icon">
                      <Icon aria-hidden="true" name="table" />
                    </span>
                    テーブルソート
                  </Button>
                  <Button
                    aria-current={
                      tabValue === "pane-create-link" ? "page" : undefined
                    }
                    className={
                      tabValue === "pane-create-link"
                        ? "menu-item active"
                        : "menu-item"
                    }
                    onClick={() => navigateToPane("pane-create-link")}
                    type="button"
                  >
                    <span aria-hidden="true" className="menu-icon">
                      <Icon aria-hidden="true" name="link" />
                    </span>
                    リンク作成
                  </Button>
                  <Button
                    aria-current={
                      tabValue === "pane-settings" ? "page" : undefined
                    }
                    className={
                      tabValue === "pane-settings"
                        ? "menu-item active"
                        : "menu-item"
                    }
                    onClick={() => navigateToPane("pane-settings")}
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
