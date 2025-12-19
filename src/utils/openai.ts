import { Result } from "@praha/byethrow";
import { toErrorMessage } from "@/utils/errors";

export function extractChatCompletionText(json: unknown): string | null {
  if (typeof json !== "object" || json === null) {
    return null;
  }
  const choices = (json as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return null;
  }
  const first = choices[0] as { message?: { content?: unknown } };
  const content = first?.message?.content;
  if (typeof content !== "string") {
    return null;
  }
  return content.trim();
}

export function extractOpenAiApiErrorMessage(
  json: unknown,
  status: number
): string {
  if (
    typeof json === "object" &&
    json !== null &&
    "error" in json &&
    typeof (json as { error?: unknown }).error === "object" &&
    (json as { error: { message?: unknown } }).error !== null &&
    typeof (json as { error: { message?: unknown } }).error.message === "string"
  ) {
    return (json as { error: { message: string } }).error.message;
  }
  return `OpenAI APIエラー: ${status}`;
}

export function fetchOpenAiChatCompletionText(
  fetchFn: typeof fetch,
  token: string,
  body: unknown,
  emptyContentMessage: string
): Result.ResultAsync<string, string> {
  return Result.pipe(
    Result.try({
      immediate: true,
      try: () =>
        fetchFn("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }),
      catch: (error) =>
        toErrorMessage(error, "OpenAI APIへのリクエストに失敗しました"),
    }),
    Result.andThen(async (response) => {
      const json = await Result.unwrap(
        Result.try({
          immediate: true,
          try: () => response.json(),
          catch: () => null,
        }),
        null
      );

      if (!response.ok) {
        return Result.fail(extractOpenAiApiErrorMessage(json, response.status));
      }

      const text = extractChatCompletionText(json);
      if (!text) {
        return Result.fail(emptyContentMessage);
      }
      return Result.succeed(text);
    })
  );
}

export function fetchOpenAiChatCompletionOk(
  fetchFn: typeof fetch,
  token: string,
  body: unknown
): Result.ResultAsync<void, string> {
  return Result.pipe(
    Result.try({
      immediate: true,
      try: () =>
        fetchFn("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }),
      catch: (error) =>
        toErrorMessage(error, "OpenAI APIへのリクエストに失敗しました"),
    }),
    Result.andThen(async (response) => {
      if (response.ok) {
        return Result.succeed();
      }

      const json = await Result.unwrap(
        Result.try({
          immediate: true,
          try: () => response.json(),
          catch: () => null,
        }),
        null
      );

      return Result.fail(extractOpenAiApiErrorMessage(json, response.status));
    })
  );
}
