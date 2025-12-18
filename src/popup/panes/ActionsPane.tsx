import { Result } from '@praha/byethrow';
import { useEffect, useMemo, useState } from 'react';
import {
  type ContextAction,
  type ContextActionKind,
  DEFAULT_CONTEXT_ACTIONS,
  normalizeContextActions,
} from '../../context_actions';
import { buildIcs, sanitizeFileName } from '../../ics';
import type { ExtractedEvent } from '../../shared_types';
import type { Notifier } from '../../ui/toast';
import type { PaneId } from '../panes';
import type { PopupRuntime, RunContextActionRequest, RunContextActionResponse } from '../runtime';
import { ensureOpenAiTokenConfigured } from '../token_guard';
import { ActionButtons } from './actions/ActionButtons';
import { ActionEditorPanel } from './actions/ActionEditorPanel';
import { ActionOutputPanel } from './actions/ActionOutputPanel';

type OutputState =
  | { status: 'idle' }
  | { status: 'running'; title: string }
  | {
      status: 'ready';
      title: string;
      text: string;
      sourceLabel: string;
      mode: 'text' | 'event';
      calendarUrl?: string;
      event?: ExtractedEvent;
    }
  | { status: 'error'; title: string; message: string };

export type ActionsPaneProps = {
  runtime: PopupRuntime;
  notify: Notifier;
  navigateToPane: (paneId: PaneId) => void;
  focusTokenInput: () => void;
};

function isRunContextActionResponse(value: unknown): value is RunContextActionResponse {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as { ok?: unknown };
  if (typeof v.ok !== 'boolean') return false;
  return true;
}

function coerceSourceLabel(source: unknown): string {
  return source === 'selection' ? '選択範囲' : source === 'page' ? 'ページ本文' : '-';
}

function coerceKind(value: unknown): ContextActionKind | null {
  return value === 'event' ? 'event' : value === 'text' ? 'text' : null;
}

function coerceExtractedEvent(value: unknown): ExtractedEvent | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Partial<ExtractedEvent>;
  const title = typeof raw.title === 'string' ? raw.title : '';
  const start = typeof raw.start === 'string' ? raw.start : '';
  const end = typeof raw.end === 'string' ? raw.end : undefined;
  const allDay = typeof raw.allDay === 'boolean' ? raw.allDay : undefined;
  const location = typeof raw.location === 'string' ? raw.location : undefined;
  const description = typeof raw.description === 'string' ? raw.description : undefined;
  if (!start.trim()) return null;
  return { title, start, end, allDay, location, description };
}

