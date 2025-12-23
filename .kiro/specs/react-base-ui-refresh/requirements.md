# Requirements Document

## Project Description (Input)

あなたは Codex CLI（実装担当）です。リポジトリ `/Users/t00114/src/github.com/jey3dayo/browser-toolkit` を編集して、Chrome拡張の UI（Popup + content script overlay）を「新しめの Base UI」を使って React 実装にリプレイスし、全体を最新化してください。 個人開発なのでスピード優先でガツガツ行ってOKです（ただし壊さない/通すべきものは通す）。 あわせて、以下も必ず活用してください：

- mcp chrome-devtools（UIの実機検証・DOM/Style/Accessibility確認・挙動デバッグに使用）
- `~/.claude/plugins/frontend-design/skills/frontend-design/SKILL.md`（設計/実装ガイドとして参照し、推奨プラクティスに従う）

---

## 最初に確認（不明なら質問してから着手）

1. ここで言う「Base UI」はどれか？

- 原則として `@base-ui/react`（公式 Base UI）を採用すること。
- `@mui/base` は今回対象外（混同回避のため）。
- 公式ドキュメントに沿ってコンポーネント選定・実装すること。

2. 対象範囲

- Popup（`popup.html` + `popup.css` + `src/popup.ts` 周辺）を React + Base UI 化する。
- content script overlay（`src/content.ts` / `content.css`）も React + Base UI 化して最新化する。
- 既存の「レイアウト（配置・ペイン構成・主要サイズ・スクロール領域）」は維持する。
- 見た目（色/装飾/余白）は多少変わってよい。

---

## ゴール（Popup）

- 現在 `popup.html` + `popup.css` + `src/popup.ts` で動いている Popup（3ペイン: actions/table/settings、ドロワー/サイドバー、各ボタン/入力/保存/通知など）を、 React + Base UI コンポーネントで実装し直す。
- 既存の機能（ストレージ保存、アクション実行、コピー、カレンダー/ics、テーブルソート設定、OpenAI token設定/動作確認、カスタムプロンプト、通知、ナビゲーション）を壊さない。
- 既存ロジックは可能な限り再利用する（例: `src/popup/token_guard.ts` 等）。UI層のみ差し替える。

---

## ゴール（content script overlay）

- `src/content.ts` / `content.css` の overlay UI を React + Base UI で再実装し、最新化する。
- overlay の「レイアウト/配置意図」は維持する（ページ上の位置、主要サイズ、表示領域、操作導線）。
- 既存機能（表示/非表示、操作、コピー/通知等、現状 overlay が担っていること）を壊さない。
- ページCSS/DOMとの衝突を避け、他サイト上でも安定して動くようにする。

---

## 設計/実装方針（共通）

- UI は React 化し、状態/イベント/副作用を React の流儀で整理する。
- Base UI は「挙動/A11y が難しい部品」を優先して積極的に採用する： Tabs / Dialog(=Drawer相当) / Tooltip / Select / Menu / Popover など。
- mcp chrome-devtools を用いて、フォーカス遷移・キーボード操作・アクセシビリティツリー・DOM/Style を実機で確認する。
- 目的に直接関係ない大規模リファクタは避けるが、個人開発のスピード優先のため、 UI更新のために必要な範囲では大胆に更新してよい。

---

## Popup 実装方針

- Popup のエントリを React にする。 例: `src/popup/main.tsx` + `src/popup/App.tsx` 等。 `popup.html` は React の root 要素を置く形に更新する。
- レイアウト方針（重要）：
  - 3ペイン構成（actions/table/settings）、drawer/sidebar の配置、主要な幅/高さ/スクロール領域など “骨格レイアウト” は維持する。
  - 見た目（色/装飾/余白）は多少変わってよい。
- CSS方針（重要：popup.css の消し込みを優先）：
  - `popup.css` は可能なら大幅に削減する（消し込み優先）。
  - 残すのはレイアウト骨格に必要な最小限のみ（3ペイン・drawer・主要な幅/高さ/スクロール）。
  - ボタン/入力/選択UIなどの見た目は Base UI（＋必要最小限の共通CSSトークン）へ寄せる。
  - 既存クラス互換に固執せず、React構造に合わせて整理してよい（ただしレイアウトは維持）。
- Chrome拡張 Popup の制約を考慮する：
  - Popup はライフサイクルが短く、フォーカス管理がシビア。
  - Dialog/Popover/Tooltip 等の Portal 振る舞いが問題になる場合があるため、 Portal のマウント先やフォーカス/スクロールロックの挙動を Popup DOM 内で完結させる方針で調整する。

