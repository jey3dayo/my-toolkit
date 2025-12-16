// Background Service Worker

type SummarySource = "selection" | "page";

type SummaryTarget = {
  text: string;
  source: SummarySource;
  title?: string;
  url?: string;
};

type ContentScriptMessage =
  | { action: "showNotification"; message: string }
  | { action: "getSummaryTargetText" }
  | { action: "showSummaryOverlay"; summary: string; source: SummarySource };

type BackgroundRequest = { action: "summarizeTab"; tabId: number };

type BackgroundResponse =
  | { ok: true; summary: string; source: SummarySource }
  | { ok: false; error: string };

type LocalStorageData = {
  openaiApiToken?: string;
  openaiCustomPrompt?: string;
};

const CONTEXT_MENU_ID = "ai-summarize";

chrome.runtime.onInstalled.addListener(() => {
  console.log("My Browser Utils installed");

  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: CONTEXT_MENU_ID,
      title: "ページ/選択範囲を要約",
      contexts: ["page", "selection"],
    });
  });
});

chrome.contextMenus.onClicked.addListener(
  (info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab) => {
    if (info.menuItemId !== CONTEXT_MENU_ID) return;

    const tabId = tab?.id;
    if (tabId === undefined) {
      return;
    }

    void (async () => {
      await sendMessageToTab(tabId, {
        action: "showNotification",
        message: "要約中...",
      });

      const selection = info.selectionText?.trim() ?? "";
      const target: SummaryTarget = selection
        ? {
            text: selection,
            source: "selection",
            title: tab?.title,
            url: tab?.url,
          }
        : await sendMessageToTab(tabId, { action: "getSummaryTargetText" });

      const result = await summarizeWithOpenAI(target);
      if (!result.ok) {
        await sendMessageToTab(tabId, {
          action: "showNotification",
          message: result.error,
        });
        return;
      }

      await sendMessageToTab(tabId, {
        action: "showSummaryOverlay",
        summary: result.summary,
        source: result.source,
      });
    })();
  },
);

chrome.runtime.onMessage.addListener(
  (
    request:
      | BackgroundRequest
      | { action: "summarizeText"; target: SummaryTarget }
      | { action: "testOpenAiToken"; token?: string }
      | { action: "summarizeEvent"; target: SummaryTarget },
    _sender: chrome.runtime.MessageSender,
    sendResponse: (
      response?:
        | BackgroundResponse
        | { ok: true }
        | { ok: false; error: string }
        | {
            ok: true;
            event: ExtractedEvent;
            calendarUrl: string;
            eventText: string;
          },
    ) => void,
  ) => {
    if (request.action === "summarizeTab") {
      void (async () => {
        try {
          const target = await sendMessageToTab<
            ContentScriptMessage,
            SummaryTarget
          >(request.tabId, { action: "getSummaryTargetText" });

          const result = await summarizeWithOpenAI(target);
          sendResponse(result);
        } catch (error) {
          sendResponse({
            ok: false,
            error:
              error instanceof Error ? error.message : "要約に失敗しました",
          });
        }
      })();
      return true;
    }

    if (request.action === "summarizeText") {
      void (async () => {
        try {
          const result = await summarizeWithOpenAI(request.target);
          sendResponse(result);
        } catch (error) {
          sendResponse({
            ok: false,
            error:
              error instanceof Error ? error.message : "要約に失敗しました",
          });
        }
      })();
      return true;
    }

    if (request.action === "testOpenAiToken") {
      void (async () => {
        try {
          const result = await testOpenAiToken(request.token);
          sendResponse(result);
        } catch (error) {
          sendResponse({
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "トークン確認に失敗しました",
          });
        }
      })();
      return true;
    }

    if (request.action === "summarizeEvent") {
      void (async () => {
        try {
          const result = await extractEventWithOpenAI(request.target);
          if (!result.ok) {
            sendResponse(result);
            return;
          }

          const calendarUrl = buildGoogleCalendarUrl(result.event);
          if (!calendarUrl) {
            sendResponse({
              ok: false,
              error:
                "日時の解析に失敗しました（Googleカレンダーリンクを生成できません）",
            });
            return;
          }

          sendResponse({
            ok: true,
            event: result.event,
            calendarUrl,
            eventText: formatEventText(result.event),
          });
        } catch (error) {
          sendResponse({
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "イベント要約に失敗しました",
          });
        }
      })();
      return true;
    }

    return true;
  },
);

function sendMessageToTab<TRequest, TResponse>(
  tabId: number,
  message: TRequest,
): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response: TResponse) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(`このページでは実行できません（${err.message}）`));
        return;
      }
      resolve(response);
    });
  });
}

