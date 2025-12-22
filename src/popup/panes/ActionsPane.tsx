import { Result } from "@praha/byethrow";
import { useEffect, useMemo, useState } from "react";
import {
  type ContextAction,
  type ContextActionKind,
  DEFAULT_CONTEXT_ACTIONS,
  normalizeContextActions,
} from "@/context_actions";
import type { PaneId } from "@/popup/panes";
import { ActionButtons } from "@/popup/panes/actions/ActionButtons";
import { ActionEditorPanel } from "@/popup/panes/actions/ActionEditorPanel";
import { ActionOutputPanel } from "@/popup/panes/actions/ActionOutputPanel";
import { ActionTargetAccordion } from "@/popup/panes/actions/ActionTargetAccordion";
import type {
  PopupRuntime,
  RunContextActionRequest,
  RunContextActionResponse,
  SummaryTarget,
} from "@/popup/runtime";
import { ensureOpenAiTokenConfigured } from "@/popup/token_guard";
import { coerceSummarySourceLabel } from "@/popup/utils/summary_source_label";
import type { Notifier } from "@/ui/toast";
import { isRecord } from "@/utils/guards";

type OutputState =
  | { status: "idle" }
  | { status: "running"; title: string }
  | {
      status: "ready";
      title: string;
      text: string;
      sourceLabel: string;
    }
  | { status: "error"; title: string; message: string };

export type ActionsPaneProps = {
  runtime: PopupRuntime;
  notify: Notifier;
  navigateToPane: (paneId: PaneId) => void;
  focusTokenInput: () => void;
};

function isRunContextActionResponse(
  value: unknown
): value is RunContextActionResponse {
  if (!isRecord(value)) {
    return false;
  }
  const v = value as { ok?: unknown };
  if (typeof v.ok !== "boolean") {
    return false;
  }
  return true;
}

function isSummaryTarget(value: unknown): value is SummaryTarget {
  if (!isRecord(value)) {
    return false;
  }
  const v = value as { text?: unknown; source?: unknown };
  if (typeof v.text !== "string") {
    return false;
  }
  if (v.source !== "selection" && v.source !== "page") {
    return false;
  }
  return true;
}

function coerceKind(value: unknown): ContextActionKind | null {
  if (value === "event") {
    return "event";
  }
  if (value === "text") {
    return "text";
  }
  return null;
}

function parseRunContextActionResponseToOutput(params: {
  actionTitle: string;
  responseUnknown: unknown;
}): { ok: true; output: OutputState } | { ok: false; error: string } {
  if (!isRunContextActionResponse(params.responseUnknown)) {
    return { ok: false, error: "バックグラウンドの応答が不正です" };
  }

  const response = params.responseUnknown;
  if (!response.ok) {
    const errorMessage = (response as { error?: unknown }).error;
    return {
      ok: false,
      error:
        typeof errorMessage === "string" ? errorMessage : "実行に失敗しました",
    };
  }

  const sourceLabel = coerceSummarySourceLabel(
    (response as { source?: unknown }).source
  );
  const resultType = (response as { resultType?: unknown }).resultType;
  const kind = coerceKind(resultType);

  if (kind === "event") {
    const eventText = (response as { eventText?: unknown }).eventText;
    if (typeof eventText !== "string") {
      return { ok: false, error: "イベント結果が不正です" };
    }
    return {
      ok: true,
      output: {
        status: "ready",
        title: params.actionTitle,
        text: eventText,
        sourceLabel,
      },
    };
  }

  if (kind !== "text") {
    return { ok: false, error: "結果の形式が不正です" };
  }

  const text = (response as { text?: unknown }).text;
  if (typeof text !== "string") {
    return { ok: false, error: "テキスト結果が不正です" };
  }
  return {
    ok: true,
    output: {
      status: "ready",
      title: params.actionTitle,
      text,
      sourceLabel,
    },
  };
}

