import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AuxTextDisclosure } from '../../components/AuxTextDisclosure';
import type { ExtractedEvent, SummarySource } from '../../shared_types';
import { createNotifications, ToastHost } from '../../ui/toast';
import { CopyIcon, PinIcon } from './icons';

export type OverlayViewModel = {
  open: boolean;
  status: 'loading' | 'ready' | 'error';
  mode: 'text' | 'event';
  source: SummarySource;
  title: string;
  primary: string;
  secondary: string;
  event?: ExtractedEvent;
  calendarUrl?: string;
  ics?: string;
  anchorRect: { left: number; top: number; width: number; height: number } | null;
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

function splitSelectionSecondary(secondary: string): { selectionText: string; remainder: string } {
  const raw = secondary.trim();
  const match = raw.match(/^選択範囲:\s*\n([\s\S]*)$/);
  if (!match) return { selectionText: '', remainder: raw };

  const afterPrefix = (match[1] ?? '').trim();
  if (!afterPrefix) return { selectionText: '', remainder: '' };

  const tokenHintMarker = '\n\nOpenAI API Token未設定の場合は、';
  const markerIndex = afterPrefix.indexOf(tokenHintMarker);
  if (markerIndex < 0) return { selectionText: afterPrefix, remainder: '' };

  const selectionText = afterPrefix.slice(0, markerIndex).trim();
  const remainder = afterPrefix.slice(markerIndex + 2).trim();
  return { selectionText, remainder };
}

export function OverlayApp(props: Props): React.JSX.Element | null {
  const { toastManager, notify } = useMemo(() => createNotifications(), []);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [pinned, setPinned] = useState(false);
  const [pinnedPos, setPinnedPos] = useState<Point | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragOffsetRef = useRef<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    if (!props.viewModel.open) return;
    const panel = panelRef.current;
    const panelRect = panel?.getBoundingClientRect();
    const width = panelRect?.width || 520;
    const height = panelRect?.height || 300;

    const updateHostPosition = (point: Point): void => {
      const margin = 16;
      const maxLeft = Math.max(margin, window.innerWidth - width - margin);
      const maxTop = Math.max(margin, window.innerHeight - height - margin);
      const left = clamp(point.left, margin, maxLeft);
      const top = clamp(point.top, margin, maxTop);
      props.host.style.left = `${Math.round(left)}px`;
      props.host.style.top = `${Math.round(top)}px`;
    };

    if (pinned && pinnedPos) {
      updateHostPosition(pinnedPos);
      return;
    }

    const anchor = props.viewModel.anchorRect;
    if (!anchor) {
      updateHostPosition({ left: window.innerWidth - width - 16, top: 16 });
      return;
    }

    const preferred = { left: anchor.left, top: anchor.top + anchor.height + 10 };
    updateHostPosition(preferred);
  }, [props.host, props.viewModel.open, props.viewModel.anchorRect, pinned, pinnedPos]);

  if (!props.viewModel.open) return null;

  const copyPrimary = async (): Promise<void> => {
    const text = props.viewModel.primary.trim();
    if (!text) return;
    if (!navigator.clipboard?.writeText) {
      notify.error('コピーに失敗しました');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      notify.success('コピーしました');
    } catch {
      notify.error('コピーに失敗しました');
    }
  };

  const openCalendar = (): void => {
    const url = props.viewModel.calendarUrl?.trim() ?? '';
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const downloadIcs = (): void => {
    const ics = props.viewModel.ics?.trim() ?? '';
    if (!ics) return;
    try {
      const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'event.ics';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      notify.success('ダウンロードしました');
    } catch {
      notify.error('ダウンロードに失敗しました');
    }
  };

  const startDrag = (event: React.PointerEvent<HTMLButtonElement>): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    const rect = props.host.getBoundingClientRect();
    dragOffsetRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    setPinned(true);
    setDragging(true);
    setPinnedPos({ left: rect.left, top: rect.top });
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // no-op
    }
  };

  const moveDrag = (event: React.PointerEvent<HTMLButtonElement>): void => {
    if (!dragging) return;
    const offset = dragOffsetRef.current;
    if (!offset) return;
    const panel = panelRef.current;
    const panelRect = panel?.getBoundingClientRect();
    const width = panelRect?.width || 520;
    const height = panelRect?.height || 300;
    const next = { left: event.clientX - offset.x, top: event.clientY - offset.y };
    setPinnedPos({
      left: clamp(next.left, 16, Math.max(16, window.innerWidth - width - 16)),
      top: clamp(next.top, 16, Math.max(16, window.innerHeight - height - 16)),
    });
  };

  const endDrag = (event: React.PointerEvent<HTMLButtonElement>): void => {
    if (!dragging) return;
    setDragging(false);
    dragOffsetRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // no-op
    }
  };

  const togglePinned = (): void => {
    if (!pinned) {
      const rect = props.host.getBoundingClientRect();
      setPinned(true);
      setPinnedPos({ left: rect.left, top: rect.top });
      return;
    }
    setPinned(false);
    setPinnedPos(null);
  };

  const sourceLabel = props.viewModel.source === 'selection' ? '選択範囲' : 'ページ本文';
  const statusLabel =
    props.viewModel.status === 'loading' ? '処理中...' : props.viewModel.status === 'error' ? 'エラー' : '';

  const isReadyEvent = props.viewModel.mode === 'event' && props.viewModel.status === 'ready' && props.viewModel.event;
  const selectionSplit = splitSelectionSecondary(props.viewModel.secondary);
  const selectionText = selectionSplit.selectionText;
  const secondaryText = selectionText ? selectionSplit.remainder : props.viewModel.secondary.trim();
  const canCopyPrimary = props.viewModel.status === 'ready' && Boolean(props.viewModel.primary.trim());
  const canOpenCalendar =
    props.viewModel.mode === 'event' &&
    props.viewModel.status === 'ready' &&
    Boolean(props.viewModel.calendarUrl?.trim());
  const canDownloadIcs =
    props.viewModel.mode === 'event' && props.viewModel.status === 'ready' && Boolean(props.viewModel.ics?.trim());

  return (
    <div className="mbu-overlay-surface">
      <ToastHost portalContainer={props.portalContainer} toastManager={toastManager} />
      <div className="mbu-overlay-panel" ref={panelRef}>
        <div className="mbu-overlay-header">
          <div className="mbu-overlay-header-left">
            <button
              aria-label="ドラッグして固定"
              className="mbu-overlay-drag"
              onPointerCancel={endDrag}
              onPointerDown={startDrag}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              type="button"
            >
              ⋮⋮
            </button>
            <div className="mbu-overlay-title">
              {props.viewModel.title} <span className="mbu-overlay-chip">{sourceLabel}</span>
            </div>
          </div>
          <div className="mbu-overlay-actions">
            <button
              aria-label={pinned ? '固定解除' : '固定'}
              className="mbu-overlay-action mbu-overlay-icon-button"
              data-active={pinned ? 'true' : undefined}
              data-testid="overlay-pin"
              onClick={togglePinned}
              title={pinned ? '固定解除' : '固定'}
              type="button"
            >
              <PinIcon />
            </button>
            <button
              aria-label="閉じる"
              className="mbu-overlay-action mbu-overlay-icon-button"
              data-testid="overlay-close"
              onClick={props.onDismiss}
              title="閉じる"
              type="button"
            >
              ×
            </button>
          </div>
        </div>

        <div className="mbu-overlay-body">
          {props.viewModel.mode === 'event' ? (
            <div className="mbu-overlay-body-actions">
              <button className="mbu-overlay-action" disabled={!canOpenCalendar} onClick={openCalendar} type="button">
                Googleカレンダーに登録
              </button>
              <button className="mbu-overlay-action" disabled={!canDownloadIcs} onClick={downloadIcs} type="button">
                .ics
              </button>
              <button
                aria-label="コピー"
                className="mbu-overlay-action mbu-overlay-icon-button mbu-overlay-copy"
                data-testid="overlay-copy"
                disabled={!canCopyPrimary}
                onClick={() => void copyPrimary()}
                title="コピー"
                type="button"
              >
                <CopyIcon />
              </button>
            </div>
          ) : null}
          {isReadyEvent ? (
            <>
              <table className="mbu-overlay-event-table">
                <tbody>
                  <tr>
                    <th scope="row">タイトル</th>
                    <td>{props.viewModel.event?.title}</td>
                  </tr>
                  <tr>
                    <th scope="row">日時</th>
                    <td>
                      {props.viewModel.event?.end
                        ? `${props.viewModel.event?.start} ～ ${props.viewModel.event?.end}`
                        : props.viewModel.event?.start}
                    </td>
                  </tr>
                  {props.viewModel.event?.location ? (
                    <tr>
                      <th scope="row">場所</th>
                      <td>{props.viewModel.event.location}</td>
                    </tr>
                  ) : null}
                  {props.viewModel.event?.description ? (
                    <tr>
                      <th scope="row">概要</th>
                      <td>{props.viewModel.event.description}</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
              <AuxTextDisclosure summary="選択したテキスト（確認用）" text={selectionText} />
            </>
          ) : (
            <>
              {statusLabel ? <div className="mbu-overlay-status">{statusLabel}</div> : null}
              <div className="mbu-overlay-primary-block">
                <button
                  aria-label="コピー"
                  className="mbu-overlay-action mbu-overlay-icon-button mbu-overlay-copy"
                  data-testid="overlay-copy"
                  disabled={!canCopyPrimary}
                  onClick={() => void copyPrimary()}
                  title="コピー"
                  type="button"
                >
                  <CopyIcon />
                </button>
                <pre className="mbu-overlay-primary-text">{props.viewModel.primary}</pre>
              </div>
              {secondaryText ? <pre className="mbu-overlay-secondary-text">{secondaryText}</pre> : null}
              <AuxTextDisclosure summary="選択したテキスト（確認用）" text={selectionText} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
