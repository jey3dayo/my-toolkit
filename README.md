# My Browser Utils

個人用のブラウザユーティリティChrome拡張機能

## 機能

### 1. テーブルソート機能

- ✅ Webページ上のテーブルをクリックでソート
- ✅ 数値・文字列の自動判定
- ✅ 昇順・降順の切り替え
- ✅ **ドメインパターン登録で自動有効化**
- ✅ **動的に追加されるテーブルも自動検知（MutationObserver）**

### 2. AI連携（開発中）

- 範囲選択したテキストをAIで処理
- 右クリックメニューから実行

## インストール方法

1. Chrome で `chrome://extensions/` を開く
2. 「デベロッパーモード」を有効化
3. 依存関係をインストールしてビルドする
   - `pnpm install`
   - `pnpm run build`（`dist/` を生成）
4. 「パッケージ化されていない拡張機能を読み込む」をクリック
5. このフォルダ（`my-browser-utils`）を選択

## 使い方

### テーブルソート

#### 方法1: ドメインパターン登録（推奨）

1. 拡張機能アイコンをクリック
2. 「ドメインパターン登録」セクションでパターンを入力
   - 例: `*.moneyforward.com/bs/*`
   - 例: `example.com/path/*`
3. 「追加」ボタンをクリック
4. 登録したパターンのページを開くと自動的にソート有効化

#### 方法2: 手動有効化

1. 拡張機能アイコンをクリック
2. 「テーブルソート有効化」ボタンをクリック
3. ページ上のテーブルヘッダーをクリックしてソート

#### 方法3: グローバル自動有効化

設定で「自動でテーブルソートを有効化」をONにすると、すべてのサイトで自動有効化されます

### AI連携（開発中）

1. テキストを範囲選択
2. 右クリック
3. 「選択テキストをAIで処理」を選択

## プロジェクト構造

```
my-browser-utils/
├── .claude/
│   └── rules/          # 開発ルール（Claude Code用）
├── dist/               # tscの出力先（自動生成）
├── docs/               # プロジェクトドキュメント
│   └── icon-setup.md   # アイコン作成ガイド
├── icons/              # 拡張機能アイコン
├── images/             # ポップアップUI用画像
├── manifest.json       # 拡張機能マニフェスト
├── src/                # TypeScriptソース
│   ├── background.ts   # バックグラウンドスクリプト
│   ├── content.ts      # コンテンツスクリプト
│   └── popup.ts        # ポップアップロジック
├── content.css         # コンテンツスクリプト用スタイル
├── popup.html          # ポップアップUI
└── src/styles/         # ポップアップ/共通UIスタイル（Design Tokens）
    ├── base.css
    ├── layout.css
    ├── utilities.css
    └── tokens/
        ├── primitives.css
        ├── semantic.css
        └── components.css
```

## 開発

### 開発ルール

`.claude/rules/development.md` を参照してください。

### スタイル管理

Design Tokens とテーマ切り替えの方針は `docs/style-management.md` を参照してください。

### アイコン更新

詳細は `docs/icon-setup.md` を参照してください。

```bash
# 透過アイコン生成（ImageMagick必要）
magick images/logo.png -fuzz 10% -transparent white -resize 16x16 icons/icon16.png
magick images/logo.png -fuzz 10% -transparent white -resize 48x48 icons/icon48.png
magick images/logo.png -fuzz 10% -transparent white -resize 128x128 icons/icon128.png
```

### 拡張機能のリロード

Chrome拡張機能ページ（`chrome://extensions/`）で「更新」ボタンをクリック

### ビルド

```bash
pnpm install
pnpm run build   # dist/ にコンパイル
# 開発時の監視
pnpm run watch
```

## TODO

- [ ] AI API連携の実装
- [ ] テスト自動化
- [ ] Chromeウェブストア公開準備
