# Browser Toolkit

個人用のツールキット Chrome 拡張（Manifest V3）です。自分が欲しい機能（テーブルソート、AI問い合わせ、翻訳、レビューなど）を詰め込んだツール集です。

主な機能:

- テーブルをクリックでソート（動的に追加されるテーブルも対応）
- OpenAI を使った「Context Actions」（要約/翻訳/カレンダー抽出）をポップアップと右クリックから実行

## 機能

### テーブルソート

- `<th>` ヘッダーをクリックでソート（昇順/降順をトグル）
- 数値/文字列を自動判定
- 自動有効化:
  - すべてのサイトで有効化、または
  - URL パターンに一致するサイトだけ自動有効化（`*` ワイルドカード対応 / protocol は無視）
- `MutationObserver` で新しく挿入されたテーブルも自動検出

### Context Actions（OpenAI 連携）

- 実行方法:
  - ポップアップ → **アクション** タブ、または
  - 右クリック → **browser-utils** → アクション
- 組み込みアクション:
  - **要約**（日本語）
  - **日本語に翻訳**
  - **カレンダー登録する**（イベント抽出 → Google カレンダーリンク + `.ics`）
- カスタムアクション:
  - ポップアップで作成/編集/削除/リセット可能
  - テンプレ変数: `{{text}}` / `{{title}}` / `{{url}}` / `{{source}}`
- 結果表示:
  - ポップアップの出力パネル（コピー / カレンダーを開く / `.ics` ダウンロード）
  - 右クリック実行時はページ上にオーバーレイ表示（コピー / 固定 / ドラッグ / カレンダー / `.ics`）

詳細は `docs/context-actions.md` を参照してください。

## インストール（パッケージ化されていない拡張機能）

1. 依存関係インストール + ビルド:
   - `pnpm install`
   - `pnpm run build`（`dist/` を生成）
2. Chrome で `chrome://extensions/` を開く
3. **デベロッパーモード** を有効化
4. **パッケージ化されていない拡張機能を読み込む** をクリックし、`browser-toolkit` フォルダを選択

## 使い方

### テーブルソート

ポップアップ → **テーブルソート** タブ:

- **このタブで有効化**: 現在のタブで即時有効化
- **自動で有効化する**: 自動有効化の ON/OFF
- **URL パターン**: 例
  - `*.moneyforward.com/bs/*`
  - `example.com/path*`

### Context Actions

- ポップアップ（**アクション** タブ）から実行: 選択範囲 → 直近の選択キャッシュ（約30秒）→ ページ本文の順にフォールバックします
- 右クリックから実行: 右クリックメニュー → **Browser Toolkit** → アクション

## 設定

ポップアップ → **設定** タブ:

- OpenAI API Token（`chrome.storage.local` に保存。同期されません）
- モデルID（デフォルト `gpt-5.2`。プリセット選択 + 任意のモデルIDを入力可）
- 追加指示（任意。出力の口調やフォーマットの好みに）
- テーマ（ダーク/ライト。ポップアップと注入 UI に反映）

## 開発

### 必要要件

- Node `24.8.0`
- pnpm `10.26.0`
- `mise`（任意・推奨。ツールバージョンを揃えるため）

### セットアップ

1. `mise` を使う場合は `mise trust` でリポジトリを信頼します（シェル起動時のエラー回避）。
2. 依存関係をインストールします: `pnpm install`
3. ローカルで検証する場合はウォッチビルドまたは Storybook を起動します:
   - `pnpm run watch`（content script / popup のバンドルを watch）
   - `pnpm run storybook`（UI をブラウザで確認）
4. 準備ができたら `pnpm run build` を実行し、`dist/` を Chrome に読み込みます。

### コマンド

基本は `mise` タスクを使います:

- `mise run format`（Ultracite/Biome による自動整形）
- `mise run lint`（型チェック + Lint）
- `mise run test`（Vitest ユニットテスト）
- `mise run test:storybook`（Storybook/Vitest addon のテスト）
- `mise run build`（`dist/` へバンドル）
- `mise run ci`（format + lint + test + storybook test + build）

その他:

- `pnpm run watch`（bundle の watch）
- `pnpm run storybook`（`http://localhost:6006`）

## プロジェクト構成

```
browser-toolkit/
├── dist/                      # bundle 出力（生成物）
├── docs/                      # ドキュメント
│   ├── context-actions.md     # Context Actions ガイド
│   ├── icon-setup.md          # アイコン作成手順
│   └── style-management.md    # Design Tokens / テーマ
├── manifest.json              # 拡張機能マニフェスト（MV3）
├── popup.html                 # ポップアップのエントリ（popup_bootstrap.js 経由で dist/popup.js を読む）
├── src/
│   ├── background.ts          # service worker（コンテキストメニュー + OpenAI 呼び出し）
│   ├── content.ts             # content script（テーブルソート + オーバーレイ + 選択キャッシュ）
│   ├── popup.ts               # ポップアップ（React root）
│   ├── popup/                 # ポップアップ UI（React + Base UI）
│   ├── content/overlay/       # オーバーレイ UI（React + Base UI / Shadow DOM）
│   ├── openai/                # OpenAI 設定
│   └── ui/                    # 共通 UI（theme/styles/toast）
└── tests/                     # Vitest（jsdom + chrome stubs）
```

## プライバシー/セキュリティ

- OpenAI API Token は `chrome.storage.local` に保存（同期なし）
- URL パターン/アクション定義などの非機密設定は `chrome.storage.sync` に保存
- 選択テキストは安定動作のためローカルに短時間キャッシュされることがあります（fresh 判定は約30秒）
- OpenAI への送信は **Context Action を明示的に実行した場合のみ** 発生します

## ライセンス

ISC