---

## content script 実装方針

- `src/content.ts` を React エントリに置き換える（例: `src/content/main.tsx` + `src/content/App.tsx`）。
- overlay はページCSSから隔離するため、原則 Shadow DOM にマウントする：
  - ページに root ホスト要素を 1 つ注入し、その Shadow root に React をマウントする。
  - スタイルは Shadow root 内に閉じる（ページ側へ漏らさない / ページから影響を受けにくくする）。
- idempotent にする：
  - 二重注入・二重マウントを防止するガードを必ず入れる（同一ページで複数回動かない）。
- Portal を伴う Base UI コンポーネント（Dialog/Popover/Tooltip 等）は、 マウント先が Shadow root 配下に収まるように調整する（`document.body` へ出さない）。
- `content.css` は消し込み優先：
  - 残すのは overlay の骨格レイアウトと最小トークンのみ。
  - 見た目は Base UI + 最小CSSで構成する。
- SPA 対策：
  - 必要に応じて MutationObserver / navigation（history）変化を考慮し、再注入/再初期化が安全に行えるようにする。
  - ただし過剰な監視は避け、性能と安定性のバランスを取る。

---

## ビルド/設定

- `pnpm` で依存追加し、esbuild bundling が TSX/React を扱えるように調整する。 例: `package.json` の `bundle`、`tsconfig.json` の `jsx`、必要なら `eslint.config.mjs` の対象拡張子追加。
- 既存の `popup_bootstrap.js` 等の読み込み経路・manifest との整合は壊さない。

---

## テスト方針

- `pnpm test`（vitest）は通す。
- DOM直操作前提のテストが壊れる場合、同等の振る舞いを React 実装に合わせてテストし直す（削除して終わりにしない）。
- 最低限、以下のふるまいを担保するテストを残す/整備する：
  - ストレージ読み書き（初期表示、保存後の反映）
  - token guard（未設定時の抑止と誘導）
  - 通知・コピーの成功/失敗ハンドリング
  - タブ遷移（3ペイン移動）と状態保持
  - overlay の二重注入防止（idempotent）

---

## lint/prettier/test 対象外の扱い

- `src/components/**` は原則として除外しない（プロダクトコード扱い）。
- もし Base UI が “ソースをチェックアウト/生成して取り込む” 方式で、外部由来コードをそのまま置く必要がある場合のみ、 `src/vendor/**` に入れて、そこだけ `.prettierignore` と `eslint.config.mjs` の `ignores` で除外する（`components/` ではなく vendor に隔離）。
- 既存の ignore（`dist/`, `node_modules/`）は維持。

---

## 受け入れ基準

- `pnpm run build` が成功する（`dist/popup.js` が生成され、`popup_bootstrap.js` 経由で読み込める）。
- `pnpm run lint` と `pnpm test` が成功する（必要ならテストを更新）。
- Chromeで拡張を読み込み直して Popup を開いたとき、以下が動作する：
  - 3ペインの移動（actions/table/settings）
  - 各フォーム、保存/クリア
  - 通知、コピー
  - token 未設定ガード等
- Chromeで任意のページを開いたとき、overlay が表示され、以下を満たす：
  - ページの既存UIを破壊しない（CSS衝突・スクロール・フォーカス・z-index の破綻がない）
  - SPA 遷移後も overlay が適切に再表示または維持される
  - overlay が二重注入/二重マウントされない

---

## 制約

- 目的に直接関係ないリファクタや大規模なレイアウト変更はしない（レイアウト骨格は維持）。
- ただし個人開発の最新化目的のため、見た目や CSS は積極的に整理してよい（popup.css/content.css は消し込み優先）。
- 実装中は mcp chrome-devtools での実機検証を行い、レイアウト維持と挙動（a11y/フォーカス/キーボード/Portal）を確認する。
- `~/.claude/plugins/frontend-design/skills/frontend-design/SKILL.md` を参照し、推奨パターン（設計・コンポーネント分割・スタイリング・a11y）に従う。

## Requirements

### 1. Feature Scope

**Acceptance Criteria (EARS)**

- The extension shall refresh the popup UI and the in-page overlay UI without removing existing user-facing capabilities.
- The extension shall preserve the existing information architecture of the popup (Actions, Table Sort, Settings) as the three top-level areas.
- The extension shall allow visual/style changes while preserving the existing layout intent (pane structure, primary sizing, and scrollable regions).
- The extension shall not introduce any new external backend service as part of this feature.

