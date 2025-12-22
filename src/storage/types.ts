import type { Theme } from "@/ui/theme";
import type { LinkFormat } from "@/utils/link_format";

export type CopyTitleLinkFailure = {
  occurredAt: number;
  tabId: number;
  pageTitle: string;
  pageUrl: string;
  text: string;
  error: string;
  format?: LinkFormat;
};

export type LocalStorageData = {
  openaiApiToken?: string;
  openaiCustomPrompt?: string;
  openaiModel?: string;
  theme?: Theme;
  lastCopyTitleLinkFailure?: CopyTitleLinkFailure;
};
