export type ContextActionKind = "text" | "event";

export type ContextAction = {
  id: string;
  title: string;
  kind: ContextActionKind;
  prompt: string;
};

export const DEFAULT_CONTEXT_ACTIONS: ContextAction[] = [
  {
    id: "builtin:summarize",
    title: "要約",
    kind: "text",
    prompt: [
      "次のテキストを日本語で要約してください。",
      "",
      "要件:",
      "- 重要ポイントを箇条書き(3〜7個)",
      "- 最後に一文で結論/要約",
      "- 事実と推測を混同しない",
      "",
      "{{text}}",
    ].join("\n"),
  },
  {
    id: "builtin:translate-ja",
    title: "日本語に翻訳",
    kind: "text",
    prompt: [
      "次のテキストを自然な日本語に翻訳してください。",
      "",
      "{{text}}",
    ].join("\n"),
  },
  {
    id: "builtin:calendar",
    title: "カレンダー登録する",
    kind: "event",
    prompt: "",
  },
];

function coerceContextAction(value: unknown): ContextAction | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const raw = value as Partial<ContextAction>;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  let kind: ContextActionKind | null = null;
  if (raw.kind === "event") {
    kind = "event";
  } else if (raw.kind === "text") {
    kind = "text";
  }
  const prompt = typeof raw.prompt === "string" ? raw.prompt : "";
  if (!(id && title && kind)) {
    return null;
  }
  return { id, title, kind, prompt };
}

export function normalizeContextActions(value: unknown): ContextAction[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const actions: ContextAction[] = [];
  for (const item of value) {
    const action = coerceContextAction(item);
    if (!action) {
      continue;
    }
    actions.push(action);
  }
  return actions;
}
