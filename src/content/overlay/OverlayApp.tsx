import { Button } from "@base-ui/react/button";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AuxTextDisclosure } from "@/components/AuxTextDisclosure";
import { ThemeCycleButton } from "@/components/ThemeCycleButton";
import { CopyIcon, PinIcon } from "@/content/overlay/icons";
import type { ExtractedEvent, Size, SummarySource } from "@/shared_types";
import { applyTheme, type Theme } from "@/ui/theme";
import { nextTheme } from "@/ui/themeCycle";
import {
  loadStoredTheme,
  normalizeTheme,
  persistTheme,
  themeFromHost,
} from "@/ui/themeStorage";
import { createNotifications, ToastHost } from "@/ui/toast";

export type OverlayViewModel = {
  open: boolean;
  status: "loading" | "ready" | "error";
  mode: "text" | "event";
  source: SummarySource;
  title: string;
  primary: string;
  secondary: string;
  event?: ExtractedEvent;
  calendarUrl?: string;
  ics?: string;
  anchorRect: {
    left: number;
    top: number;
    width: number;
    height: number;
  } | null;
};

type Props = {
  host: HTMLDivElement;
  portalContainer: ShadowRoot;
  viewModel: OverlayViewModel;
  onDismiss: () => void;
};

type Point = { left: number; top: number };

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

const OVERLAY_TOAST_GAP_PX = 8;
const OVERLAY_TOAST_ESTIMATED_HEIGHT_PX = 52;
const OVERLAY_TOAST_SAFE_MARGIN_PX = 16;
const OVERLAY_PINNED_MARGIN_PX = 16;
const OVERLAY_TOAST_SURFACE_INSET_BELOW = `calc(100% + ${OVERLAY_TOAST_GAP_PX}px) 0 auto 12px`;
const OVERLAY_TOAST_SURFACE_INSET_ABOVE = `auto 0 calc(100% + ${OVERLAY_TOAST_GAP_PX}px) 12px`;
const OVERLAY_TOAST_SURFACE_INSET_INSIDE = "auto 0 12px 12px";

// Regex patterns at module level for performance (lint/performance/useTopLevelRegex)
const SELECTION_SECONDARY_REGEX = /^選択範囲:\s*\n([\s\S]*)$/;

function statusLabelFromStatus(status: OverlayViewModel["status"]): string {
  if (status === "loading") {
    return "処理中...";
  }
  if (status === "error") {
    return "エラー";
  }
  return "";
}

function sourceLabelFromSource(source: SummarySource): string {
  return source === "selection" ? "選択範囲" : "ページ本文";
}

function deriveSecondaryText(secondary: string): {
  selectionText: string;
  secondaryText: string;
} {
  const selectionSplit = splitSelectionSecondary(secondary);
  const selectionText = selectionSplit.selectionText;
  const secondaryText = selectionText
    ? selectionSplit.remainder
    : secondary.trim();
  return { selectionText, secondaryText };
}

function canCopyPrimaryFromViewModel(viewModel: OverlayViewModel): boolean {
  return viewModel.status === "ready" && Boolean(viewModel.primary.trim());
}

function canOpenCalendarFromViewModel(viewModel: OverlayViewModel): boolean {
  return (
    viewModel.mode === "event" &&
    viewModel.status === "ready" &&
    Boolean(viewModel.calendarUrl?.trim())
  );
}

function canDownloadIcsFromViewModel(viewModel: OverlayViewModel): boolean {
  return (
    viewModel.mode === "event" &&
    viewModel.status === "ready" &&
    Boolean(viewModel.ics?.trim())
  );
}

function readyEventFromViewModel(
  viewModel: OverlayViewModel
): ExtractedEvent | null {
  if (!(viewModel.mode === "event" && viewModel.status === "ready")) {
    return null;
  }
  return viewModel.event ?? null;
}

