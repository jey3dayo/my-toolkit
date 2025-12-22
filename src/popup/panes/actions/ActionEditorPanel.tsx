import { Button } from "@base-ui/react/button";
import { Fieldset } from "@base-ui/react/fieldset";
import { Form } from "@base-ui/react/form";
import { Input } from "@base-ui/react/input";
import { Popover } from "@base-ui/react/popover";
import { Select } from "@base-ui/react/select";
import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { useId } from "react";
import type { ContextAction, ContextActionKind } from "@/context_actions";

type Props = {
  actions: ContextAction[];
  editorId: string;
  editorTitle: string;
  editorKind: ContextActionKind;
  editorPrompt: string;
  onSelectActionId: (actionId: string) => void;
  onChangeTitle: (value: string) => void;
  onChangeKind: (value: ContextActionKind) => void;
  onChangePrompt: (value: string) => void;
  onSave: () => void;
  onDelete: () => void;
  onClear: () => void;
  onReset: () => void;
};

export function ActionEditorPanel(props: Props): React.JSX.Element {
  const titleInputId = useId();
  const actionLabelId = useId();

  const actions = [
    { label: "新規作成", value: null as string | null },
    ...props.actions.map((action) => ({
      label: action.title,
      value: action.id,
    })),
  ];

  return (
    <section className="editor-panel">
      <Form
        onFormSubmit={() => {
          props.onSave();
        }}
      >
        <Fieldset.Root className="editor-form mbu-fieldset">
          <Fieldset.Legend className="editor-title">
            アクション編集
          </Fieldset.Legend>

          <div className="field">
            <span className="field-name" id={actionLabelId}>
              対象
            </span>
            <Select.Root
              items={actions}
              onValueChange={(value) => {
                props.onSelectActionId(typeof value === "string" ? value : "");
              }}
              value={props.editorId || null}
            >
              <Select.Trigger
                aria-labelledby={actionLabelId}
                className="token-input mbu-select-trigger"
                data-testid="action-editor-select"
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
                      {actions.map((item) => (
                        <Select.Item
                          className="mbu-select-item"
                          key={item.value ?? "new"}
                          value={item.value}
                        >
                          <Select.ItemText>{item.label}</Select.ItemText>
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

          <label className="field" htmlFor={titleInputId}>
            <span className="field-name">タイトル</span>
            <Input
              className="token-input"
              data-testid="action-editor-title"
              id={titleInputId}
              onValueChange={props.onChangeTitle}
              type="text"
              value={props.editorTitle}
            />
          </label>

          <div className="field">
            <div className="field-row">
              <span className="field-name">種類</span>
              <Popover.Root>
                <Popover.Trigger
                  aria-label="eventとは"
                  className="mbu-popover-trigger"
                  type="button"
                >
                  ?
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Positioner
                    className="mbu-popover-positioner"
                    sideOffset={6}
                  >
                    <Popover.Popup className="mbu-popover">
                      <Popover.Title className="mbu-popover-title">
                        event とは
                      </Popover.Title>
                      <Popover.Description className="mbu-popover-description">
                        event
                        は日時・場所・概要などを抽出してイベント形式で返すモードです。
                        text はプロンプトに従って要約/翻訳などを行います。
                      </Popover.Description>
                    </Popover.Popup>
                  </Popover.Positioner>
                </Popover.Portal>
              </Popover.Root>
            </div>
            <ToggleGroup
              className="mbu-toggle-group"
              data-testid="action-editor-kind"
              onValueChange={(groupValue) => {
                const next = groupValue[0];
                props.onChangeKind(next === "event" ? "event" : "text");
              }}
              value={[props.editorKind]}
            >
              <Toggle className="mbu-toggle-group-item" value="text">
                text
              </Toggle>
              <Toggle className="mbu-toggle-group-item" value="event">
                event
              </Toggle>
            </ToggleGroup>
          </div>

          <label className="field">
            <span className="field-name">プロンプト</span>
            <textarea
              className="prompt-input"
              data-testid="action-editor-prompt"
              onChange={(event) => {
                props.onChangePrompt(event.currentTarget.value);
              }}
              rows={6}
              value={props.editorPrompt}
            />
          </label>

          <div className="button-row">
            <Button
              className="btn btn-primary btn-small"
              data-testid="action-editor-save"
              onClick={() => {
                props.onSave();
              }}
              type="button"
            >
              保存
            </Button>
            <Button
              className="btn-delete"
              data-testid="action-editor-delete"
              disabled={!props.editorId}
              onClick={() => {
                props.onDelete();
              }}
              type="button"
            >
              削除
            </Button>
            <Button
              className="btn btn-ghost btn-small"
              data-testid="action-editor-clear"
              onClick={() => {
                props.onClear();
              }}
              type="button"
            >
              クリア
            </Button>
            <Button
              className="btn btn-ghost btn-small"
              data-testid="action-editor-reset"
              onClick={() => {
                props.onReset();
              }}
              type="button"
            >
              デフォルトに戻す
            </Button>
          </div>
        </Fieldset.Root>
      </Form>
    </section>
  );
}
