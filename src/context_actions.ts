import { CODE_REVIEW_PROMPT } from "@/context_action_prompts";
import {
  SUMMARIZE_PROMPT,
  TRANSLATE_JA_PROMPT,
} from "@/prompts/context_actions";
import { isRecord } from "@/utils/guards";

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
    prompt: SUMMARIZE_PROMPT,
  },
  {
    id: "builtin:translate-ja",
    title: "日本語に翻訳",
    kind: "text",
    prompt: TRANSLATE_JA_PROMPT,
  },
  {
    id: "builtin:code-review",
    title: "コードレビュー",
    kind: "text",
    prompt: CODE_REVIEW_PROMPT,
  },
];

function coerceContextAction(value: unknown): ContextAction | null {
  if (!isRecord(value)) {
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
    if (action.id === "builtin:calendar") {
      continue;
    }
    actions.push(action);
  }
  return actions;
}