function splitSelectionSecondary(secondary: string): {
  selectionText: string;
  remainder: string;
} {
  const raw = secondary.trim();
  const match = raw.match(SELECTION_SECONDARY_REGEX);
  if (!match) {
    return { selectionText: "", remainder: raw };
  }

  const afterPrefix = (match[1] ?? "").trim();
  if (!afterPrefix) {
    return { selectionText: "", remainder: "" };
  }

  const tokenHintMarker = "\n\nOpenAI API Token未設定の場合は、";
  const markerIndex = afterPrefix.indexOf(tokenHintMarker);
  if (markerIndex < 0) {
    return { selectionText: afterPrefix, remainder: "" };
  }

  const selectionText = afterPrefix.slice(0, markerIndex).trim();
  const remainder = afterPrefix.slice(markerIndex + 2).trim();
  return { selectionText, remainder };
}

type OverlayNotify = ReturnType<typeof createNotifications>["notify"];
type StateSetter<T> = React.Dispatch<React.SetStateAction<T>>;

type DragOffset = { x: number; y: number };
type PanelSize = Size;

function getPanelSize(panel: HTMLDivElement | null): PanelSize {
  const rect = panel?.getBoundingClientRect();
  return { width: rect?.width || 520, height: rect?.height || 300 };
}

function updateOverlayToastSurfaceInset(params: {
  host: HTMLDivElement;
  panel: HTMLDivElement | null;
}): void {
  const panel = params.panel;
  const host = params.host;
  if (!panel) {
    host.style.setProperty(
      "--toast-surface-inset",
      OVERLAY_TOAST_SURFACE_INSET_BELOW
    );
    return;
  }

  const panelRect = panel.getBoundingClientRect();
  const required =
    OVERLAY_TOAST_GAP_PX +
    OVERLAY_TOAST_ESTIMATED_HEIGHT_PX +
    OVERLAY_TOAST_SAFE_MARGIN_PX;
  const spaceAbove = panelRect.top;
  const spaceBelow = window.innerHeight - panelRect.bottom;

  if (spaceBelow >= required) {
    host.style.setProperty(
      "--toast-surface-inset",
      OVERLAY_TOAST_SURFACE_INSET_BELOW
    );
    return;
  }
  if (spaceAbove >= required) {
    host.style.setProperty(
      "--toast-surface-inset",
      OVERLAY_TOAST_SURFACE_INSET_ABOVE
    );
    return;
  }

  host.style.setProperty(
    "--toast-surface-inset",
    OVERLAY_TOAST_SURFACE_INSET_INSIDE
  );
}

function updateHostPosition(
  host: HTMLDivElement,
  size: PanelSize,
  point: Point
): void {
  const margin = OVERLAY_PINNED_MARGIN_PX;
  const maxLeft = Math.max(margin, window.innerWidth - size.width - margin);
  const maxTop = Math.max(margin, window.innerHeight - size.height - margin);
  const left = clamp(point.left, margin, maxLeft);
  const top = clamp(point.top, margin, maxTop);
  host.style.left = `${Math.round(left)}px`;
  host.style.top = `${Math.round(top)}px`;
}

function getPinnedCornerPoint(size: PanelSize): Point {
  return {
    left: window.innerWidth - size.width - OVERLAY_PINNED_MARGIN_PX,
    top: OVERLAY_PINNED_MARGIN_PX,
  };
}

function positionOverlayHost(params: {
  open: boolean;
  host: HTMLDivElement;
  size: PanelSize;
  pinned: boolean;
  pinnedPos: Point | null;
  anchorRect: OverlayViewModel["anchorRect"];
}): void {
  if (!params.open) {
    return;
  }

  const size = params.size;

  if (params.pinned) {
    updateHostPosition(params.host, size, getPinnedCornerPoint(size));
    return;
  }

  if (params.pinnedPos) {
    updateHostPosition(params.host, size, params.pinnedPos);
    return;
  }

  const anchor = params.anchorRect;
  if (!anchor) {
    updateHostPosition(params.host, size, {
      left: window.innerWidth - size.width - 40,
      top: 16,
    });
    return;
  }

  updateHostPosition(params.host, size, {
    left: anchor.left,
    top: anchor.top + anchor.height + 10,
  });
}

async function copyTextToClipboard(
  notify: OverlayNotify,
  text: string
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) {
    return;
  }
  if (!navigator.clipboard?.writeText) {
    notify.error("コピーに失敗しました");
    return;
  }
  try {
    await navigator.clipboard.writeText(trimmed);
    notify.success("コピーしました");
  } catch {
    notify.error("コピーに失敗しました");
  }
}