export function ActionsPane(props: ActionsPaneProps): React.JSX.Element {
  const [actions, setActions] = useState<ContextAction[]>([]);
  const [output, setOutput] = useState<OutputState>({ status: "idle" });
  const [target, setTarget] = useState<SummaryTarget | null>(null);
  const [editorId, setEditorId] = useState<string>("");
  const [editorTitle, setEditorTitle] = useState("");
  const [editorKind, setEditorKind] = useState<ContextActionKind>("text");
  const [editorPrompt, setEditorPrompt] = useState("");

  const actionsById = useMemo(
    () => new Map(actions.map((action) => [action.id, action])),
    [actions]
  );
  const outputTitle =
    output.status === "ready" || output.status === "running"
      ? output.title
      : "出力";
  const outputText = output.status === "ready" ? output.text : "";
  const canCopyOutput = Boolean(outputText.trim());
  const targetSourceLabel = target
    ? coerceSummarySourceLabel(target.source)
    : "";
  const outputValue = (() => {
    switch (output.status) {
      case "ready":
        return output.text;
      case "running":
        return "実行中...";
      case "error":
        return output.message;
      default:
        return "";
    }
  })();

  useEffect(() => {
    let cancelled = false;
    const setActionsSafe = (next: ContextAction[]): void => {
      if (!cancelled) {
        setActions(next);
      }
    };

    (async () => {
      const data = await props.runtime.storageSyncGet(["contextActions"]);
      if (Result.isSuccess(data)) {
        const normalized = normalizeContextActions(data.value.contextActions);
        if (normalized.length > 0) {
          setActionsSafe(normalized);
          return;
        }
      }

      setActionsSafe(DEFAULT_CONTEXT_ACTIONS);
      await props.runtime
        .storageSyncSet({
          contextActions: DEFAULT_CONTEXT_ACTIONS,
        })
        .catch(() => {
          // no-op
        });
    })().catch(() => {
      // no-op
    });
    return () => {
      cancelled = true;
    };
  }, [props.runtime]);

  useEffect(() => {
    if (!editorId) {
      return;
    }
    if (actions.some((action) => action.id === editorId)) {
      return;
    }
    setEditorId("");
    setEditorTitle("");
    setEditorKind("text");
    setEditorPrompt("");
  }, [actions, editorId]);

  const selectActionForEdit = (nextId: string): void => {
    setEditorId(nextId);
    if (!nextId) {
      setEditorTitle("");
      setEditorKind("text");
      setEditorPrompt("");
      return;
    }
    const action = actionsById.get(nextId);
    if (!action) {
      return;
    }
    setEditorTitle(action.title);
    setEditorKind(action.kind);
    setEditorPrompt(action.prompt);
  };

  const createActionId = (): string => {
    const uuid =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `custom:${uuid}`;
  };

  const saveEditor = async (): Promise<void> => {
    const title = editorTitle.trim();
    if (!title) {
      props.notify.error("タイトルを入力してください");
      return;
    }

    const prompt = editorPrompt;
    if (editorKind === "text" && !prompt.trim()) {
      props.notify.error("プロンプトを入力してください");
      return;
    }

    const nextId = editorId || createActionId();
    const next: ContextAction = { id: nextId, title, kind: editorKind, prompt };

    const previous = actions;
    const nextActions = editorId
      ? actions.map((action) => (action.id === editorId ? next : action))
      : [...actions, next];

    setActions(nextActions);
    setEditorId(nextId);

    const saved = await props.runtime.storageSyncSet({
      contextActions: nextActions,
    });
    if (Result.isSuccess(saved)) {
      props.notify.success("保存しました");
      return;
    }
    setActions(previous);
    props.notify.error("保存に失敗しました");
  };

  const deleteEditor = async (): Promise<void> => {
    if (!editorId) {
      return;
    }

    const previous = actions;
    const nextActions = actions.filter((action) => action.id !== editorId);
    setActions(nextActions);
    setEditorId("");
    setEditorTitle("");
    setEditorKind("text");
    setEditorPrompt("");

    const saved = await props.runtime.storageSyncSet({
      contextActions: nextActions,
    });
    if (Result.isSuccess(saved)) {
      props.notify.success("削除しました");
      return;
    }
    setActions(previous);
    props.notify.error("削除に失敗しました");
  };

  const resetActions = async (): Promise<void> => {
    const previous = actions;
    setActions(DEFAULT_CONTEXT_ACTIONS);
    setEditorId("");
    setEditorTitle("");
    setEditorKind("text");
    setEditorPrompt("");

    const saved = await props.runtime.storageSyncSet({
      contextActions: DEFAULT_CONTEXT_ACTIONS,
    });
    if (Result.isSuccess(saved)) {
      props.notify.success("リセットしました");
      return;
    }
    setActions(previous);
    props.notify.error("リセットに失敗しました");
  };

  const ensureTokenReady = async (): Promise<boolean> => {
    const tokenConfigured = await ensureOpenAiTokenConfigured({
      storageLocalGet: (keys) => props.runtime.storageLocalGet(keys),
      showNotification: (message, type) => {
        if (type === "error") {
          props.notify.error(message);
          return;
        }
        props.notify.info(message);
      },
      navigateToPane: (paneId) => {
        props.navigateToPane(paneId as PaneId);
      },
      focusTokenInput: props.focusTokenInput,
    });

    return !Result.isFailure(tokenConfigured);
  };

  const reportError = (message: string): void => {
    props.notify.error(message);
    setOutput({ status: "idle" });
  };

  const fetchSummaryTarget = async (
    tabId: number
  ): Promise<SummaryTarget | null> => {
    const targetResult = await props.runtime.sendMessageToTab<
      { action: "getSummaryTargetText" },
      SummaryTarget
    >(tabId, { action: "getSummaryTargetText" });
    if (Result.isFailure(targetResult)) {
      reportError(targetResult.error);
      return null;
    }

    if (!isSummaryTarget(targetResult.value)) {
      reportError("対象テキストの取得に失敗しました");
      return null;
    }

    return targetResult.value;
  };

  const runAction = async (actionId: string): Promise<void> => {
    const action = actionsById.get(actionId);
    if (!action) {
      props.notify.error("アクションが見つかりません");
      setOutput({ status: "idle" });
      return;
    }

    const tokenReady = await ensureTokenReady();
    if (!tokenReady) {
      setOutput({ status: "idle" });
      return;
    }

    setOutput({ status: "running", title: action.title });
    setTarget(null);

    const tabIdResult = await props.runtime.getActiveTabId();
    if (Result.isFailure(tabIdResult)) {
      reportError(tabIdResult.error);
      return;
    }
    const tabId = tabIdResult.value;
    if (tabId === null) {
      reportError("有効なタブが見つかりません");
      return;
    }

    const summaryTarget = await fetchSummaryTarget(tabId);
    if (!summaryTarget) {
      return;
    }
    setTarget(summaryTarget);

    const responseUnknown = await props.runtime.sendMessageToBackground<
      RunContextActionRequest,
      unknown
    >({
      action: "runContextAction",
      tabId,
      actionId,
      target: summaryTarget,
    });
    if (Result.isFailure(responseUnknown)) {
      reportError(responseUnknown.error);
      return;
    }

    const parsed = parseRunContextActionResponseToOutput({
      actionTitle: action.title,
      responseUnknown: responseUnknown.value,
    });
    if (!parsed.ok) {
      reportError(parsed.error);
      return;
    }

    setOutput(parsed.output);
    props.notify.success("完了しました");
  };

  const copyOutput = async (): Promise<void> => {
    if (output.status !== "ready") {
      return;
    }
    const text = output.text.trim();
    if (!text) {
      return;
    }

    try {
      if (!navigator.clipboard?.writeText) {
        props.notify.error("この環境ではクリップボードにコピーできません");
        return;
      }
      await navigator.clipboard.writeText(text);
      props.notify.success("コピーしました");
    } catch {
      props.notify.error("コピーに失敗しました");
    }
  };

  return (
    <div className="card card-stack">
      <div className="row-between">
        <h2 className="pane-title">Context Actions</h2>
        <span className="chip chip-soft" data-testid="action-source">
          {output.status === "ready" ? output.sourceLabel : "-"}
        </span>
      </div>

      <p className="hint" data-testid="template-vars">
        テンプレ変数: <code>{"{{text}}"}</code> <code>{"{{title}}"}</code>{" "}
        <code>{"{{url}}"}</code> <code>{"{{source}}"}</code>
      </p>

      <ActionButtons
        actions={actions}
        onRun={(actionId) => {
          runAction(actionId).catch(() => {
            // no-op
          });
        }}
      />

      {target ? (
        <ActionTargetAccordion
          sourceLabel={targetSourceLabel}
          target={target}
        />
      ) : null}

      <ActionOutputPanel
        canCopy={canCopyOutput}
        onCopy={() => {
          copyOutput().catch(() => {
            // no-op
          });
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
        onChangeKind={(next) => {
          setEditorKind(next);
        }}
        onChangePrompt={(next) => {
          setEditorPrompt(next);
        }}
        onChangeTitle={(next) => {
          setEditorTitle(next);
        }}
        onClear={() => {
          selectActionForEdit("");
        }}
        onDelete={() => {
          deleteEditor().catch(() => {
            // no-op
          });
        }}
        onReset={() => {
          resetActions().catch(() => {
            // no-op
          });
        }}
        onSave={() => {
          saveEditor().catch(() => {
            // no-op
          });
        }}
        onSelectActionId={(nextId) => {
          selectActionForEdit(nextId);
        }}
      />
    </div>
  );
}
