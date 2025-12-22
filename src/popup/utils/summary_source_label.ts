export function coerceSummarySourceLabel(source: unknown): string {
  if (source === "selection") {
    return "選択範囲";
  }
  if (source === "page") {
    return "ページ本文";
  }
  return "-";
}
