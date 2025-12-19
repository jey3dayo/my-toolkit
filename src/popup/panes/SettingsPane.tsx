import { Button } from "@base-ui/react/button";
import { Field } from "@base-ui/react/field";
import { Fieldset } from "@base-ui/react/fieldset";
import { Form } from "@base-ui/react/form";
import { Input } from "@base-ui/react/input";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { Select } from "@base-ui/react/select";
import { Separator } from "@base-ui/react/separator";
import { Toggle } from "@base-ui/react/toggle";
import { useEffect, useId, useState } from "react";
import {
  DEFAULT_OPENAI_MODEL,
  normalizeOpenAiModel,
  OPENAI_MODEL_OPTIONS,
} from "@/openai/settings";
import type { PopupPaneBaseProps } from "@/popup/panes/types";
import type {
  TestOpenAiTokenRequest,
  TestOpenAiTokenResponse,
} from "@/popup/runtime";
import type { LocalStorageData } from "@/storage/types";
import { applyTheme, isTheme, type Theme } from "@/ui/theme";

export type SettingsPaneProps = PopupPaneBaseProps & {
  tokenInputRef: React.RefObject<HTMLInputElement | null>;
};

function isTestOpenAiTokenResponse(
  value: unknown
): value is TestOpenAiTokenResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const v = value as { ok?: unknown };
  if (typeof v.ok !== "boolean") {
    return false;
  }
  if (v.ok) {
    return true;
  }
  return typeof (value as { error?: unknown }).error === "string";
}