### 2. UI Technology Constraints (React + Base UI)

**Acceptance Criteria (EARS)**

- The popup UI shall be rendered using React.
- The in-page overlay UI shall be rendered using React.
- The UI component primitives for the refreshed React UI shall use `@base-ui/react` as the Base UI library.
- The extension shall not adopt `@mui/base` as part of this feature.
- When an interactive overlay component is used (e.g., dialog, popover, tooltip), the UI shall keep focus and scrolling behavior functional within its runtime surface (popup document or in-page overlay).

### 3. Popup Navigation and Pane Switching

**Acceptance Criteria (EARS)**

- When the user opens the popup, the popup shall present navigation controls that allow switching between Actions, Table Sort, and Settings.
- When the user activates a navigation item, the popup shall display the corresponding pane and shall mark it as active for assistive technologies.
- When the navigation drawer is open, and the user clicks the scrim, the popup shall close the drawer.
- When the navigation drawer is open, and the user presses the Escape key, the popup shall close the drawer.
- When the popup is opened with an existing pane identifier (e.g., via URL hash), the popup shall display the corresponding pane.

### 4. Popup: Run Context Actions and Display Results

**Acceptance Criteria (EARS)**

- When the popup loads, the popup shall load context actions from synced extension storage and shall render one action control per action.
- When the user triggers a context action, the extension shall request execution via the background service worker and shall not call the OpenAI API directly from the popup runtime.
- When an action execution succeeds with a text result, the popup shall display the result in a read-only output area and shall set the output title to the action title.
- When the action execution reports its input source (selection, recent selection, page text), the popup shall display a user-visible indicator of that source.
- When the user requests “Copy” for the action output, the popup shall write the output text to the clipboard and shall show a success notification.
- If the clipboard write fails, the popup shall show an error notification and shall keep the output unchanged.
- If the background response is missing or invalid, the popup shall not crash and shall present a safe fallback state (e.g., empty output and/or an error notification).
- The popup shall display the supported prompt template variables (`{{text}}`, `{{title}}`, `{{url}}`, `{{source}}`) to the user.

### 5. Popup: Create, Edit, and Reset Action Definitions

**Acceptance Criteria (EARS)**

- When the user saves an action definition (title, kind, prompt), the popup shall persist the action definition in synced extension storage and shall refresh the rendered actions list.
- When the user clears the action editor, the popup shall reset the editor inputs to their empty/default states.
- When the user resets actions, the popup shall restore the default built-in actions and shall persist them in synced extension storage.
- When the user deletes a saved action, the popup shall remove it from synced extension storage and shall remove it from the actions list.
- When an action is executed with a prompt that includes template variables, the extension shall resolve those variables using the current action input text and page metadata.

### 6. Popup: Table Sort Controls and URL Pattern Management

**Acceptance Criteria (EARS)**

- When the user clicks “Enable table sort” in the popup, the extension shall send a command to the active tab to enable click-to-sort behavior on tables on that page.
- When table sorting is enabled on a page, the content script shall allow sorting by clicking table header cells and shall support toggling ascending/descending order.
- When the user toggles “Auto enable sort,” the extension shall persist the preference in synced extension storage.
- When the user adds a URL pattern, the extension shall persist the pattern in synced extension storage and shall render it in the pattern list.
- When the user removes a URL pattern, the extension shall remove it from synced extension storage and shall remove it from the pattern list.
- When the extension matches URL patterns, the extension shall ignore the URL protocol and shall support `*` wildcards in patterns.

### 7. Popup: OpenAI Settings (Token + Custom Prompt)

**Acceptance Criteria (EARS)**

- When the user saves an OpenAI API token, the extension shall store the token in `chrome.storage.local` and shall not store the token in `chrome.storage.sync`.
- When the user clears the OpenAI API token, the extension shall remove the token from `chrome.storage.local`.
- When the user toggles token visibility, the popup shall change the token field display between masked and visible without changing the stored token value.
- When the user requests an OpenAI token test, the extension shall perform the test via the background service worker and shall show a success or error notification.
- When the user saves a custom prompt, the extension shall store the custom prompt in `chrome.storage.local`.
- When the user clears the custom prompt, the extension shall remove or blank the custom prompt in `chrome.storage.local`.
- When the user triggers an AI action and the OpenAI token is missing, the popup shall show an actionable error notification and shall navigate to the Settings pane and focus the token input.

