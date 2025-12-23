import { describe, expect, it } from "vitest";
import { DEFAULT_CONTEXT_ACTIONS } from "@/context_actions";
import {
  CODE_REVIEW_PROMPT,
  SUMMARIZE_PROMPT,
  TRANSLATE_JA_PROMPT,
} from "@/prompts/context_actions";

describe("context action prompts", () => {
  it("loads code review prompt from TOML", () => {
    expect(CODE_REVIEW_PROMPT).toContain("Code Review Prompt");
    expect(CODE_REVIEW_PROMPT).toContain("{{text}}");
  });

  it("keeps summarize/translate prompts wired to defaults", () => {
    const summarize = DEFAULT_CONTEXT_ACTIONS.find(
      (action) => action.id === "builtin:summarize"
    );
    const translate = DEFAULT_CONTEXT_ACTIONS.find(
      (action) => action.id === "builtin:translate-ja"
    );
    expect(summarize?.prompt).toBe(SUMMARIZE_PROMPT);
    expect(translate?.prompt).toBe(TRANSLATE_JA_PROMPT);
  });
});