async function summarizeWithOpenAI(
  target: SummaryTarget,
): Promise<BackgroundResponse> {
  const { openaiApiToken, openaiCustomPrompt } =
    (await chrome.storage.local.get([
      "openaiApiToken",
      "openaiCustomPrompt",
    ])) as LocalStorageData;

  if (!openaiApiToken) {
    return {
      ok: false,
      error:
        "OpenAI API Tokenが未設定です（ポップアップの「設定」タブで設定してください）",
    };
  }

  const MAX_INPUT_CHARS = 20000;
  const rawText = target.text.trim();
  if (!rawText) {
    return { ok: false, error: "要約対象のテキストが見つかりませんでした" };
  }

  const clippedText =
    rawText.length > MAX_INPUT_CHARS
      ? `${rawText.slice(0, MAX_INPUT_CHARS)}\n\n(以下略)`
      : rawText;

  const meta =
    target.title || target.url
      ? `\n\n---\nタイトル: ${target.title ?? "-"}\nURL: ${target.url ?? "-"}`
      : "";

  const body = {
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: [
          "あなたは日本語の要約アシスタントです。入力テキストを読み、要点を短く整理して出力してください。",
          openaiCustomPrompt?.trim()
            ? `\n\nユーザーの追加指示:\n${openaiCustomPrompt.trim()}`
            : "",
        ]
          .join("")
          .trim(),
      },
      {
        role: "user",
        content: [
          "次のテキストを日本語で要約してください。",
          "",
          "要件:",
          "- 重要ポイントを箇条書き(3〜7個)",
          "- 最後に一文で結論/要約",
          "- 事実と推測を混同しない",
          "",
          clippedText + meta,
        ].join("\n"),
      },
    ],
  };

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiApiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof json === "object" &&
      json !== null &&
      "error" in json &&
      typeof (json as { error?: unknown }).error === "object" &&
      (json as { error: { message?: unknown } }).error !== null &&
      typeof (json as { error: { message?: unknown } }).error.message ===
        "string"
        ? (json as { error: { message: string } }).error.message
        : `OpenAI APIエラー: ${response.status}`;
    return { ok: false, error: message };
  }

  const summary = extractChatCompletionText(json);
  if (!summary) {
    return { ok: false, error: "要約結果の取得に失敗しました" };
  }

  return { ok: true, summary, source: target.source };
}

function extractChatCompletionText(json: unknown): string | null {
  if (typeof json !== "object" || json === null) return null;
  const choices = (json as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0] as { message?: { content?: unknown } };
  const content = first?.message?.content;
  if (typeof content !== "string") return null;
  return content.trim();
}

async function testOpenAiToken(
  tokenOverride?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { openaiApiToken } = (await chrome.storage.local.get([
    "openaiApiToken",
  ])) as LocalStorageData;

  const token = tokenOverride?.trim() || openaiApiToken?.trim() || "";
  if (!token) {
    return {
      ok: false,
      error:
        "OpenAI API Tokenが未設定です（ポップアップの「設定」タブで設定してください）",
    };
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      max_tokens: 5,
      temperature: 0,
      messages: [
        { role: "system", content: "You are a health check bot." },
        { role: "user", content: "Reply with OK." },
      ],
    }),
  });

  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof json === "object" &&
      json !== null &&
      "error" in json &&
      typeof (json as { error?: unknown }).error === "object" &&
      (json as { error: { message?: unknown } }).error !== null &&
      typeof (json as { error: { message?: unknown } }).error.message ===
        "string"
        ? (json as { error: { message: string } }).error.message
        : `OpenAI APIエラー: ${response.status}`;
    return { ok: false, error: message };
  }

  return { ok: true };
}

type ExtractedEvent = {
  title: string;
  start: string;
  end?: string;
  allDay?: boolean;
  location?: string;
  description?: string;
};

