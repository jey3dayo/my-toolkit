type LocalStorageData = {
  openaiApiToken?: string;
};

export type TokenGuardDeps = {
  storageLocalGet: (keys: string[]) => Promise<unknown>;
  showNotification: (message: string, type?: 'info' | 'error') => void;
  navigateToPane: (paneId: string) => void;
  focusTokenInput: () => void;
};

export async function ensureOpenAiTokenConfigured(deps: TokenGuardDeps): Promise<boolean> {
  try {
    const { openaiApiToken = '' } = (await deps.storageLocalGet(['openaiApiToken'])) as LocalStorageData;
    if (openaiApiToken.trim()) return true;
  } catch {
    // ignore and handle as missing token
  }

  deps.showNotification('OpenAI API Tokenが未設定です。「設定」タブで保存してください。', 'error');
  deps.navigateToPane('pane-settings');
  deps.focusTokenInput();
  return false;
}
