import { Result } from "@praha/byethrow";
import type { PopupRuntime, SummaryTarget } from "@/popup/runtime";
import { isRecord } from "@/utils/guards";

type ErrorHandler = (message: string) => void;

export function isSummaryTarget(value: unknown): value is SummaryTarget {
  if (!isRecord(value)) {
    return false;
  }
  const v = value as { text?: unknown; source?: unknown };
  if (typeof v.text !== "string") {
    return false;
  }
  if (v.source !== "selection" && v.source !== "page") {
    return false;
  }
  return true;
}

export async function fetchSummaryTargetForTab(params: {
  runtime: Pick<PopupRuntime, "sendMessageToTab">;
  tabId: number;
  onError: ErrorHandler;
}): Promise<SummaryTarget | null> {
  const targetResult = await params.runtime.sendMessageToTab<
    { action: "getSummaryTargetText" },
    SummaryTarget
  >(params.tabId, { action: "getSummaryTargetText" });
  if (Result.isFailure(targetResult)) {
    params.onError(targetResult.error);
    return null;
  }
  if (!isSummaryTarget(targetResult.value)) {
    params.onError("対象テキストの取得に失敗しました");
    return null;
  }
  return targetResult.value;
}

export async function fetchSummaryTargetForActiveTab(params: {
  runtime: Pick<PopupRuntime, "getActiveTabId" | "sendMessageToTab">;
  onError: ErrorHandler;
}): Promise<SummaryTarget | null> {
  const tabIdResult = await params.runtime.getActiveTabId();
  if (Result.isFailure(tabIdResult)) {
    params.onError(tabIdResult.error);
    return null;
  }
  if (tabIdResult.value === null) {
    params.onError("有効なタブが見つかりません");
    return null;
  }
  return await fetchSummaryTargetForTab({
    runtime: params.runtime,
    tabId: tabIdResult.value,
    onError: params.onError,
  });
}