export function ActionsPane(props: ActionsPaneProps): React.JSX.Element {
  const [actions, setActions] = useState<ContextAction[]>([]);
  const [output, setOutput] = useState<OutputState>({ status: 'idle' });
  const [editorId, setEditorId] = useState<string>('');
  const [editorTitle, setEditorTitle] = useState('');
  const [editorKind, setEditorKind] = useState<ContextActionKind>('text');
  const [editorPrompt, setEditorPrompt] = useState('');

  const actionsById = useMemo(() => new Map(actions.map(action => [action.id, action])), [actions]);
  const outputTitle = output.status === 'ready' || output.status === 'running' ? output.title : '出力';
  const outputText = output.status === 'ready' ? output.text : '';
  const canCopyOutput = Boolean(outputText.trim());
  const canOpenCalendar = output.status === 'ready' && output.mode === 'event' && Boolean(output.calendarUrl?.trim());
  const canDownloadIcs = output.status === 'ready' && output.mode === 'event' && Boolean(output.event);
  const outputValue =
    output.status === 'ready'
      ? output.text
      : output.status === 'running'
        ? '実行中...'
        : output.status === 'error'
          ? output.message
          : '';

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await props.runtime.storageSyncGet(['contextActions']);
        const normalized = normalizeContextActions(data.contextActions);
        if (normalized.length > 0) {
          if (!cancelled) setActions(normalized);
          return;
        }

        if (!cancelled) setActions(DEFAULT_CONTEXT_ACTIONS);
        await props.runtime.storageSyncSet({ contextActions: DEFAULT_CONTEXT_ACTIONS });
      } catch {
        if (!cancelled) setActions(DEFAULT_CONTEXT_ACTIONS);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.runtime]);

  useEffect(() => {
    if (!editorId) return;
    if (actions.some(action => action.id === editorId)) return;
    setEditorId('');
    setEditorTitle('');
    setEditorKind('text');
    setEditorPrompt('');
  }, [actions, editorId]);

  const selectActionForEdit = (nextId: string): void => {
    setEditorId(nextId);
    if (!nextId) {
      setEditorTitle('');
      setEditorKind('text');
      setEditorPrompt('');
      return;
    }
    const action = actionsById.get(nextId);
    if (!action) return;
    setEditorTitle(action.title);
    setEditorKind(action.kind);
    setEditorPrompt(action.prompt);
  };

  const createActionId = (): string => {
    const uuid =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `custom:${uuid}`;
  };

  const saveEditor = async (): Promise<void> => {
    const title = editorTitle.trim();
    if (!title) {
      props.notify.error('タイトルを入力してください');
      return;
    }

    const prompt = editorPrompt;
    if (editorKind === 'text' && !prompt.trim()) {
      props.notify.error('プロンプトを入力してください');
      return;
    }

    const nextId = editorId || createActionId();
    const next: ContextAction = { id: nextId, title, kind: editorKind, prompt };

    const previous = actions;
    const nextActions = editorId ? actions.map(action => (action.id === editorId ? next : action)) : [...actions, next];

    setActions(nextActions);
    setEditorId(nextId);

    try {
      await props.runtime.storageSyncSet({ contextActions: nextActions });
      props.notify.success('保存しました');
    } catch {
      setActions(previous);
      props.notify.error('保存に失敗しました');
    }
  };

  const deleteEditor = async (): Promise<void> => {
    if (!editorId) return;

    const previous = actions;
    const nextActions = actions.filter(action => action.id !== editorId);
    setActions(nextActions);
    setEditorId('');
    setEditorTitle('');
    setEditorKind('text');
    setEditorPrompt('');

    try {
      await props.runtime.storageSyncSet({ contextActions: nextActions });
      props.notify.success('削除しました');
    } catch {
      setActions(previous);
      props.notify.error('削除に失敗しました');
    }
  };

  const resetActions = async (): Promise<void> => {
    const previous = actions;
    setActions(DEFAULT_CONTEXT_ACTIONS);
    setEditorId('');
    setEditorTitle('');
    setEditorKind('text');
    setEditorPrompt('');

    try {
      await props.runtime.storageSyncSet({ contextActions: DEFAULT_CONTEXT_ACTIONS });
      props.notify.success('リセットしました');
    } catch {
      setActions(previous);
      props.notify.error('リセットに失敗しました');
    }
  };

  const runAction = async (actionId: string): Promise<void> => {
    const action = actionsById.get(actionId);
    if (!action) {
      props.notify.error('アクションが見つかりません');
      setOutput({ status: 'idle' });
      return;
    }

    const tokenConfigured = await ensureOpenAiTokenConfigured({
      storageLocalGet: keys => props.runtime.storageLocalGet(keys as never) as Promise<unknown>,
      showNotification: (message, type) => {
        if (type === 'error') {
          props.notify.error(message);
          return;
        }
        props.notify.info(message);
      },
      navigateToPane: paneId => {
        props.navigateToPane(paneId as PaneId);
      },
      focusTokenInput: props.focusTokenInput,
    });

    if (Result.isFailure(tokenConfigured)) {
      setOutput({ status: 'idle' });
      return;
    }

    setOutput({ status: 'running', title: action.title });

    try {
      const tabId = await props.runtime.getActiveTabId();
      if (tabId === null) {
        props.notify.error('有効なタブが見つかりません');
        setOutput({ status: 'idle' });
        return;
      }

      const responseUnknown = await props.runtime.sendMessageToBackground<RunContextActionRequest, unknown>({
        action: 'runContextAction',
        tabId,
        actionId,
      });

      if (!isRunContextActionResponse(responseUnknown)) {
        props.notify.error('バックグラウンドの応答が不正です');
        setOutput({ status: 'idle' });
        return;
      }

      const response = responseUnknown;

      if (!response.ok) {
        props.notify.error(response.error);
        setOutput({ status: 'idle' });
        return;
      }

      const sourceLabel = coerceSourceLabel((response as { source?: unknown }).source);
      const resultType = (response as { resultType?: unknown }).resultType;
      const kind = coerceKind(resultType);

      if (kind === 'event') {
        const eventText = (response as { eventText?: unknown }).eventText;
        if (typeof eventText !== 'string') {
          props.notify.error('イベント結果が不正です');
          setOutput({ status: 'idle' });
          return;
        }
        const calendarUrl = (response as { calendarUrl?: unknown }).calendarUrl;
        const calendarUrlText = typeof calendarUrl === 'string' ? calendarUrl.trim() : '';
        const event = coerceExtractedEvent((response as { event?: unknown }).event);
        setOutput({
          status: 'ready',
          title: action.title,
          text: eventText,
          sourceLabel,
          mode: 'event',
          calendarUrl: calendarUrlText || undefined,
          event: event ?? undefined,
        });
        props.notify.success('完了しました');
        return;
      }

      const text = (response as { text?: unknown }).text;
      if (typeof text !== 'string') {
        props.notify.error('テキスト結果が不正です');
        setOutput({ status: 'idle' });
        return;
      }
      setOutput({ status: 'ready', title: action.title, text, sourceLabel, mode: 'text' });
      props.notify.success('完了しました');
    } catch (error) {
      props.notify.error(error instanceof Error ? error.message : 'アクションの実行に失敗しました');
      setOutput({ status: 'idle' });
    }
  };

  const copyOutput = async (): Promise<void> => {
    if (output.status !== 'ready') return;
    const text = output.text.trim();
    if (!text) return;

    try {
      if (!navigator.clipboard?.writeText) {
        props.notify.error('この環境ではクリップボードにコピーできません');
        return;
      }
      await navigator.clipboard.writeText(text);
      props.notify.success('コピーしました');
    } catch {
      props.notify.error('コピーに失敗しました');
    }
  };

  const openCalendar = (): void => {
    if (output.status !== 'ready' || output.mode !== 'event') return;
    const calendarUrl = output.calendarUrl?.trim() ?? '';
    if (!calendarUrl) {
      props.notify.error('カレンダーリンクが見つかりません');
      return;
    }
    props.runtime.openUrl(calendarUrl);
  };

  const downloadIcs = (): void => {
    if (output.status !== 'ready' || output.mode !== 'event') return;
    const event = output.event;
    if (!event) {
      props.notify.error('.ics の生成に必要な情報が不足しています');
      return;
    }
    const ics = buildIcs(event);
    if (!ics) {
      props.notify.error('.ics の生成に失敗しました');
      return;
    }

    try {
      const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${sanitizeFileName(event.title || output.title)}.ics`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      props.notify.success('ダウンロードしました');
    } catch {
      props.notify.error('.ics のダウンロードに失敗しました');
    }
  };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>Context Actions</h2>
        <span data-testid="action-source">
          {output.status === 'ready' ? output.sourceLabel : output.status === 'running' ? '-' : '-'}
        </span>
      </div>

      <div data-testid="template-vars" style={{ marginTop: 10, fontSize: 12, opacity: 0.9 }}>
        テンプレ変数: <code>{'{{text}}'}</code> <code>{'{{title}}'}</code> <code>{'{{url}}'}</code>{' '}
        <code>{'{{source}}'}</code>
      </div>

      <ActionButtons
        actions={actions}
        onRun={actionId => {
          void runAction(actionId);
        }}
      />

      <ActionOutputPanel
        canCopy={canCopyOutput}
        canDownloadIcs={canDownloadIcs}
        canOpenCalendar={canOpenCalendar}
        onCopy={() => {
          void copyOutput();
        }}
        onDownloadIcs={() => {
          downloadIcs();
        }}
        onOpenCalendar={() => {
          openCalendar();
        }}
        title={outputTitle}
        value={outputValue}
      />

      <ActionEditorPanel
        actions={actions}
        editorId={editorId}
        editorKind={editorKind}
        editorPrompt={editorPrompt}
        editorTitle={editorTitle}
        onChangeKind={next => {
          setEditorKind(next);
        }}
        onChangePrompt={next => {
          setEditorPrompt(next);
        }}
        onChangeTitle={next => {
          setEditorTitle(next);
        }}
        onClear={() => {
          selectActionForEdit('');
        }}
        onDelete={() => {
          void deleteEditor();
        }}
        onReset={() => {
          void resetActions();
        }}
        onSave={() => {
          void saveEditor();
        }}
        onSelectActionId={nextId => {
          selectActionForEdit(nextId);
        }}
      />
    </div>
  );
}
