import { Button } from "@base-ui/react/button";
import { Result } from "@praha/byethrow";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import type { PaneId } from "@/popup/panes";
import type { PopupPaneBaseProps } from "@/popup/panes/types";
import type {
  SummarizeEventRequest,
  SummarizeEventResponse,
  SummaryTarget,
} from "@/popup/runtime";
import { ensureOpenAiTokenConfigured } from "@/popup/token_guard";
import { coerceSummarySourceLabel } from "@/popup/utils/summary_source_label";
import { fetchSummaryTargetForActiveTab } from "@/popup/utils/summary_target";
import type {
  CalendarRegistrationTarget,
  ExtractedEvent,
} from "@/shared_types";
import {
  DEFAULT_CALENDAR_TARGETS,
  resolveCalendarTargets,
} from "@/utils/calendar_targets";
import { buildIcs, sanitizeFileName } from "@/utils/ics";

export type CalendarPaneProps = PopupPaneBaseProps & {
  navigateToPane: (paneId: PaneId) => void;
  focusTokenInput: () => void;
};

type OutputState =
  | { status: "idle" }
  | { status: "running" }
  | {
      status: "ready";
      text: string;
      sourceLabel: string;
      calendarUrl?: string;
      event: ExtractedEvent;
    }
  | { status: "error"; message: string };

type SummarizeEventSuccess = Extract<SummarizeEventResponse, { ok: true }>;

