import { Result } from "@praha/byethrow";
import { describe, expect, it, vi } from "vitest";
import {
  extractChatCompletionText,
  extractOpenAiApiErrorMessage,
  fetchOpenAiChatCompletionOk,
  fetchOpenAiChatCompletionText,
} from "@/utils/openai";

describe("extractChatCompletionText", () => {
  it("returns trimmed content", () => {
    expect(
      extractChatCompletionText({
        choices: [{ message: { content: "  hello  " } }],
      })
    ).toBe("hello");
  });

  it("returns null when format is unexpected", () => {
    expect(extractChatCompletionText(null)).toBeNull();
    expect(extractChatCompletionText({})).toBeNull();
    expect(extractChatCompletionText({ choices: [] })).toBeNull();
    expect(
      extractChatCompletionText({ choices: [{ message: { content: 1 } }] })
    ).toBeNull();
  });
});

describe("extractOpenAiApiErrorMessage", () => {
  it("prefers API error message", () => {
    expect(
      extractOpenAiApiErrorMessage({ error: { message: "bad" } }, 401)
    ).toBe("bad");
  });

  it("falls back to status", () => {
    expect(extractOpenAiApiErrorMessage(null, 500)).toBe(
      "OpenAI APIエラー: 500"
    );
  });
});

describe("fetchOpenAiChatCompletionText", () => {
  it("returns Success when response has content", async () => {
    const fetchFn = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ choices: [{ message: { content: "ok" } }] }),
      } as unknown as Response)
    );

    const result = await fetchOpenAiChatCompletionText(
      fetchFn as unknown as typeof fetch,
      "token",
      { model: "x" },
      "empty"
    );
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(Result.isSuccess(result)).toBe(true);
    if (Result.isSuccess(result)) {
      expect(result.value).toBe("ok");
    }
  });

  it("returns Failure when content is missing", async () => {
    const fetchFn = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ choices: [{ message: {} }] }),
      } as unknown as Response)
    );

    const result = await fetchOpenAiChatCompletionText(
      fetchFn as unknown as typeof fetch,
      "token",
      { model: "x" },
      "empty"
    );
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(result.error).toBe("empty");
    }
  });

  it("returns Failure with API message when response not ok", async () => {
    const fetchFn = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: { message: "invalid token" } }),
      } as unknown as Response)
    );

    const result = await fetchOpenAiChatCompletionText(
      fetchFn as unknown as typeof fetch,
      "token",
      { model: "x" },
      "empty"
    );
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(result.error).toBe("invalid token");
    }
  });

  it("returns Failure with status when response JSON is not available", async () => {
    const fetchFn = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 503,
        json: () => Promise.reject(new Error("boom")),
      } as unknown as Response)
    );

    const result = await fetchOpenAiChatCompletionText(
      fetchFn as unknown as typeof fetch,
      "token",
      { model: "x" },
      "empty"
    );
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(result.error).toBe("OpenAI APIエラー: 503");
    }
  });

  it("returns Failure when fetch throws", async () => {
    const fetchFn = vi.fn(() => Promise.reject(new Error("network")));

    const result = await fetchOpenAiChatCompletionText(
      fetchFn as unknown as typeof fetch,
      "token",
      { model: "x" },
      "empty"
    );
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(result.error).toBe("network");
    }
  });
});

describe("fetchOpenAiChatCompletionOk", () => {
  it("returns Success on ok response", async () => {
    const fetchFn = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      } as unknown as Response)
    );

    const result = await fetchOpenAiChatCompletionOk(
      fetchFn as unknown as typeof fetch,
      "token",
      { model: "x" }
    );
    expect(Result.isSuccess(result)).toBe(true);
  });

  it("returns Failure on non-ok response", async () => {
    const fetchFn = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: { message: "bad request" } }),
      } as unknown as Response)
    );

    const result = await fetchOpenAiChatCompletionOk(
      fetchFn as unknown as typeof fetch,
      "token",
      { model: "x" }
    );
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(result.error).toBe("bad request");
    }
  });
});