export function SettingsPane(props: SettingsPaneProps): React.JSX.Element {
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [model, setModel] = useState(DEFAULT_OPENAI_MODEL);
  const [theme, setTheme] = useState<Theme>("auto");
  const tokenInputId = useId();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await props.runtime.storageLocalGet([
          "openaiApiToken",
          "openaiCustomPrompt",
          "openaiModel",
          "theme",
        ]);
        const raw = data as Partial<LocalStorageData>;
        if (cancelled) {
          return;
        }
        setToken(raw.openaiApiToken ?? "");
        setCustomPrompt(raw.openaiCustomPrompt ?? "");
        setModel(normalizeOpenAiModel(raw.openaiModel));
        setTheme(isTheme(raw.theme) ? raw.theme : "auto");
        applyTheme(isTheme(raw.theme) ? raw.theme : "auto", document);
      } catch {
        // no-op
      }
    })().catch(() => {
      // no-op
    });
    return () => {
      cancelled = true;
    };
  }, [props.runtime]);

  const saveToken = async (): Promise<void> => {
    try {
      await props.runtime.storageLocalSet({ openaiApiToken: token });
      props.notify.success("保存しました");
    } catch {
      props.notify.error("保存に失敗しました");
    }
  };

  const clearToken = async (): Promise<void> => {
    try {
      await props.runtime.storageLocalRemove("openaiApiToken");
      setToken("");
      props.notify.success("削除しました");
    } catch {
      props.notify.error("削除に失敗しました");
    }
  };

  const testToken = async (): Promise<void> => {
    try {
      const tokenOverride = token.trim() ? token.trim() : undefined;
      const responseUnknown = await props.runtime.sendMessageToBackground<
        TestOpenAiTokenRequest,
        unknown
      >({
        action: "testOpenAiToken",
        token: tokenOverride,
      });

      if (!isTestOpenAiTokenResponse(responseUnknown)) {
        props.notify.error("バックグラウンドの応答が不正です");
        return;
      }

      if (responseUnknown.ok) {
        props.notify.success("トークンOK");
        return;
      }

      props.notify.error(responseUnknown.error);
    } catch (error) {
      props.notify.error(
        error instanceof Error ? error.message : "トークン確認に失敗しました"
      );
    }
  };

  const savePrompt = async (): Promise<void> => {
    try {
      await props.runtime.storageLocalSet({ openaiCustomPrompt: customPrompt });
      props.notify.success("保存しました");
    } catch {
      props.notify.error("保存に失敗しました");
    }
  };

  const clearPrompt = async (): Promise<void> => {
    try {
      await props.runtime.storageLocalRemove("openaiCustomPrompt");
      setCustomPrompt("");
      props.notify.success("削除しました");
    } catch {
      props.notify.error("削除に失敗しました");
    }
  };

  const saveModel = async (): Promise<void> => {
    const normalized = normalizeOpenAiModel(model);
    try {
      await props.runtime.storageLocalSet({ openaiModel: normalized });
      setModel(normalized);
      props.notify.success("保存しました");
    } catch {
      props.notify.error("保存に失敗しました");
    }
  };

  const resetModel = async (): Promise<void> => {
    try {
      await props.runtime.storageLocalRemove("openaiModel");
      setModel(DEFAULT_OPENAI_MODEL);
      props.notify.success("デフォルトに戻しました");
    } catch {
      props.notify.error("変更に失敗しました");
    }
  };

  const saveTheme = async (): Promise<void> => {
    if (!isTheme(theme)) {
      return;
    }
    try {
      await props.runtime.storageLocalSet({ theme });
      props.notify.success("保存しました");
    } catch {
      props.notify.error("保存に失敗しました");
    }
  };

  const resetTheme = async (): Promise<void> => {
    try {
      await props.runtime.storageLocalRemove("theme");
      setTheme("auto");
      applyTheme("auto", document);
      props.notify.success("デフォルトに戻しました");
    } catch {
      props.notify.error("変更に失敗しました");
    }
  };

  return (
    <div className="card card-stack">
      <div className="stack-sm">
        <h2 className="pane-title">設定</h2>
        <p className="hint">OpenAI設定はこの端末のみ（同期されません）</p>
      </div>

      <Form
        className="stack"
        onFormSubmit={() => {
          saveToken().catch(() => {
            // no-op
          });
        }}
      >
        <Fieldset.Root className="mbu-fieldset stack">
          <Fieldset.Legend className="mbu-fieldset-legend">
            OpenAI API トークン
          </Fieldset.Legend>

          <label className="field" htmlFor={tokenInputId}>
            <span className="field-name">トークン</span>
            <Input
              className="token-input"
              data-testid="openai-token"
              id={tokenInputId}
              onValueChange={setToken}
              ref={props.tokenInputRef}
              type={showToken ? "text" : "password"}
              value={token}
            />
          </label>

          <Toggle
            className="mbu-toggle"
            data-testid="token-visible"
            onPressedChange={setShowToken}
            pressed={showToken}
            type="button"
          >
            表示する
          </Toggle>
        </Fieldset.Root>

        <div className="button-row">
          <Button
            className="btn btn-primary btn-small"
            data-testid="token-save"
            onClick={() => {
              saveToken().catch(() => {
                // no-op
              });
            }}
            type="button"
          >
            保存
          </Button>
          <Button
            className="btn-delete"
            data-testid="token-clear"
            onClick={() => {
              clearToken().catch(() => {
                // no-op
              });
            }}
            type="button"
          >
            削除
          </Button>
          <Button
            className="btn btn-ghost btn-small"
            data-testid="token-test"
            onClick={() => {
              testToken().catch(() => {
                // no-op
              });
            }}
            type="button"
          >
            トークン確認
          </Button>
        </div>
      </Form>

      <Separator className="mbu-separator" />

      <Form
        className="stack"
        onFormSubmit={() => {
          saveModel().catch(() => {
            // no-op
          });
        }}
      >
        <Fieldset.Root className="mbu-fieldset stack">
          <Fieldset.Legend className="mbu-fieldset-legend">
            モデル
          </Fieldset.Legend>
          <Select.Root
            onValueChange={(value) => {
              if (typeof value === "string") {
                setModel(value);
              }
            }}
            value={model}
          >
            <Select.Trigger
              aria-label="モデル"
              className="token-input mbu-select-trigger"
              data-testid="openai-model"
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
                    {OPENAI_MODEL_OPTIONS.map((option) => (
                      <Select.Item
                        className="mbu-select-item"
                        key={option}
                        value={option}
                      >
                        <Select.ItemText>{option}</Select.ItemText>
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
        </Fieldset.Root>

        <div className="button-row">
          <Button
            className="btn btn-primary btn-small"
            data-testid="model-save"
            onClick={() => {
              saveModel().catch(() => {
                // no-op
              });
            }}
            type="button"
          >
            保存
          </Button>
          <Button
            className="btn btn-ghost btn-small"
            data-testid="model-reset"
            onClick={() => {
              resetModel().catch(() => {
                // no-op
              });
            }}
            type="button"
          >
            デフォルトに戻す
          </Button>
        </div>
      </Form>

      <Separator className="mbu-separator" />

      <Form
        className="stack"
        onFormSubmit={() => {
          saveTheme().catch(() => {
            // no-op
          });
        }}
      >
        <Field.Root name="theme">
          <Fieldset.Root
            className="mbu-fieldset stack"
            render={
              <RadioGroup
                className="mbu-radio-group"
                onValueChange={(value) => {
                  if (!isTheme(value)) {
                    return;
                  }
                  setTheme(value);
                  applyTheme(value, document);
                }}
                value={theme}
              />
            }
          >
            <Fieldset.Legend className="mbu-fieldset-legend">
              テーマ
            </Fieldset.Legend>
            <Field.Item>
              <Field.Label className="mbu-radio-label">
                <Radio.Root className="mbu-radio-root" value="auto">
                  <Radio.Indicator className="mbu-radio-indicator" />
                </Radio.Root>
                自動
              </Field.Label>
            </Field.Item>
            <Field.Item>
              <Field.Label className="mbu-radio-label">
                <Radio.Root className="mbu-radio-root" value="light">
                  <Radio.Indicator className="mbu-radio-indicator" />
                </Radio.Root>
                ライト
              </Field.Label>
            </Field.Item>
            <Field.Item>
              <Field.Label className="mbu-radio-label">
                <Radio.Root className="mbu-radio-root" value="dark">
                  <Radio.Indicator className="mbu-radio-indicator" />
                </Radio.Root>
                ダーク
              </Field.Label>
            </Field.Item>
          </Fieldset.Root>
        </Field.Root>

        <div className="button-row">
          <Button
            className="btn btn-primary btn-small"
            onClick={() => {
              saveTheme().catch(() => {
                // no-op
              });
            }}
            type="button"
          >
            保存
          </Button>
          <Button
            className="btn btn-ghost btn-small"
            onClick={() => {
              resetTheme().catch(() => {
                // no-op
              });
            }}
            type="button"
          >
            デフォルトに戻す
          </Button>
        </div>
      </Form>

      <Separator className="mbu-separator" />

      <Form
        className="stack"
        onFormSubmit={() => {
          savePrompt().catch(() => {
            // no-op
          });
        }}
      >
        <Fieldset.Root className="mbu-fieldset stack">
          <Fieldset.Legend className="mbu-fieldset-legend">
            追加指示（任意）
          </Fieldset.Legend>
          <label className="field">
            <span className="field-name">追加指示</span>
            <textarea
              className="prompt-input"
              data-testid="custom-prompt"
              onChange={(event) => setCustomPrompt(event.currentTarget.value)}
              rows={6}
              value={customPrompt}
            />
          </label>
        </Fieldset.Root>

        <div className="button-row">
          <Button
            className="btn btn-primary btn-small"
            data-testid="prompt-save"
            onClick={() => {
              savePrompt().catch(() => {
                // no-op
              });
            }}
            type="button"
          >
            保存
          </Button>
          <Button
            className="btn-delete"
            data-testid="prompt-clear"
            onClick={() => {
              clearPrompt().catch(() => {
                // no-op
              });
            }}
            type="button"
          >
            削除
          </Button>
        </div>
      </Form>
    </div>
  );
}