export function CalendarPane(props: CalendarPaneProps): React.JSX.Element {
  const [targets, setTargets] = useState<CalendarRegistrationTarget[]>(
    DEFAULT_CALENDAR_TARGETS
  );
  const [output, setOutput] = useState<OutputState>({ status: "idle" });

  const googleId = useId();
  const icsId = useId();

  const hasGoogle = targets.includes("google");
  const hasIcs = targets.includes("ics");

  const outputTitle =
    output.status === "ready" || output.status === "running"
      ? "イベント内容"
      : "出力";
  const outputText = output.status === "ready" ? output.text : "";
  const canCopyOutput = Boolean(outputText.trim());
  const canOpenCalendar =
    output.status === "ready" &&
    hasGoogle &&
    Boolean(output.calendarUrl?.trim());
  const canDownloadIcs = output.status === "ready" && hasIcs;

  const outputValue = useMemo(() => {
    switch (output.status) {
      case "ready":
        return output.text;
      case "running":
        return "抽出中...";
      case "error":
        return output.message;
      default:
        return "";
    }
  }, [output]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await props.runtime.storageSyncGet(["calendarTargets"]);
      if (Result.isFailure(data)) {
        return;
      }
      if (cancelled) {
        return;
      }
      const next = resolveCalendarTargets(data.value.calendarTargets);
      setTargets(next);
    })().catch(() => {
      // no-op
    });
    return () => {
      cancelled = true;
    };
  }, [props.runtime]);

  const saveTargets = useCallback(
    async (next: CalendarRegistrationTarget[]): Promise<void> => {
      setTargets(next);
      const saved = await props.runtime.storageSyncSet({
        calendarTargets: next,
      });
      if (Result.isSuccess(saved)) {
        props.notify.success("保存しました");
        return;
      }
      props.notify.error("保存に失敗しました");
      setTargets(targets);
    },
    [props.notify, props.runtime, targets]
  );

  const toggleTarget = (target: CalendarRegistrationTarget): void => {
    const next = targets.includes(target)
      ? targets.filter((item) => item !== target)
      : [...targets, target];
    saveTargets(next).catch(() => {
      // no-op
    });
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

  const ensureTargetsSelected = (): boolean => {
    if (targets.length === 0) {
      props.notify.error("登録先を1つ以上選択してください");
      return false;
    }
    return true;
  };

  const requestEventSummary = async (
    target: SummaryTarget
  ): Promise<SummarizeEventSuccess | null> => {
    const response = await props.runtime.sendMessageToBackground<
      SummarizeEventRequest,
      SummarizeEventResponse
    >({ action: "summarizeEvent", target });
    if (Result.isFailure(response)) {
      reportError(response.error);
      return null;
    }
    if (!response.value.ok) {
      reportError(response.value.error);
      return null;
    }
    return response.value;
  };

  const runCalendar = async (): Promise<void> => {
    if (!ensureTargetsSelected()) {
      return;
    }

    const tokenReady = await ensureTokenReady();
    if (!tokenReady) {
      setOutput({ status: "idle" });
      return;
    }

    setOutput({ status: "running" });

    const target = await fetchSummaryTargetForActiveTab({
      runtime: props.runtime,
      onError: reportError,
    });
    if (!target) {
      return;
    }

    const payload = await requestEventSummary(target);
    if (!payload) {
      return;
    }

    const calendarUrl = hasGoogle
      ? payload.calendarUrl?.trim() || undefined
      : undefined;
    if (hasGoogle && !calendarUrl) {
      props.notify.error(
        payload.calendarError ?? "Googleカレンダーリンクを生成できません"
      );
    }

    setOutput({
      status: "ready",
      text: payload.eventText,
      sourceLabel: coerceSummarySourceLabel(target.source),
      calendarUrl,
      event: payload.event,
    });
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

  const openCalendar = (): void => {
    if (output.status !== "ready") {
      return;
    }
    const calendarUrl = output.calendarUrl?.trim() ?? "";
    if (!calendarUrl) {
      props.notify.error("カレンダーリンクが見つかりません");
      return;
    }
    props.runtime.openUrl(calendarUrl);
  };

  const downloadIcs = (): void => {
    if (output.status !== "ready") {
      return;
    }
    const event = output.event;
    const ics = buildIcs(event);
    if (!ics) {
      props.notify.error(".ics の生成に失敗しました");
      return;
    }

    try {
      const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${sanitizeFileName(event.title || "event")}.ics`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      props.notify.success("ダウンロードしました");
    } catch {
      props.notify.error(".ics のダウンロードに失敗しました");
    }
  };

  return (
    <div className="card card-stack">
      <div className="row-between">
        <h2 className="pane-title">カレンダー登録</h2>
        <span className="chip chip-soft" data-testid="calendar-source">
          {output.status === "ready" ? output.sourceLabel : "-"}
        </span>
      </div>

      <p className="hint">
        選択範囲があれば優先し、なければページ本文からイベントを抽出します。
      </p>

      <div className="stack">
        <div className="field">
          <span className="field-name">登録先</span>
          <div className="action-row">
            <label className="checkbox-inline" htmlFor={googleId}>
              <input
                checked={hasGoogle}
                id={googleId}
                onChange={() => {
                  toggleTarget("google");
                }}
                type="checkbox"
              />
              Googleカレンダー
            </label>
            <label className="checkbox-inline" htmlFor={icsId}>
              <input
                checked={hasIcs}
                id={icsId}
                onChange={() => {
                  toggleTarget("ics");
                }}
                type="checkbox"
              />
              iCal (.ics)
            </label>
          </div>
        </div>

        <div className="button-row">
          <Button
            className="btn btn-primary btn-small"
            data-testid="calendar-run"
            onClick={() => {
              runCalendar().catch(() => {
                // no-op
              });
            }}
            type="button"
          >
            抽出する
          </Button>
          <Button
            className="btn btn-ghost btn-small"
            data-testid="calendar-copy"
            disabled={!canCopyOutput}
            onClick={() => {
              copyOutput().catch(() => {
                // no-op
              });
            }}
            type="button"
          >
            コピー
          </Button>
          {hasGoogle ? (
            <Button
              className="btn btn-ghost btn-small"
              data-testid="calendar-open-google"
              disabled={!canOpenCalendar}
              onClick={() => {
                openCalendar();
              }}
              type="button"
            >
              Googleカレンダー
            </Button>
          ) : null}
          {hasIcs ? (
            <Button
              className="btn btn-ghost btn-small"
              data-testid="calendar-download-ics"
              disabled={!canDownloadIcs}
              onClick={() => {
                downloadIcs();
              }}
              type="button"
            >
              .ics
            </Button>
          ) : null}
        </div>
      </div>

      <section className="output-panel">
        <div className="row-between">
          <div className="meta-title">{outputTitle}</div>
        </div>
        <textarea
          className="summary-output summary-output--sm"
          data-testid="calendar-output"
          readOnly
          value={outputValue}
        />
      </section>
    </div>
  );
}
