import { Result } from "@praha/byethrow";

export function safeParseJsonObject<T>(
  text: string
): Result.Result<T, "parse-error"> {
  const direct = Result.try({
    immediate: true,
    try: () => JSON.parse(text) as T,
    catch: () => "parse-error" as const,
  });

  if (Result.isSuccess(direct)) {
    return direct;
  }

  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return direct;
  }

  return Result.try({
    immediate: true,
    try: () => JSON.parse(trimmed.slice(start, end + 1)) as T,
    catch: () => "parse-error" as const,
  });
}