function openUrlInNewTab(url: string): void {
  const trimmed = url.trim();
  if (!trimmed) {
    return;
  }
  window.open(trimmed, "_blank", "noopener,noreferrer");
}

function downloadIcsFile(notify: OverlayNotify, ics: string): void {
  const trimmed = ics.trim();
  if (!trimmed) {
    return;
  }
  try {
    const blob = new Blob([trimmed], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "event.ics";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    notify.success("ダウンロードしました");
  } catch {
    notify.error("ダウンロードに失敗しました");
  }
}

function startOverlayDrag(params: {
  event: React.PointerEvent<HTMLElement>;
  host: HTMLDivElement;
  dragOffsetRef: React.MutableRefObject<DragOffset | null>;
  setDragging: StateSetter<boolean>;
  setPinnedPos: StateSetter<Point | null>;
}): void {
  if (params.event.button !== 0) {
    return;
  }
  const target = params.event.target as HTMLElement | null;
  if (target?.closest("button")) {
    return;
  }
  params.event.preventDefault();
  const rect = params.host.getBoundingClientRect();
  params.dragOffsetRef.current = {
    x: params.event.clientX - rect.left,
    y: params.event.clientY - rect.top,
  };
  params.setDragging(true);
  params.setPinnedPos({ left: rect.left, top: rect.top });
  try {
    params.event.currentTarget.setPointerCapture(params.event.pointerId);
  } catch {
    // no-op
  }
}

function moveOverlayDrag(params: {
  event: React.PointerEvent<HTMLElement>;
  pinned: boolean;
  panel: HTMLDivElement | null;
  dragging: boolean;
  dragOffsetRef: React.MutableRefObject<DragOffset | null>;
  setPinned: StateSetter<boolean>;
  setPinnedPos: StateSetter<Point | null>;
}): void {
  if (!params.dragging) {
    return;
  }
  const offset = params.dragOffsetRef.current;
  if (!offset) {
    return;
  }

  const size = getPanelSize(params.panel);
  const margin = 16;
  const maxLeft = Math.max(margin, window.innerWidth - size.width - margin);
  const maxTop = Math.max(margin, window.innerHeight - size.height - margin);
  if (params.pinned) {
    params.setPinned(false);
  }
  params.setPinnedPos({
    left: clamp(params.event.clientX - offset.x, margin, maxLeft),
    top: clamp(params.event.clientY - offset.y, margin, maxTop),
  });
}

function endOverlayDrag(params: {
  event: React.PointerEvent<HTMLElement>;
  dragging: boolean;
  dragOffsetRef: React.MutableRefObject<DragOffset | null>;
  setDragging: StateSetter<boolean>;
}): void {
  if (!params.dragging) {
    return;
  }
  params.setDragging(false);
  params.dragOffsetRef.current = null;
  try {
    params.event.currentTarget.releasePointerCapture(params.event.pointerId);
  } catch {
    // no-op
  }
}

function toggleOverlayPinned(params: {
  pinned: boolean;
  setPinned: StateSetter<boolean>;
  setPinnedPos: StateSetter<Point | null>;
}): void {
  if (!params.pinned) {
    params.setPinned(true);
    params.setPinnedPos(null);
    return;
  }
  params.setPinned(false);
  params.setPinnedPos(null);
}

type OverlayCopyButtonProps = {
  disabled: boolean;
  onCopy: () => void;
};

function OverlayCopyButton(props: OverlayCopyButtonProps): React.JSX.Element {
  return (
    <Button
      aria-label="コピー"
      className="mbu-overlay-action mbu-overlay-icon-button mbu-overlay-copy"
      data-testid="overlay-copy"
      disabled={props.disabled}
      onClick={props.onCopy}
      title="コピー"
      type="button"
    >
      <CopyIcon />
    </Button>
  );
}

type OverlayPopoverProps = {
  id: string;
  title: string;
  description: string;
  children: React.ReactNode;
};

function OverlayPopover(props: OverlayPopoverProps): React.JSX.Element {
  return (
    <div className="mbu-overlay-popover">
      {props.children}
      <div className="mbu-overlay-popover-content" id={props.id} role="tooltip">
        <div className="mbu-overlay-popover-title">{props.title}</div>
        <div className="mbu-overlay-popover-text">{props.description}</div>
      </div>
    </div>
  );
}

type OverlayEventModeActionsProps = {
  canOpenCalendar: boolean;
  canDownloadIcs: boolean;
  canCopyPrimary: boolean;
  onOpenCalendar: () => void;
  onDownloadIcs: () => void;
  onCopyPrimary: () => void;
};

function OverlayEventModeActions(
  props: OverlayEventModeActionsProps
): React.JSX.Element {
  return (
    <div className="mbu-overlay-body-actions">
      {props.canOpenCalendar ? (
        <Button
          className="mbu-overlay-action"
          disabled={!props.canOpenCalendar}
          onClick={props.onOpenCalendar}
          type="button"
        >
          Googleカレンダーに登録
        </Button>
      ) : null}
      {props.canDownloadIcs ? (
        <Button
          className="mbu-overlay-action"
          disabled={!props.canDownloadIcs}
          onClick={props.onDownloadIcs}
          type="button"
        >
          .ics
        </Button>
      ) : null}
      {props.canCopyPrimary ? (
        <OverlayCopyButton
          disabled={!props.canCopyPrimary}
          onCopy={props.onCopyPrimary}
        />
      ) : null}
    </div>
  );
}

type OverlayEventDetailsProps = {
  event: ExtractedEvent;
  selectionText: string;
};

function OverlayEventDetails(
  props: OverlayEventDetailsProps
): React.JSX.Element {
  return (
    <>
      <table className="mbu-overlay-event-table">
        <tbody>
          <tr>
            <th scope="row">タイトル</th>
            <td>{props.event.title}</td>
          </tr>
          <tr>
            <th scope="row">日時</th>
            <td>
              {props.event.end
                ? `${props.event.start} ～ ${props.event.end}`
                : props.event.start}
            </td>
          </tr>
          {props.event.location ? (
            <tr>
              <th scope="row">場所</th>
              <td>{props.event.location}</td>
            </tr>
          ) : null}
          {props.event.description ? (
            <tr>
              <th scope="row">概要</th>
              <td>{props.event.description}</td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <AuxTextDisclosure
        storageKey="overlaySelectionDisclosureOpen"
        summary="選択したテキスト（確認用）"
        text={props.selectionText}
      />
    </>
  );
}

type OverlayTextContentProps = {
  mode: OverlayViewModel["mode"];
  statusLabel: string;
  canCopyPrimary: boolean;
  primary: string;
  secondaryText: string;
  selectionText: string;
  onCopyPrimary: () => void;
};

type OverlayTextDetailsProps = OverlayTextContentProps;

function OverlayTextDetails(props: OverlayTextDetailsProps): React.JSX.Element {
  return (
    <>
      {props.statusLabel ? (
        <div className="mbu-overlay-status">{props.statusLabel}</div>
      ) : null}
      <div className="mbu-overlay-primary-block">
        <pre className="mbu-overlay-primary-text">{props.primary}</pre>
        {props.mode === "event" || !props.canCopyPrimary ? null : (
          <OverlayCopyButton
            disabled={!props.canCopyPrimary}
            onCopy={props.onCopyPrimary}
          />
        )}
      </div>
      {props.secondaryText ? (
        <pre className="mbu-overlay-secondary-text">{props.secondaryText}</pre>
      ) : null}
      <AuxTextDisclosure
        storageKey="overlaySelectionDisclosureOpen"
        summary="選択したテキスト（確認用）"
        text={props.selectionText}
      />
    </>
  );
}

type OverlayBodyProps = OverlayTextContentProps & {
  readyEvent: ExtractedEvent | null;
  canOpenCalendar: boolean;
  canDownloadIcs: boolean;
  onOpenCalendar: () => void;
  onDownloadIcs: () => void;
};

function OverlayBody(props: OverlayBodyProps): React.JSX.Element {
  return (
    <div className="mbu-overlay-body">
      {props.mode === "event" ? (
        <OverlayEventModeActions
          canCopyPrimary={props.canCopyPrimary}
          canDownloadIcs={props.canDownloadIcs}
          canOpenCalendar={props.canOpenCalendar}
          onCopyPrimary={props.onCopyPrimary}
          onDownloadIcs={props.onDownloadIcs}
          onOpenCalendar={props.onOpenCalendar}
        />
      ) : null}

      {props.readyEvent ? (
        <OverlayEventDetails
          event={props.readyEvent}
          selectionText={props.selectionText}
        />
      ) : (
        <OverlayTextDetails
          canCopyPrimary={props.canCopyPrimary}
          mode={props.mode}
          onCopyPrimary={props.onCopyPrimary}
          primary={props.primary}
          secondaryText={props.secondaryText}
          selectionText={props.selectionText}
          statusLabel={props.statusLabel}
        />
      )}
    </div>
  );
}

export function OverlayApp(props: Props): React.JSX.Element | null {
  const { toastManager, notify } = useMemo(() => createNotifications(), []);
  const viewModel = props.viewModel;
  const [theme, setTheme] = useState<Theme>(() => themeFromHost(props.host));
  const panelRef = useRef<HTMLDivElement | null>(null);
  const pinPopoverId = useId();
  const themePopoverId = useId();
  const closePopoverId = useId();
  const [panelSize, setPanelSize] = useState<PanelSize>({
    width: 520,
    height: 300,
  });
  const [pinned, setPinned] = useState(false);
  const [pinnedPos, setPinnedPos] = useState<Point | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragOffsetRef = useRef<DragOffset | null>(null);

  useEffect(() => {
    let disposed = false;
    const fallback = themeFromHost(props.host);

    loadStoredTheme(fallback)
      .then((storedTheme) => {
        if (disposed) {
          return;
        }
        setTheme(storedTheme);
        applyTheme(storedTheme, props.portalContainer);
      })
      .catch(() => {
        // no-op
      });

    if (typeof chrome === "undefined") {
      return () => {
        disposed = true;
      };
    }

    const onChanged = chrome.storage?.onChanged;
    if (!onChanged?.addListener) {
      return () => {
        disposed = true;
      };
    }

    const handleChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ): void => {
      if (areaName !== "local") {
        return;
      }
      if (!("theme" in changes)) {
        return;
      }
      const change = changes.theme as chrome.storage.StorageChange | undefined;
      const nextValue = normalizeTheme(change?.newValue);
      setTheme(nextValue);
      applyTheme(nextValue, props.portalContainer);
    };

    onChanged.addListener(handleChange);

    return () => {
      disposed = true;
      onChanged.removeListener?.(handleChange);
    };
  }, [props.host, props.portalContainer]);

  useLayoutEffect(() => {
    if (!viewModel.open) {
      return;
    }

    const panel = panelRef.current;
    if (!panel || typeof ResizeObserver === "undefined") {
      return;
    }

    let lastWidth = 0;
    let lastHeight = 0;

    const commit = (size: PanelSize): void => {
      const width = Math.round(size.width);
      const height = Math.round(size.height);
      if (width <= 0 || height <= 0) {
        return;
      }
      if (width === lastWidth && height === lastHeight) {
        return;
      }
      lastWidth = width;
      lastHeight = height;
      setPanelSize({ width, height });
    };

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      commit({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });

    observer.observe(panel);
    commit(getPanelSize(panel));

    return () => {
      observer.disconnect();
    };
  }, [viewModel.open]);

  useLayoutEffect(() => {
    const updatePosition = (): void => {
      positionOverlayHost({
        open: viewModel.open,
        host: props.host,
        size: panelSize,
        pinned,
        pinnedPos,
        anchorRect: viewModel.anchorRect,
      });
      updateOverlayToastSurfaceInset({
        host: props.host,
        panel: panelRef.current,
      });
    };

    updatePosition();

    if (!viewModel.open) {
      return;
    }

    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("resize", updatePosition);
    };
  }, [
    props.host,
    viewModel.open,
    viewModel.anchorRect,
    pinned,
    pinnedPos,
    panelSize,
  ]);

  if (!viewModel.open) {
    return null;
  }

  const onCopyPrimary = (): void => {
    copyTextToClipboard(notify, viewModel.primary).catch(() => {
      // no-op
    });
  };

  const openCalendar = (): void => {
    openUrlInNewTab(viewModel.calendarUrl ?? "");
  };

  const downloadIcs = (): void => {
    downloadIcsFile(notify, viewModel.ics ?? "");
  };

  const startDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
    startOverlayDrag({
      event,
      host: props.host,
      dragOffsetRef,
      setDragging,
      setPinnedPos,
    });
  };

  const moveDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
    moveOverlayDrag({
      event,
      pinned,
      panel: panelRef.current,
      dragging,
      dragOffsetRef,
      setPinned,
      setPinnedPos,
    });
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
    endOverlayDrag({ event, dragging, dragOffsetRef, setDragging });
  };

  const togglePinned = (): void => {
    toggleOverlayPinned({ pinned, setPinned, setPinnedPos });
  };

  const toggleTheme = (): void => {
    const next = nextTheme(theme);
    setTheme(next);
    applyTheme(next, props.portalContainer);
    persistTheme(next).catch(() => {
      // no-op
    });
  };

  const sourceLabel = sourceLabelFromSource(viewModel.source);
  const statusLabel = statusLabelFromStatus(viewModel.status);
  const { selectionText, secondaryText } = deriveSecondaryText(
    viewModel.secondary
  );
  const readyEvent = readyEventFromViewModel(viewModel);
  const canCopyPrimary = canCopyPrimaryFromViewModel(viewModel);
  const canOpenCalendar = canOpenCalendarFromViewModel(viewModel);
  const canDownloadIcs = canDownloadIcsFromViewModel(viewModel);

  return (
    <div className="mbu-overlay-surface">
      <ToastHost
        placement="surface"
        portalContainer={props.portalContainer}
        toastManager={toastManager}
      />
      <div className="mbu-overlay-panel" ref={panelRef}>
        <div
          className="mbu-overlay-header"
          data-dragging={dragging ? "true" : undefined}
          onPointerCancel={endDrag}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
        >
          <div className="mbu-overlay-header-left">
            <div className="mbu-overlay-title">
              {viewModel.title}{" "}
              <span className="mbu-overlay-chip">{sourceLabel}</span>
            </div>
          </div>
          <div className="mbu-overlay-actions">
            <OverlayPopover
              description="右上に固定します。もう一度クリックで解除。"
              id={pinPopoverId}
              title="ピン留め"
            >
              <Button
                aria-describedby={pinPopoverId}
                aria-label={pinned ? "右上固定を解除" : "右上に固定"}
                className="mbu-overlay-action mbu-overlay-icon-button"
                data-active={pinned ? "true" : undefined}
                data-testid="overlay-pin"
                onClick={togglePinned}
                title={pinned ? "右上固定を解除" : "右上に固定"}
                type="button"
              >
                <PinIcon />
              </Button>
            </OverlayPopover>
            <OverlayPopover
              description="自動・ライト・ダークを順に切り替えます。"
              id={themePopoverId}
              title="テーマ切り替え"
            >
              <ThemeCycleButton
                className="mbu-overlay-action mbu-overlay-icon-button"
                describedById={themePopoverId}
                onToggle={toggleTheme}
                testId="overlay-theme"
                theme={theme}
              />
            </OverlayPopover>
            <OverlayPopover
              description="オーバーレイを閉じます。"
              id={closePopoverId}
              title="閉じる"
            >
              <Button
                aria-describedby={closePopoverId}
                aria-label="閉じる"
                className="mbu-overlay-action mbu-overlay-icon-button"
                data-testid="overlay-close"
                onClick={props.onDismiss}
                title="閉じる"
                type="button"
              >
                ×
              </Button>
            </OverlayPopover>
          </div>
        </div>

        <OverlayBody
          canCopyPrimary={canCopyPrimary}
          canDownloadIcs={canDownloadIcs}
          canOpenCalendar={canOpenCalendar}
          mode={viewModel.mode}
          onCopyPrimary={onCopyPrimary}
          onDownloadIcs={downloadIcs}
          onOpenCalendar={openCalendar}
          primary={viewModel.primary}
          readyEvent={readyEvent}
          secondaryText={secondaryText}
          selectionText={selectionText}
          statusLabel={statusLabel}
        />
      </div>
    </div>
  );
}
