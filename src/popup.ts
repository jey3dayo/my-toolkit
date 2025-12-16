(() => {
  type SyncStorageData = {
    domainPatterns?: string[];
    autoEnableSort?: boolean;
  };

  type LocalStorageData = {
    openaiApiToken?: string;
    openaiCustomPrompt?: string;
  };

  type EnableResponse = {
    success: boolean;
  };

  type NotificationType = "info" | "error";

  type PopupToContentMessage = {
    action: "enableTableSort";
  };

  type SummarySource = "selection" | "page";

  type PopupToBackgroundMessage = {
    action: "summarizeTab";
    tabId: number;
  };

  type PopupToBackgroundTestTokenMessage = {
    action: "testOpenAiToken";
    token?: string;
  };

  type SummarizeResponse =
    | { ok: true; summary: string; source: SummarySource }
    | { ok: false; error: string };

  type TestTokenResponse = { ok: true } | { ok: false; error: string };

  document.addEventListener("DOMContentLoaded", () => {
    void initializePopup();
  });

  async function initializePopup(): Promise<void> {
    const settings = (await chrome.storage.sync.get([
      "autoEnableSort",
    ])) as SyncStorageData;
    const autoEnableCheckbox = document.getElementById(
      "auto-enable-sort",
    ) as HTMLInputElement | null;
    const enableButton = document.getElementById(
      "enable-table-sort",
    ) as HTMLButtonElement | null;
    const addPatternButton = document.getElementById(
      "add-pattern",
    ) as HTMLButtonElement | null;
    const patternInput = document.getElementById(
      "pattern-input",
    ) as HTMLInputElement | null;
    const tokenInput = document.getElementById(
      "openai-token",
    ) as HTMLInputElement | null;
    const saveTokenButton = document.getElementById(
      "save-openai-token",
    ) as HTMLButtonElement | null;
    const clearTokenButton = document.getElementById(
      "clear-openai-token",
    ) as HTMLButtonElement | null;
    const toggleTokenVisibilityButton = document.getElementById(
      "toggle-openai-token-visibility",
    ) as HTMLButtonElement | null;
    const testTokenButton = document.getElementById(
      "test-openai-token",
    ) as HTMLButtonElement | null;
    const customPromptInput = document.getElementById(
      "openai-custom-prompt",
    ) as HTMLTextAreaElement | null;
    const saveCustomPromptButton = document.getElementById(
      "save-openai-custom-prompt",
    ) as HTMLButtonElement | null;
    const clearCustomPromptButton = document.getElementById(
      "clear-openai-custom-prompt",
    ) as HTMLButtonElement | null;
    const summarizeButton = document.getElementById(
      "summarize-tab",
    ) as HTMLButtonElement | null;
    const copySummaryButton = document.getElementById(
      "copy-summary",
    ) as HTMLButtonElement | null;
    const summaryOutput = document.getElementById(
      "summary-output",
    ) as HTMLTextAreaElement | null;
    const summarySourceChip = document.getElementById(
      "summary-source-chip",
    ) as HTMLSpanElement | null;

    if (autoEnableCheckbox) {
      autoEnableCheckbox.checked = settings.autoEnableSort ?? false;
      autoEnableCheckbox.addEventListener("change", (event) => {
        const target = event.target as HTMLInputElement;
        void chrome.storage.sync.set({ autoEnableSort: target.checked });
      });
    }

    await loadPatterns();
    await loadOpenAiCustomPrompt(customPromptInput);
    await loadOpenAiToken(tokenInput);
    setupNavigation();

    enableButton?.addEventListener("click", async () => {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tab?.id === undefined) {
        showNotification("有効なタブが見つかりません", "error");
        return;
      }

      const message: PopupToContentMessage = { action: "enableTableSort" };

      chrome.tabs.sendMessage(tab.id, message, (response?: EnableResponse) => {
        if (response?.success) {
          showNotification("テーブルソートを有効化しました");
        }
      });
    });

    addPatternButton?.addEventListener("click", () => {
      void handleAddPattern();
    });

    patternInput?.addEventListener("keypress", (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        void handleAddPattern();
      }
    });

    saveTokenButton?.addEventListener("click", () => {
      void handleSaveToken(tokenInput);
    });

    clearTokenButton?.addEventListener("click", () => {
      void handleClearToken(tokenInput);
    });

    toggleTokenVisibilityButton?.addEventListener("click", () => {
      if (!tokenInput) return;
      const nextType = tokenInput.type === "password" ? "text" : "password";
      tokenInput.type = nextType;
      toggleTokenVisibilityButton.textContent =
        nextType === "text" ? "非表示" : "表示";
    });

    testTokenButton?.addEventListener("click", async () => {
      if (testTokenButton) testTokenButton.disabled = true;
      showNotification("OpenAI API Tokenを確認中...");
      try {
        const token = tokenInput?.value.trim() ?? "";
        const response = await sendMessageToBackground<
          PopupToBackgroundTestTokenMessage,
          TestTokenResponse
        >({
          action: "testOpenAiToken",
          token: token || undefined,
        });

        if (!response.ok) {
          showNotification(response.error, "error");
          return;
        }

        showNotification("OK: トークンは有効です");
      } catch (error) {
        showNotification(
          error instanceof Error ? error.message : "トークン確認に失敗しました",
          "error",
        );
      } finally {
        if (testTokenButton) testTokenButton.disabled = false;
      }
    });

    saveCustomPromptButton?.addEventListener("click", () => {
      void handleSaveCustomPrompt(customPromptInput);
    });

    clearCustomPromptButton?.addEventListener("click", () => {
      void handleClearCustomPrompt(customPromptInput);
    });

    summarizeButton?.addEventListener("click", async () => {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tab?.id === undefined) {
        showNotification("有効なタブが見つかりません", "error");
        return;
      }

      if (summaryOutput) summaryOutput.value = "要約中...";
      if (copySummaryButton) copySummaryButton.disabled = true;
      if (summarySourceChip) summarySourceChip.textContent = "-";
      if (summarizeButton) summarizeButton.disabled = true;

      try {
        const response = await sendMessageToBackground<
          PopupToBackgroundMessage,
          SummarizeResponse
        >({
          action: "summarizeTab",
          tabId: tab.id,
        });

        if (!response.ok) {
          showNotification(response.error, "error");
          if (summaryOutput) summaryOutput.value = "";
          return;
        }

        if (summaryOutput) summaryOutput.value = response.summary;
        if (copySummaryButton) copySummaryButton.disabled = false;
        if (summarySourceChip) {
          summarySourceChip.textContent =
            response.source === "selection" ? "選択範囲" : "ページ本文";
        }
        showNotification("要約しました");
      } catch (error) {
        showNotification(
          error instanceof Error ? error.message : "要約に失敗しました",
          "error",
        );
        if (summaryOutput) summaryOutput.value = "";
      } finally {
        if (summarizeButton) summarizeButton.disabled = false;
      }
    });

    copySummaryButton?.addEventListener("click", async () => {
      const text = summaryOutput?.value ?? "";
      if (!text) return;
      await navigator.clipboard.writeText(text);
      showNotification("コピーしました");
    });
  }

  function showNotification(
    message: string,
    type: NotificationType = "info",
  ): void {
    const notification = document.createElement("div");
    notification.textContent = message;

    const bgColor = type === "error" ? "#e53935" : "#3ecf8e";

    notification.style.cssText = `
    position: fixed;
    top: 12px;
    right: 12px;
    background: ${bgColor};
    color: white;
    padding: 10px 14px;
    border-radius: 10px;
    font-size: 13px;
    z-index: 10000;
    box-shadow: 0 10px 24px rgba(0,0,0,0.2);
  `;
    document.body.appendChild(notification);

    window.setTimeout(() => notification.remove(), 2000);
  }

  function sendMessageToBackground<TRequest, TResponse>(
    message: TRequest,
  ): Promise<TResponse> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response: TResponse) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message));
          return;
        }
        resolve(response);
      });
    });
  }

  // ========================================
  // ドメインパターン管理機能
  // ========================================

  async function loadPatterns(): Promise<void> {
    const { domainPatterns = [] } = (await chrome.storage.sync.get([
      "domainPatterns",
    ])) as SyncStorageData;
    renderPatternList(domainPatterns);
  }

  function renderPatternList(patterns: string[]): void {
    const listContainer = document.getElementById(
      "pattern-list",
    ) as HTMLDivElement | null;

    if (!listContainer) return;

    if (patterns.length === 0) {
      listContainer.innerHTML =
        '<p class="empty-message">登録されたパターンはありません</p>';
      return;
    }

    listContainer.innerHTML = patterns
      .map(
        (pattern, index) => `
      <div class="pattern-item" data-index="${index}">
        <span class="pattern-text">${escapeHtml(pattern)}</span>
        <button class="btn-delete" data-index="${index}">削除</button>
      </div>
    `,
      )
      .join("");

    listContainer.querySelectorAll(".btn-delete").forEach((btn) => {
      const button = btn as HTMLButtonElement;
      button.addEventListener("click", handleDeletePattern);
    });
  }

  async function handleAddPattern(): Promise<void> {
    const input = document.getElementById(
      "pattern-input",
    ) as HTMLInputElement | null;
    const pattern = input?.value.trim() ?? "";

    if (!pattern) {
      showNotification("パターンを入力してください", "error");
      return;
    }

    if (!validatePattern(pattern)) {
      showNotification("無効なパターンです", "error");
      return;
    }

    const { domainPatterns = [] } = (await chrome.storage.sync.get([
      "domainPatterns",
    ])) as SyncStorageData;

    if (domainPatterns.includes(pattern)) {
      showNotification("このパターンは既に登録されています", "error");
      return;
    }

    if (domainPatterns.length >= 50) {
      showNotification("パターンは最大50個まで登録できます", "error");
      return;
    }

    try {
      domainPatterns.push(pattern);
      await chrome.storage.sync.set({ domainPatterns });

      if (input) {
        input.value = "";
      }
      renderPatternList(domainPatterns);
      showNotification("パターンを追加しました");
    } catch (error) {
      if (error instanceof Error && error.message.includes("QUOTA_BYTES")) {
        showNotification("ストレージ容量を超えました", "error");
      } else {
        showNotification("パターンの追加に失敗しました", "error");
      }
    }
  }

  async function handleDeletePattern(event: Event): Promise<void> {
    const target = event.target as HTMLButtonElement | null;
    const index = target?.dataset.index
      ? Number(target.dataset.index)
      : Number.NaN;

    if (Number.isNaN(index)) {
      showNotification("削除に失敗しました", "error");
      return;
    }

    const { domainPatterns = [] } = (await chrome.storage.sync.get([
      "domainPatterns",
    ])) as SyncStorageData;

    domainPatterns.splice(index, 1);
    await chrome.storage.sync.set({ domainPatterns });

    renderPatternList(domainPatterns);
    showNotification("パターンを削除しました");
  }

  function validatePattern(pattern: string): boolean {
    if (pattern.length === 0 || pattern.length > 200) return false;

    if (/\s/.test(pattern)) return false;

    if (!/^[a-zA-Z0-9.*\\-_/:]+$/.test(pattern)) return false;

    return true;
  }

  function escapeHtml(text: string): string {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function setupNavigation(): void {
    const navItems = Array.from(
      document.querySelectorAll<HTMLButtonElement>(".nav-item"),
    );
    const panes = Array.from(document.querySelectorAll<HTMLElement>(".pane"));
    const heroChip = document.getElementById("hero-chip") as HTMLSpanElement;
    const ctaPill = document.getElementById("cta-pill") as HTMLDivElement;

    const updateHero = (activeTargetId?: string): void => {
      if (!heroChip || !ctaPill) return;
      if (activeTargetId === "pane-summary") {
        heroChip.textContent = "AI要約";
        ctaPill.textContent = "すぐ要約";
        return;
      }
      if (activeTargetId === "pane-settings") {
        heroChip.textContent = "設定";
        ctaPill.textContent = "好みに調整";
        return;
      }

      heroChip.textContent = "テーブルソート";
      ctaPill.textContent = "ワンクリックで整列";
    };

    navItems.forEach((item) => {
      item.addEventListener("click", () => {
        navItems.forEach((nav) => nav.classList.remove("active"));
        panes.forEach((pane) => pane.classList.remove("active"));

        item.classList.add("active");
        const targetId = item.dataset.target;
        if (targetId) {
          document.getElementById(targetId)?.classList.add("active");
        }
        updateHero(targetId);
      });
    });

    const defaultActive = navItems.find((item) =>
      item.classList.contains("active"),
    )?.dataset.target;
    updateHero(defaultActive);
  }

  async function loadOpenAiToken(
    input: HTMLInputElement | null,
  ): Promise<void> {
    if (!input) return;
    const { openaiApiToken = "" } = (await chrome.storage.local.get([
      "openaiApiToken",
    ])) as LocalStorageData;
    input.value = openaiApiToken;
  }

  async function handleSaveToken(
    input: HTMLInputElement | null,
  ): Promise<void> {
    const token = input?.value.trim() ?? "";
    if (!token) {
      showNotification("トークンを入力してください", "error");
      return;
    }

    await chrome.storage.local.set({ openaiApiToken: token });
    showNotification("OpenAIトークンを保存しました");
  }

  async function handleClearToken(
    input: HTMLInputElement | null,
  ): Promise<void> {
    if (input) {
      input.value = "";
    }
    await chrome.storage.local.remove("openaiApiToken");
    showNotification("トークンをクリアしました");
  }

  async function loadOpenAiCustomPrompt(
    input: HTMLTextAreaElement | null,
  ): Promise<void> {
    if (!input) return;
    const { openaiCustomPrompt = "" } = (await chrome.storage.local.get([
      "openaiCustomPrompt",
    ])) as LocalStorageData;
    input.value = openaiCustomPrompt;
  }

  async function handleSaveCustomPrompt(
    input: HTMLTextAreaElement | null,
  ): Promise<void> {
    const prompt = input?.value ?? "";
    await chrome.storage.local.set({ openaiCustomPrompt: prompt });
    showNotification("カスタムプロンプトを保存しました");
  }

  async function handleClearCustomPrompt(
    input: HTMLTextAreaElement | null,
  ): Promise<void> {
    if (input) input.value = "";
    await chrome.storage.local.remove("openaiCustomPrompt");
    showNotification("カスタムプロンプトをクリアしました");
  }
})();
