import type { Theme } from '../ui/theme';

export type LocalStorageData = {
  openaiApiToken?: string;
  openaiCustomPrompt?: string;
  openaiModel?: string;
  theme?: Theme;
};