async function extractEventWithOpenAI(
  target: SummaryTarget,
): Promise<{ ok: true; event: ExtractedEvent } | { ok: false; error: string }> {
  const { openaiApiToken, openaiCustomPrompt } =
    (await chrome.storage.local.get([
      "openaiApiToken",
      "openaiCustomPrompt",
    ])) as LocalStorageData;

  if (!openaiApiToken) {
    return {
      ok: false,
      error:
        "OpenAI API Tokenが未設定です（ポップアップの「設定」タブで設定してください）",
    };
  }

  const rawText = target.text.trim();
  if (!rawText) {
    return { ok: false, error: "要約対象のテキストが見つかりませんでした" };
  }

  const MAX_INPUT_CHARS = 20000;
  const clippedText =
    rawText.length > MAX_INPUT_CHARS
      ? `${rawText.slice(0, MAX_INPUT_CHARS)}\n\n(以下略)`
      : rawText;

  const meta =
    target.title || target.url
      ? `\n\n---\nタイトル: ${target.title ?? "-"}\nURL: ${target.url ?? "-"}`
      : "";

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiApiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "あなたはイベント抽出アシスタントです。入力テキストから、カレンダー登録に必要な情報を抽出してください。",
            "出力は必ずJSONのみ。コードフェンス禁止。キーは title,start,end,allDay,location,description を使う。",
            "start/end はISO 8601 (例: 2025-01-31T19:00:00+09:00) を優先。日付しか不明な場合は YYYY-MM-DD でOK。",
            "end が不明なら省略可。allDay は終日なら true、それ以外は false または省略。",
            "description はイベントの概要を日本語で短くまとめる。",
            openaiCustomPrompt?.trim()
              ? `\n\nユーザーの追加指示（descriptionの文体に反映）:\n${openaiCustomPrompt.trim()}`
              : "",
          ]
            .join("\n")
            .trim(),
        },
        {
          role: "user",
          content: [
            "次のテキストからイベント情報を抽出し、JSONで返してください。",
            "",
            clippedText + meta,
          ].join("\n"),
        },
      ],
    }),
  });

  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof json === "object" &&
      json !== null &&
      "error" in json &&
      typeof (json as { error?: unknown }).error === "object" &&
      (json as { error: { message?: unknown } }).error !== null &&
      typeof (json as { error: { message?: unknown } }).error.message ===
        "string"
        ? (json as { error: { message: string } }).error.message
        : `OpenAI APIエラー: ${response.status}`;
    return { ok: false, error: message };
  }

  const content = extractChatCompletionText(json);
  if (!content)
    return { ok: false, error: "イベント要約結果の取得に失敗しました" };

  const event = safeParseJsonObject<ExtractedEvent>(content);
  if (
    !event ||
    typeof event.title !== "string" ||
    typeof event.start !== "string"
  ) {
    return { ok: false, error: "イベント情報の解析に失敗しました" };
  }

  return { ok: true, event: normalizeEvent(event) };
}

function safeParseJsonObject<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    const trimmed = text.trim();
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1)) as T;
    } catch {
      return null;
    }
  }
}

function normalizeEvent(event: ExtractedEvent): ExtractedEvent {
  const title = (event.title ?? "").trim() || "予定";
  const start = (event.start ?? "").trim();
  const end = event.end?.trim() || undefined;
  const location = event.location?.trim() || undefined;
  const description = event.description?.trim() || undefined;
  const allDay = event.allDay === true ? true : undefined;
  return { title, start, end, allDay, location, description };
}

function formatEventText(event: ExtractedEvent): string {
  const lines: string[] = [];
  lines.push(`タイトル: ${event.title}`);
  lines.push(`日時: ${event.start}${event.end ? ` 〜 ${event.end}` : ""}`);
  if (event.location) lines.push(`場所: ${event.location}`);
  if (event.description) {
    lines.push("");
    lines.push("概要:");
    lines.push(event.description);
  }
  return lines.join("\n");
}

function buildGoogleCalendarUrl(event: ExtractedEvent): string | null {
  const title = event.title?.trim() || "予定";
  const details = event.description?.trim() || "";
  const location = event.location?.trim() || "";

  const isDateOnly = (value: string): boolean =>
    /^\d{4}-\d{2}-\d{2}$/.test(value.trim());

  const toYyyyMmDd = (value: string): string => value.replace(/-/g, "");

  const toUtcDateTime = (date: Date): string => {
    const pad = (n: number): string => String(n).padStart(2, "0");
    return [
      date.getUTCFullYear(),
      pad(date.getUTCMonth() + 1),
      pad(date.getUTCDate()),
      "T",
      pad(date.getUTCHours()),
      pad(date.getUTCMinutes()),
      pad(date.getUTCSeconds()),
      "Z",
    ].join("");
  };

  let dates = "";
  const startRaw = event.start.trim();
  const endRaw = event.end?.trim() || "";

  if (event.allDay === true || isDateOnly(startRaw)) {
    const startDate = toYyyyMmDd(startRaw);
    if (startDate.length !== 8) return null;
    const endDate =
      endRaw && isDateOnly(endRaw)
        ? toYyyyMmDd(endRaw)
        : nextDateYyyyMmDd(startDate);
    dates = `${startDate}/${endDate}`;
  } else {
    const startDate = new Date(startRaw);
    if (Number.isNaN(startDate.getTime())) return null;
    const endDate = endRaw
      ? new Date(endRaw)
      : new Date(startDate.getTime() + 60 * 60 * 1000);
    if (Number.isNaN(endDate.getTime())) return null;
    dates = `${toUtcDateTime(startDate)}/${toUtcDateTime(endDate)}`;
  }

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates,
  });
  if (details) params.set("details", details);
  if (location) params.set("location", location);

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function nextDateYyyyMmDd(yyyymmdd: string): string {
  const y = Number(yyyymmdd.slice(0, 4));
  const m = Number(yyyymmdd.slice(4, 6)) - 1;
  const d = Number(yyyymmdd.slice(6, 8));
  const date = new Date(Date.UTC(y, m, d));
  date.setUTCDate(date.getUTCDate() + 1);
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
}
