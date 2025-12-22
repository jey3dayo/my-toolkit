import { parse } from "smol-toml";
import promptToml from "@/prompts/context_actions.toml";

function getTomlString(source: string, key: string): string {
  const parsed = parse(source) as Record<string, unknown>;
  const value = parsed[key];
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(/\r\n?/g, "\n");
}

export const SUMMARIZE_PROMPT = getTomlString(promptToml, "summarize_prompt");
export const TRANSLATE_JA_PROMPT = getTomlString(
  promptToml,
  "translate_ja_prompt"
);
