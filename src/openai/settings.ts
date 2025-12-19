import { Result } from "@praha/byethrow";
import type { LocalStorageData } from "@/storage/types";
import { toErrorMessage } from "@/utils/errors";

export const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
export const OPENAI_MODEL_OPTIONS = [DEFAULT_OPENAI_MODEL, "gpt-4o"] as const;

export type OpenAiModelOption = (typeof OPENAI_MODEL_OPTIONS)[number];

export type OpenAiSettings = {
  token: string;
  customPrompt: string;
  model: string;
};

export function normalizeOpenAiModel(value: unknown): string {
  if (typeof value !== "string") {
    return DEFAULT_OPENAI_MODEL;
  }
  const model = value.trim();
  return model || DEFAULT_OPENAI_MODEL;
}

export function loadOpenAiSettings(
  storageLocalGet: (
    keys: (keyof LocalStorageData)[]
  ) => Promise<Partial<LocalStorageData>>
): Result.ResultAsync<OpenAiSettings, string> {
  return Result.pipe(
    Result.try({
      immediate: true,
      try: () =>
        storageLocalGet([
          "openaiApiToken",
          "openaiCustomPrompt",
          "openaiModel",
        ]),
      catch: (error) =>
        toErrorMessage(error, "OpenAI設定の読み込みに失敗しました"),
    }),
    Result.map((data) => ({
      token: data.openaiApiToken?.trim() ?? "",
      customPrompt: data.openaiCustomPrompt?.trim() ?? "",
      model: normalizeOpenAiModel(data.openaiModel),
    })),
    Result.andThen((settings) =>
      settings.token
        ? Result.succeed(settings)
        : Result.fail(
            "OpenAI API Tokenが未設定です（ポップアップの「設定」タブで設定してください）"
          )
    )
  );
}

export async function loadOpenAiModel(
  storageLocalGet: (
    keys: (keyof LocalStorageData)[]
  ) => Promise<Partial<LocalStorageData>>
): Promise<string> {
  try {
    const data = await storageLocalGet(["openaiModel"]);
    return normalizeOpenAiModel(data.openaiModel);
  } catch {
    return DEFAULT_OPENAI_MODEL;
  }
}
