import { Result } from "@praha/byethrow";
import { describe, expect, it, vi } from "vitest";
import { ensureOpenAiTokenConfigured } from "@/popup/token_guard";

describe("ensureOpenAiTokenConfigured", () => {
  it("returns Success when token exists", async () => {
    const storageLocalGet = vi.fn(() =>
      Promise.resolve({ openaiApiToken: "sk-test" })
    );
    const showNotification = vi.fn();
    const navigateToPane = vi.fn();
    const focusTokenInput = vi.fn();

    const result = await ensureOpenAiTokenConfigured({
      storageLocalGet,
      showNotification,
      navigateToPane,
      focusTokenInput,
    });
    expect(Result.isSuccess(result)).toBe(true);

    expect(showNotification).not.toHaveBeenCalled();
    expect(navigateToPane).not.toHaveBeenCalled();
    expect(focusTokenInput).not.toHaveBeenCalled();
  });

  it("navigates to settings and focuses when token missing", async () => {
    const storageLocalGet = vi.fn(() =>
      Promise.resolve({ openaiApiToken: "" })
    );
    const showNotification = vi.fn();
    const navigateToPane = vi.fn();
    const focusTokenInput = vi.fn();

    const result = await ensureOpenAiTokenConfigured({
      storageLocalGet,
      showNotification,
      navigateToPane,
      focusTokenInput,
    });
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(result.error).toBe("missing-token");
    }

    expect(showNotification).toHaveBeenCalledWith(
      "OpenAI API Tokenが未設定です。「設定」タブで保存してください。",
      "error"
    );
    expect(navigateToPane).toHaveBeenCalledWith("pane-settings");
    expect(focusTokenInput).toHaveBeenCalled();
  });

  it("treats storage errors as missing token", async () => {
    const storageLocalGet = vi.fn(() =>
      Promise.reject(new Error("storage failed"))
    );
    const showNotification = vi.fn();
    const navigateToPane = vi.fn();
    const focusTokenInput = vi.fn();

    const result = await ensureOpenAiTokenConfigured({
      storageLocalGet,
      showNotification,
      navigateToPane,
      focusTokenInput,
    });
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(result.error).toBe("storage-error");
    }

    expect(showNotification).toHaveBeenCalled();
    expect(navigateToPane).toHaveBeenCalledWith("pane-settings");
    expect(focusTokenInput).toHaveBeenCalled();
  });
});
