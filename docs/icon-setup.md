# アイコン・ロゴセットアップガイド

このドキュメントは、Chrome拡張機能のアイコンとロゴを作成・更新する手順を記録しています。

## 📁 ディレクトリ構成

```
browser-toolkit/
├── icons/              # 拡張機能のアイコン（manifest.json用）
│   ├── icon16.png     # ツールバー用（16x16）
│   ├── icon48.png     # 拡張機能管理画面用（48x48）
│   └── icon128.png    # Chromeウェブストア用（128x128）
└── images/             # ポップアップUI用の画像
    └── logo.png       # ポップアップヘッダーロゴ（透過PNG）
```

## 🎨 ロゴから透過アイコンを作成する手順

### 前提条件

ImageMagick（v7以降）がインストールされていること：

```bash
# macOSの場合
brew install imagemagick

# バージョン確認
magick -version
```

### 手順1: 元ロゴの配置

1. 元となるロゴファイル（JPG/PNG）を用意
2. プロジェクトルートに配置（例: `logo-source.jpg`）

### 手順2: 白背景を透過処理

```bash
# 白背景を透過にしてPNGとして保存
magick logo-source.jpg -fuzz 10% -transparent white images/logo.png
```

**オプション説明:**

- `-fuzz 10%`: 白色の許容範囲（0-100%、値が大きいほど広範囲を透過）
- `-transparent white`: 白色を透過に変換

**注意点:**

- JPEGは透過をサポートしないため、必ずPNG形式で保存
- `-fuzz`の値は画像によって調整が必要（5-15%が一般的）

### 手順3: 各サイズのアイコンを生成

```bash
# 16x16アイコン
magick images/logo.png -fuzz 10% -transparent white -resize 16x16 icons/icon16.png

# 48x48アイコン
magick images/logo.png -fuzz 10% -transparent white -resize 48x48 icons/icon48.png

# 128x128アイコン
magick images/logo.png -fuzz 10% -transparent white -resize 128x128 icons/icon128.png
```

### 手順4: 生成されたファイルの確認

```bash
# ファイルサイズとフォーマットを確認
ls -lh icons/*.png images/logo.png

# 画像情報を詳細確認
file icons/icon16.png

# ImageMagickで詳細確認（透過チャンネル含む）
identify icons/icon16.png
# 出力例: icons/icon16.png PNG 16x16 16x16+0+0 8-bit sRGB 3329B
```

**確認ポイント:**

- ファイル形式がPNGであること
- 透過（RGBA）が含まれていること
- ファイルサイズが適切であること（16x16: 1-5KB、48x48: 5-10KB、128x128: 15-30KB）

## 🔄 アイコン更新フロー

既存のアイコンを更新する場合：

```bash
# バックアップ作成（推奨）
cp -r icons/ icons_backup/
cp -r images/ images_backup/

# 新しいロゴから再生成
magick new-logo.jpg -fuzz 10% -transparent white images/logo.png
magick images/logo.png -resize 16x16 icons/icon16.png
magick images/logo.png -resize 48x48 icons/icon48.png
magick images/logo.png -resize 128x128 icons/icon128.png

# Chrome拡張機能をリロード
# chrome://extensions/ で「更新」ボタンをクリック
```

## 🎯 トラブルシューティング

### 問題: 透過がうまくいかない

**原因**: `-fuzz`の値が不適切、または背景色が純白でない

**解決策**:

```bash
# fuzz値を調整（10% → 15%）
magick logo.jpg -fuzz 15% -transparent white output.png

# 特定のRGB値を指定
magick logo.jpg -fuzz 10% -transparent '#FFFFFF' output.png

# 背景色がグレーの場合
magick logo.jpg -fuzz 10% -transparent '#F0F0F0' output.png
```

### 問題: アイコンがぼやける

**原因**: リサイズアルゴリズムが適切でない

**解決策**:

```bash
# シャープなリサイズ（ランチョス法）
magick images/logo.png -filter Lanczos -resize 16x16 icons/icon16.png

# よりシャープに（アンシャープマスク適用）
magick images/logo.png -resize 16x16 -unsharp 0x1 icons/icon16.png
```

### 問題: ファイルサイズが大きすぎる

**原因**: PNG圧縮が不十分

**解決策**:

```bash
# 高圧縮で保存
magick images/logo.png -quality 95 -define png:compression-level=9 icons/icon16.png

# または、既存ファイルを最適化
optipng -o7 icons/*.png
```

## 📊 推奨サイズとフォーマット

| 用途               | サイズ  | フォーマット | 透過 | 備考                              |
| ------------------ | ------- | ------------ | ---- | --------------------------------- |
| ツールバーアイコン | 16x16   | PNG          | 必須 | Retinaディスプレイ用に32x32も推奨 |
| 拡張機能管理画面   | 48x48   | PNG          | 必須 | -                                 |
| Chromeウェブストア | 128x128 | PNG          | 必須 | ストア掲載時に使用                |
| ポップアップロゴ   | 任意    | PNG          | 推奨 | 横長推奨（例: 432x66）            |

## 🔗 参考リンク

- [Chrome拡張機能のアイコンガイドライン](https://developer.chrome.com/docs/extensions/mv3/manifest/icons/)
- [ImageMagick公式ドキュメント](https://imagemagick.org/index.php)
- [透過処理のベストプラクティス](https://imagemagick.org/Usage/masking/)

## 📝 履歴

- 2024-12-11: 初版作成
  - ImageMagickを使用した透過アイコン生成手順を記録
  - logo.jpg（1024x1024）から各サイズのアイコンを生成