### 8. In-page Overlay: Show Action Results

**Acceptance Criteria (EARS)**

- When the extension instructs the content script to show an action result, the content script shall render an in-page overlay that displays the result.
- When the shown result type is text, the overlay shall display the text result and shall provide a copy action.
- When the shown result type is event/calendar, the overlay shall display the event-related text and shall provide a Google Calendar handoff action when a calendar URL is available.
- When an `.ics` artifact is available for an event result, the overlay shall provide an `.ics` download action.
- When the user requests copy from the overlay, the overlay shall write the relevant text or URL to the clipboard and shall show a success notification.
- If the overlay clipboard write fails, the overlay shall show an error notification and shall remain usable.
- When the user dismisses the overlay, the content script shall remove the overlay from the page.
- When an overlay is shown for a selection-based action, and an anchor can be determined, the overlay shall appear near the selection anchor.
- When the user pins the overlay, the overlay shall remain visible until the user unpins or dismisses it.

### 9. In-page Overlay: Isolation and Compatibility on Arbitrary Sites

**Acceptance Criteria (EARS)**

- The overlay UI shall be visually isolated such that host-page CSS does not restyle overlay controls and overlay CSS does not leak into the host page.
- The overlay UI shall not interfere with host-page scrolling outside of the overlay UI.
- The overlay UI shall not block interaction with the host page outside of the overlay UI surface.
- The overlay UI shall maintain a stacking order that keeps it usable above typical page content without permanently obscuring essential page UI.
- When the extension is initialized multiple times on the same page, the content script shall ensure at most one overlay instance exists at any time.
- When the overlay uses interactive overlays (e.g., menus, popovers, tooltips), the overlay shall render them within the overlay UI subtree so they remain styled and positioned consistently.

### 10. SPA and Dynamic Page Robustness

**Acceptance Criteria (EARS)**

- When the host page performs SPA-style navigation, the extension shall continue to operate without requiring a full page reload.
- When table auto-enable is enabled, and new tables are inserted into the DOM after initial load, the content script shall enable sorting for those newly inserted tables.
- When URL patterns are configured, and the current page URL changes to match a configured pattern, the extension shall enable table sorting for that page.

### 11. Data, Privacy, and Runtime Boundaries

**Acceptance Criteria (EARS)**

- The extension shall store domain patterns, table-sort preferences, and action definitions in `chrome.storage.sync`.
- The extension shall store secrets (OpenAI API token) and device-local customizations (custom prompt) in `chrome.storage.local`.
- When the user triggers an AI action, the extension shall send text to the OpenAI API only as part of that explicit user-triggered action.
- When the user triggers an AI action, and a selection exists, the extension shall prefer the current selection as action input.
- When the user triggers an AI action, and no selection exists, and a recent-selection cache is available within the freshness window, the extension shall prefer the recent-selection cache as action input before falling back to page text.
- When the recent-selection cache is outside the freshness window, the extension shall treat it as stale and shall fall back to page text.
- When storage or message passing fails, the extension shall surface a user-visible notification rather than failing silently.

### 12. Quality Gates (Build, Lint, and Tests)

**Acceptance Criteria (EARS)**

- When `pnpm run build` is executed, the build shall succeed and shall generate extension-loadable bundled artifacts in `dist/`.
- When `pnpm run lint` is executed, linting shall succeed.
- When `pnpm test` is executed, all tests shall pass.
- When the extension is loaded in Chrome, opening the popup shall not produce runtime errors and shall allow switching between the three panes.
- When the extension is loaded in Chrome, triggering a context action shall produce a visible result (popup output and/or in-page overlay) without runtime errors.
- The test suite shall include automated checks for: popup pane navigation, token-guard behavior when the token is missing, and UI-triggered “copy to clipboard” error handling.
- The test suite shall include an automated check that verifies in-page overlay injection is idempotent (no double-mount behavior).

### 13. Accessibility and Keyboard Support

**Acceptance Criteria (EARS)**

- The popup UI shall be operable with keyboard-only interaction.
- When focus moves within the popup UI, the popup UI shall display a visible focus indicator.
- When a dialog/menu/popover is opened in the popup UI, the popup UI shall follow ARIA practices for focus management (move focus into the overlay, Escape to close, and return focus to the trigger).
- The in-page overlay UI shall expose appropriate accessible names/labels for primary actions (copy, open calendar, download `.ics`, dismiss).
- When the user navigates the overlay UI by keyboard, the overlay UI shall allow activating the primary actions without requiring a mouse.
