import { describe, expect, it, vi } from 'vitest';
import { ensureOpenAiTokenConfigured } from '../src/popup/token_guard';

describe('ensureOpenAiTokenConfigured', () => {
  it('returns true when token exists', async () => {
    const storageLocalGet = vi.fn(async () => ({ openaiApiToken: 'sk-test' }));
    const showNotification = vi.fn();
    const navigateToPane = vi.fn();
    const focusTokenInput = vi.fn();

    await expect(
      ensureOpenAiTokenConfigured({ storageLocalGet, showNotification, navigateToPane, focusTokenInput }),
    ).resolves.toBe(true);

    expect(showNotification).not.toHaveBeenCalled();
    expect(navigateToPane).not.toHaveBeenCalled();
    expect(focusTokenInput).not.toHaveBeenCalled();
  });

  it('navigates to settings and focuses when token missing', async () => {
    const storageLocalGet = vi.fn(async () => ({ openaiApiToken: '' }));
    const showNotification = vi.fn();
    const navigateToPane = vi.fn();
    const focusTokenInput = vi.fn();

    await expect(
      ensureOpenAiTokenConfigured({ storageLocalGet, showNotification, navigateToPane, focusTokenInput }),
    ).resolves.toBe(false);

    expect(showNotification).toHaveBeenCalledWith(
      'OpenAI API Tokenが未設定です。「設定」タブで保存してください。',
      'error',
    );
    expect(navigateToPane).toHaveBeenCalledWith('pane-settings');
    expect(focusTokenInput).toHaveBeenCalled();
  });

  it('treats storage errors as missing token', async () => {
    const storageLocalGet = vi.fn(async () => {
      throw new Error('storage failed');
    });
    const showNotification = vi.fn();
    const navigateToPane = vi.fn();
    const focusTokenInput = vi.fn();

    await expect(
      ensureOpenAiTokenConfigured({ storageLocalGet, showNotification, navigateToPane, focusTokenInput }),
    ).resolves.toBe(false);

    expect(showNotification).toHaveBeenCalled();
    expect(navigateToPane).toHaveBeenCalledWith('pane-settings');
    expect(focusTokenInput).toHaveBeenCalled();
  });
});
