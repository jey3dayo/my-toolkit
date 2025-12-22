import promptToml from "@/context_action_prompts.toml";

function extractTomlMultilineString(source: string, key: string): string {
  const pattern = new RegExp(`${key}\\s*=\\s*"""([\\s\\S]*?)"""`, "m");
  const match = source.match(pattern);
  if (!match) {
    return "";
  }
  return match[1].replace(/\r\n?/g, "\n");
}

export const CODE_REVIEW_PROMPT = extractTomlMultilineString(
  promptToml,
  "code_review_prompt"
);
