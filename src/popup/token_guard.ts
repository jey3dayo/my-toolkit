import { Result } from '@praha/byethrow';

type LocalStorageData = {
  openaiApiToken?: string;
};

export type TokenGuardDeps = {
  storageLocalGet: (keys: string[]) => Promise<unknown>;
  showNotification: (message: string, type?: 'info' | 'error') => void;
  navigateToPane: (paneId: string) => void;
  focusTokenInput: () => void;
};

export type EnsureOpenAiTokenConfiguredError = 'missing-token' | 'storage-error';

export async function ensureOpenAiTokenConfigured(
  deps: TokenGuardDeps,
): Result.ResultAsync<void, EnsureOpenAiTokenConfiguredError> {
  const tokenResult = Result.pipe(
    Result.try({
      immediate: true,
      try: () => deps.storageLocalGet(['openaiApiToken']),
      catch: () => 'storage-error' as const,
    }),
    Result.map(data => (data as LocalStorageData).openaiApiToken ?? ''),
    Result.andThen(token => (token.trim() ? Result.succeed() : Result.fail('missing-token' as const))),
  );

  const tokenConfigured = await tokenResult;

  if (Result.isSuccess(tokenConfigured)) {
    return tokenConfigured;
  }

  deps.showNotification('OpenAI API Tokenが未設定です。「設定」タブで保存してください。', 'error');
  deps.navigateToPane('pane-settings');
  deps.focusTokenInput();
  return tokenConfigured;
}
