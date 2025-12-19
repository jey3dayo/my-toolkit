import { Button } from "@base-ui/react/button";
import { Input } from "@base-ui/react/input";
import { Select } from "@base-ui/react/select";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import {
  formatLink,
  LINK_FORMAT_OPTIONS,
  type LinkFormat,
} from "@/popup/panes/create_link/format";
import type { PopupPaneBaseProps } from "@/popup/panes/types";

export type CreateLinkPaneProps = PopupPaneBaseProps;

export function CreateLinkPane(props: CreateLinkPaneProps): React.JSX.Element {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [format, setFormat] = useState<LinkFormat>("markdown");
  const [loading, setLoading] = useState(false);

  const titleInputId = useId();
  const urlInputId = useId();
  const formatLabelId = useId();
  const formatTriggerId = useId();

  const output = useMemo(
    () => formatLink({ title, url }, format),
    [format, title, url]
  );
  const canCopy = Boolean(output.trim());

  const loadFromActiveTab = useCallback(
    async ({ showToast }: { showToast: boolean }): Promise<void> => {
      const notify = showToast ? props.notify : null;
      setLoading(true);
      try {
        const activeTab = await props.runtime.getActiveTab();
        if (!activeTab) {
          notify?.error("有効なタブが見つかりません");
          return;
        }
        setTitle(activeTab.title ?? "");
        setUrl(activeTab.url ?? "");
        notify?.success("現在のタブから更新しました");
      } catch (error) {
        notify?.error(
          error instanceof Error ? error.message : "取得に失敗しました"
        );
      } finally {
        setLoading(false);
      }
    },
    [props.notify, props.runtime]
  );

  useEffect(() => {
    loadFromActiveTab({ showToast: false }).catch(() => {
      // no-op
    });
  }, [loadFromActiveTab]);

  const copyOutput = async (): Promise<void> => {
    const text = output.trim();
    if (!text) {
      props.notify.error(
        url.trim() ? "コピーする内容がありません" : "URLが空です"
      );
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
        <h2 className="pane-title">リンク作成</h2>
        <div className="button-row">
          <Button
            className="btn btn-ghost btn-small"
            data-testid="create-link-refresh"
            disabled={loading}
            onClick={() => {
              loadFromActiveTab({ showToast: true }).catch(() => {
                // no-op
              });
            }}
            type="button"
          >
            更新
          </Button>
          <Button
            className="btn btn-primary btn-small"
            data-testid="create-link-copy"
            disabled={!canCopy}
            onClick={() => {
              copyOutput().catch(() => {
                // no-op
              });
            }}
            type="button"
          >
            コピー
          </Button>
        </div>
      </div>

      <p className="hint">
        現在のタブのURLを各形式でコピーします（タイトル/URLは編集できます）。
      </p>

      <div className="stack">
        <label className="field" htmlFor={titleInputId}>
          <span className="field-name">タイトル</span>
          <Input
            className="token-input"
            data-testid="create-link-title"
            id={titleInputId}
            onValueChange={setTitle}
            value={title}
          />
        </label>

        <label className="field" htmlFor={urlInputId}>
          <span className="field-name">URL</span>
          <Input
            className="token-input"
            data-testid="create-link-url"
            id={urlInputId}
            onValueChange={setUrl}
            value={url}
          />
        </label>

        <div className="field">
          <label
            className="field-name"
            htmlFor={formatTriggerId}
            id={formatLabelId}
          >
            形式
          </label>
          <Select.Root
            onValueChange={(value) => {
              if (typeof value !== "string") {
                return;
              }
              const next = LINK_FORMAT_OPTIONS.find(
                (option) => option.value === value
              )?.value;
              if (!next) {
                return;
              }
              setFormat(next);
            }}
            value={format}
          >
            <Select.Trigger
              aria-labelledby={formatLabelId}
              className="token-input mbu-select-trigger"
              data-testid="create-link-format"
              id={formatTriggerId}
              type="button"
            >
              <Select.Value className="mbu-select-value" />
              <Select.Icon className="mbu-select-icon">▾</Select.Icon>
            </Select.Trigger>
            <Select.Portal>
              <Select.Positioner
                className="mbu-select-positioner"
                sideOffset={6}
              >
                <Select.Popup className="mbu-select-popup">
                  <Select.List className="mbu-select-list">
                    {LINK_FORMAT_OPTIONS.map((option) => (
                      <Select.Item
                        className="mbu-select-item"
                        key={option.value}
                        value={option.value}
                      >
                        <Select.ItemText>{option.label}</Select.ItemText>
                        <Select.ItemIndicator className="mbu-select-indicator">
                          ✓
                        </Select.ItemIndicator>
                      </Select.Item>
                    ))}
                  </Select.List>
                </Select.Popup>
              </Select.Positioner>
            </Select.Portal>
          </Select.Root>
        </div>
      </div>

      <section className="output-panel">
        <div className="row-between">
          <div className="meta-title">プレビュー</div>
        </div>
        <textarea
          className="summary-output summary-output--sm"
          data-testid="create-link-output"
          readOnly
          value={output}
        />
      </section>
    </div>
  );
}
