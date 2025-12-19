import { Result } from "@praha/byethrow";
import type { LocalStorageData } from "@/storage/types";

export type TokenGuardDeps = {
  storageLocalGet: (
    keys: (keyof LocalStorageData)[]
  ) => Result.ResultAsync<Partial<LocalStorageData>, string>;
  showNotification: (message: string, type?: "info" | "error") => void;
  navigateToPane: (paneId: string) => void;
  focusTokenInput: () => void;
};

export type EnsureOpenAiTokenConfiguredError =
  | "missing-token"
  | "storage-error";

export async function ensureOpenAiTokenConfigured(
  deps: TokenGuardDeps
): Result.ResultAsync<void, EnsureOpenAiTokenConfiguredError> {
  let loaded: Result.Result<Partial<LocalStorageData>, string>;
  try {
    loaded = await deps.storageLocalGet(["openaiApiToken"]);
  } catch {
    deps.showNotification("OpenAI設定の読み込みに失敗しました。", "error");
    deps.navigateToPane("pane-settings");
    deps.focusTokenInput();
    return Result.fail("storage-error");
  }
  if (Result.isFailure(loaded)) {
    deps.showNotification("OpenAI設定の読み込みに失敗しました。", "error");
    deps.navigateToPane("pane-settings");
    deps.focusTokenInput();
    return Result.fail("storage-error");
  }

  const token = loaded.value.openaiApiToken ?? "";
  const tokenConfigured = token.trim()
    ? Result.succeed()
    : Result.fail("missing-token" as const);

  if (Result.isFailure(tokenConfigured)) {
    deps.showNotification(
      "OpenAI API Tokenが未設定です。「設定」タブで保存してください。",
      "error"
    );
    deps.navigateToPane("pane-settings");
    deps.focusTokenInput();
  }

  return tokenConfigured;
}
