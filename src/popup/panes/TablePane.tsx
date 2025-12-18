import { useEffect, useState } from 'react';
import type { EnableTableSortMessage } from '../runtime';
import type { PopupPaneBaseProps } from './types';

export type TablePaneProps = PopupPaneBaseProps;

function normalizePatterns(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, 200);
}

export function TablePane(props: TablePaneProps): React.JSX.Element {
  const [autoEnable, setAutoEnable] = useState(false);
  const [patterns, setPatterns] = useState<string[]>([]);
  const [patternInput, setPatternInput] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await props.runtime.storageSyncGet(['domainPatterns', 'autoEnableSort']);
        if (!cancelled) {
          setAutoEnable(Boolean(data.autoEnableSort));
          setPatterns(normalizePatterns(data.domainPatterns));
        }
      } catch {
        // no-op
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.runtime]);

  const enableNow = async (): Promise<void> => {
    try {
      const tabId = await props.runtime.getActiveTabId();
      if (tabId === null) {
        props.notify.error('有効なタブが見つかりません');
        return;
      }

      await props.runtime.sendMessageToTab<EnableTableSortMessage, unknown>(tabId, { action: 'enableTableSort' });
      props.notify.success('テーブルソートを有効化しました');
    } catch (error) {
      props.notify.error(error instanceof Error ? error.message : 'テーブルソートの有効化に失敗しました');
    }
  };

  const toggleAutoEnable = async (checked: boolean): Promise<void> => {
    setAutoEnable(checked);
    try {
      await props.runtime.storageSyncSet({ autoEnableSort: checked });
      props.notify.success('保存しました');
    } catch {
      props.notify.error('保存に失敗しました');
      setAutoEnable(!checked);
    }
  };

  const addPattern = async (): Promise<void> => {
    const raw = patternInput.trim();
    if (!raw) {
      props.notify.error('パターンを入力してください');
      return;
    }
    if (patterns.includes(raw)) {
      props.notify.info('既に追加されています');
      setPatternInput('');
      return;
    }

    const next = [...patterns, raw];
    setPatterns(next);
    setPatternInput('');
    try {
      await props.runtime.storageSyncSet({ domainPatterns: next });
      props.notify.success('追加しました');
    } catch {
      props.notify.error('追加に失敗しました');
      setPatterns(patterns);
    }
  };

  const removePattern = async (pattern: string): Promise<void> => {
    const next = patterns.filter(item => item !== pattern);
    setPatterns(next);
    try {
      await props.runtime.storageSyncSet({ domainPatterns: next });
      props.notify.success('削除しました');
    } catch {
      props.notify.error('削除に失敗しました');
      setPatterns(patterns);
    }
  };

  return (
    <div style={{ padding: 16, display: 'grid', gap: 14 }}>
      <div style={{ display: 'grid', gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>テーブルソート</h2>
        <button data-testid="enable-table-sort" onClick={() => void enableNow()} type="button">
          このタブで有効化
        </button>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input
          checked={autoEnable}
          data-testid="auto-enable-sort"
          onChange={event => void toggleAutoEnable(event.currentTarget.checked)}
          type="checkbox"
        />
        自動で有効化する
      </label>

      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ fontSize: 12, opacity: 0.9 }}>
          URLパターン（<code>*</code>ワイルドカード対応 / protocolは無視）
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            data-testid="pattern-input"
            onChange={event => setPatternInput(event.currentTarget.value)}
            placeholder="example.com/path*"
            style={{ flex: 1, minWidth: 0 }}
            type="text"
            value={patternInput}
          />
          <button data-testid="pattern-add" onClick={() => void addPattern()} type="button">
            追加
          </button>
        </div>

        <ul style={{ margin: 0, paddingLeft: 16, display: 'grid', gap: 6 }}>
          {patterns.map(pattern => (
            <li key={pattern}>
              <code>{pattern}</code>{' '}
              <button
                data-pattern-remove={pattern}
                onClick={() => {
                  void removePattern(pattern);
                }}
                type="button"
              >
                削除
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
