import { parse } from "smol-toml";
import promptToml from "@/context_action_prompts.toml";

function getTomlString(source: string, key: string): string {
  const parsed = parse(source) as Record<string, unknown>;
  const value = parsed[key];
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(/\r\n?/g, "\n");
}

export const CODE_REVIEW_PROMPT = getTomlString(
  promptToml,
  "code_review_prompt"
);
