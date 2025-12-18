import { useEffect, useState } from 'react';
import { DEFAULT_OPENAI_MODEL, normalizeOpenAiModel, OPENAI_MODEL_OPTIONS } from '../../openai/settings';
import type { LocalStorageData } from '../../storage/types';
import type { Notifier } from '../../ui/toast';
import type { PopupRuntime, TestOpenAiTokenRequest, TestOpenAiTokenResponse } from '../runtime';

type Props = {
  runtime: PopupRuntime;
  notify: Notifier;
  tokenInputRef: React.RefObject<HTMLInputElement | null>;
};

function isTestOpenAiTokenResponse(value: unknown): value is TestOpenAiTokenResponse {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as { ok?: unknown };
  if (typeof v.ok !== 'boolean') return false;
  if (v.ok) return true;
  return typeof (value as { error?: unknown }).error === 'string';
}

export function SettingsPane(props: Props): React.JSX.Element {
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [model, setModel] = useState(DEFAULT_OPENAI_MODEL);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await props.runtime.storageLocalGet(['openaiApiToken', 'openaiCustomPrompt', 'openaiModel']);
        const raw = data as Partial<LocalStorageData>;
        if (cancelled) return;
        setToken(raw.openaiApiToken ?? '');
        setCustomPrompt(raw.openaiCustomPrompt ?? '');
        setModel(normalizeOpenAiModel(raw.openaiModel));
      } catch {
        // no-op
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.runtime]);

  const saveToken = async (): Promise<void> => {
    try {
      await props.runtime.storageLocalSet({ openaiApiToken: token });
      props.notify.success('保存しました');
    } catch {
      props.notify.error('保存に失敗しました');
    }
  };

  const clearToken = async (): Promise<void> => {
    try {
      await props.runtime.storageLocalRemove('openaiApiToken');
      setToken('');
      props.notify.success('削除しました');
    } catch {
      props.notify.error('削除に失敗しました');
    }
  };

  const testToken = async (): Promise<void> => {
    try {
      const tokenOverride = token.trim() ? token.trim() : undefined;
      const responseUnknown = await props.runtime.sendMessageToBackground<TestOpenAiTokenRequest, unknown>({
        action: 'testOpenAiToken',
        token: tokenOverride,
      });

      if (!isTestOpenAiTokenResponse(responseUnknown)) {
        props.notify.error('バックグラウンドの応答が不正です');
        return;
      }

      if (responseUnknown.ok) {
        props.notify.success('トークンOK');
        return;
      }

      props.notify.error(responseUnknown.error);
    } catch (error) {
      props.notify.error(error instanceof Error ? error.message : 'トークン確認に失敗しました');
    }
  };

  const savePrompt = async (): Promise<void> => {
    try {
      await props.runtime.storageLocalSet({ openaiCustomPrompt: customPrompt });
      props.notify.success('保存しました');
    } catch {
      props.notify.error('保存に失敗しました');
    }
  };

  const clearPrompt = async (): Promise<void> => {
    try {
      await props.runtime.storageLocalRemove('openaiCustomPrompt');
      setCustomPrompt('');
      props.notify.success('削除しました');
    } catch {
      props.notify.error('削除に失敗しました');
    }
  };

  const saveModel = async (): Promise<void> => {
    const normalized = normalizeOpenAiModel(model);
    try {
      await props.runtime.storageLocalSet({ openaiModel: normalized });
      setModel(normalized);
      props.notify.success('保存しました');
    } catch {
      props.notify.error('保存に失敗しました');
    }
  };

  const resetModel = async (): Promise<void> => {
    try {
      await props.runtime.storageLocalRemove('openaiModel');
      setModel(DEFAULT_OPENAI_MODEL);
      props.notify.success('デフォルトに戻しました');
    } catch {
      props.notify.error('変更に失敗しました');
    }
  };

  return (
    <div style={{ padding: 16, display: 'grid', gap: 16 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 16 }}>設定</h2>
        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.9 }}>OpenAI設定はこの端末のみ（同期されません）</div>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 12, opacity: 0.9 }}>OpenAI API Token</span>
          <input
            data-testid="openai-token"
            onChange={event => setToken(event.currentTarget.value)}
            ref={props.tokenInputRef}
            type={showToken ? 'text' : 'password'}
            value={token}
          />
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            checked={showToken}
            data-testid="token-visible"
            onChange={event => setShowToken(event.currentTarget.checked)}
            type="checkbox"
          />
          表示する
        </label>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button data-testid="token-save" onClick={() => void saveToken()} type="button">
            保存
          </button>
          <button data-testid="token-clear" onClick={() => void clearToken()} type="button">
            削除
          </button>
          <button data-testid="token-test" onClick={() => void testToken()} type="button">
            トークン確認
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 12, opacity: 0.9 }}>モデル</span>
          <select data-testid="openai-model" onChange={event => setModel(event.currentTarget.value)} value={model}>
            {OPENAI_MODEL_OPTIONS.map(option => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button data-testid="model-save" onClick={() => void saveModel()} type="button">
            保存
          </button>
          <button data-testid="model-reset" onClick={() => void resetModel()} type="button">
            デフォルトに戻す
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 12, opacity: 0.9 }}>追加指示（任意）</span>
          <textarea
            data-testid="custom-prompt"
            onChange={event => setCustomPrompt(event.currentTarget.value)}
            rows={6}
            value={customPrompt}
          />
        </label>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button data-testid="prompt-save" onClick={() => void savePrompt()} type="button">
            保存
          </button>
          <button data-testid="prompt-clear" onClick={() => void clearPrompt()} type="button">
            削除
          </button>
        </div>
      </div>
    </div>
  );
}
