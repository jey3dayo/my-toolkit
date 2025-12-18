# Chrome拡張機能 開発ルール

このプロジェクトの開発における基本ルールとガイドラインです。

## 🏗️ プロジェクト構造

```
my-browser-utils/
├── .claude/
│   └── rules/          # 開発ルール（このディレクトリ）
├── dist/               # ビルド出力（自動生成）
├── docs/               # プロジェクトドキュメント
├── icons/              # 拡張機能アイコン（manifest.json用）
├── images/             # ポップアップUI用画像
├── manifest.json       # 拡張機能マニフェスト
├── content.css         # コンテンツスクリプト用スタイル
├── popup.html          # ポップアップUI
├── popup_bootstrap.js  # popup読み込み（dist未生成時のガード含む）
└── src/                # TypeScriptソース
    ├── background.ts
    ├── content.ts
    ├── popup.ts
    └── styles/         # ポップアップ/共通UIスタイル（Design Tokens）
        ├── base.css
        ├── layout.css
        ├── utilities.css
        └── tokens/
            ├── primitives.css
            ├── semantic.css
            └── components.css
```

## 📝 コーディング規約

### JavaScript

- **ES6+構文を使用**: `const`/`let`、アロー関数、テンプレート文字列
- **async/await推奨**: Promiseベースの非同期処理
- **エラーハンドリング必須**: try-catchで適切にエラーをキャッチ
- **コメント**: JSDocスタイルで関数の説明を記述

```javascript
/**
 * 関数の説明
 * @param {type} paramName - パラメータの説明
 * @returns {type} - 戻り値の説明
 */
function example(paramName) {
  // 実装
}
```

### HTML/CSS

- **セマンティックHTML**: 適切なタグを使用（div乱用を避ける）
- **BEM記法推奨**: クラス名は `.block__element--modifier` 形式
- **レスポンシブ**: ポップアップは固定幅320px
- **アクセシビリティ**: alt属性、aria属性を適切に設定

## 🎨 デザインガイドライン

### カラーパレット

- **プライマリ**: `#4285f4` (Google Blue)
- **エラー**: `#e53935` (赤)
- **テキスト**: `#333` (濃いグレー)
- **背景**: `#ffffff` (白)、`#f9f9f9` (薄いグレー)

### タイポグラフィ

- **フォント**: システムフォント (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto`)
- **見出し**: 18px (h1), 14px (h2), 13px (h3)
- **本文**: 14px
- **小文字**: 12px (ヒント、補足情報)

## 🔒 セキュリティガイドライン

### XSS対策

- **ユーザー入力のエスケープ必須**: DOMに挿入する前に必ず処理
- **innerHTML禁止**: textContentまたはcreateElementを使用
- **escapeHtml関数を活用**: 既存のユーティリティを使用

```javascript
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
```

### バリデーション

- **入力検証**: 長さ、文字種、形式をチェック
- **ホワイトリスト方式**: 許可する文字のみを受け入れる
- **エラーメッセージ**: ユーザーフレンドリーな表示

### ストレージ

- **chrome.storage.sync**: ユーザー設定（最大8KB）
- **chrome.storage.local**: 一時データ
- **機密情報保存禁止**: パスワード、トークンなどは保存しない

## 🧪 テスト方針

### 手動テスト必須項目

1. **パターン登録・削除**: 正常系、異常系（重複、上限）
2. **URLマッチング**: ワイルドカード、プロトコル
3. **MutationObserver**: 動的テーブル追加
4. **既存機能**: 手動ボタン、グローバルフラグ
5. **ブラウザ互換性**: Chrome最新版で動作確認

### テストページ推奨

- [HTML Table Generator](https://www.tablesgenerator.com/html_tables)でテスト用テーブルを作成
- 動的追加テスト用のHTMLページを用意

## 📦 リリースフロー

### バージョニング

セマンティックバージョニング（SemVer）に従う:

- **MAJOR**: 破壊的変更
- **MINOR**: 新機能追加（後方互換性あり）
- **PATCH**: バグ修正

### リリース前チェックリスト

- [ ] すべての機能が正常動作
- [ ] manifest.jsonのバージョン更新
- [ ] README.mdの更新
- [ ] 不要なconsole.logを削除
- [ ] アイコン・ロゴが正しく表示

## 🛠️ 開発Tips

### 拡張機能のリロード

```bash
# Chrome Extensions画面
chrome://extensions/

# 「更新」ボタンをクリック
# または Cmd+R（Mac）、Ctrl+R（Windows）
```

### デバッグ方法

- **ポップアップ**: 右クリック → 検証
- **コンテンツスクリプト**: ページの開発者ツール → Consoleタブ
- **バックグラウンド**: 拡張機能管理 → 「Service Workerを検証」

### よくあるエラー

#### "Could not load icon"

→ `icons/` ディレクトリにアイコンファイルが存在するか確認

#### "Extension context invalidated"

→ 拡張機能がリロードされた。ページを再読み込み

#### chrome.storage is undefined

→ manifest.jsonに `"storage"` パーミッションがあるか確認

## 🔄 アセット更新

### アイコン更新

詳細は `docs/icon-setup.md` を参照

```bash
# 透過アイコン生成
magick images/logo.png -fuzz 10% -transparent white -resize 16x16 icons/icon16.png
magick images/logo.png -fuzz 10% -transparent white -resize 48x48 icons/icon48.png
magick images/logo.png -fuzz 10% -transparent white -resize 128x128 icons/icon128.png
```

## 📚 参考リンク

- [Chrome Extension Manifest V3](https://developer.chrome.com/docs/extensions/mv3/)
- [Chrome Extension APIs](https://developer.chrome.com/docs/extensions/reference/)
- [Web Accessible Resources](https://developer.chrome.com/docs/extensions/mv3/manifest/web_accessible_resources/)

## 📝 変更履歴

### 2024-12-11

- 初版作成
- 基本的な開発ルールとガイドラインを定義
