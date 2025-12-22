import type { Meta, StoryObj } from "@storybook/react-vite";

import { useMemo } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { createNotifications, ToastHost } from "@/ui/toast";

function ToastStory(): React.JSX.Element {
  const notifications = useMemo(() => createNotifications(), []);

  return (
    <>
      <ToastHost
        portalContainer={document.body}
        toastManager={notifications.toastManager}
      />
      <div style={{ display: "grid", gap: 12, maxWidth: 560 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>Toast</div>
          <div style={{ color: "var(--color-text-muted)", fontSize: 12 }}>
            トリガーを押して見た目（幅/余白/状態の見分けやすさ）を確認できます。
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            className="mbu-overlay-action"
            data-testid="toast-info"
            onClick={() => {
              notifications.notify.info("コピーしました");
            }}
            type="button"
          >
            Info
          </button>
          <button
            className="mbu-overlay-action"
            data-testid="toast-success"
            onClick={() => {
              notifications.notify.success("保存しました");
            }}
            type="button"
          >
            Success
          </button>
          <button
            className="mbu-overlay-action"
            data-testid="toast-error"
            onClick={() => {
              notifications.toastManager.add({
                title: "コピーに失敗しました",
                description: "権限がありません。ページ設定を確認してください。",
                type: "error",
                timeout: 5000,
                priority: "high",
              });
            }}
            type="button"
          >
            Error
          </button>
          <button
            className="mbu-overlay-action"
            data-testid="toast-long"
            onClick={() => {
              notifications.toastManager.add({
                title:
                  "長いメッセージでも太く見えず、適切に折り返されることを確認してください",
                type: "info",
                timeout: 6000,
                priority: "low",
              });
            }}
            type="button"
          >
            Long
          </button>
        </div>
      </div>
    </>
  );
}

const meta = {
  title: "Shared/UI/Toast",
  component: ToastStory,
  tags: ["test"],
} satisfies Meta<typeof ToastStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  play: async ({ canvasElement }) => {
    const doc = canvasElement.ownerDocument;
    const view = doc.defaultView;
    const canvas = within(canvasElement);

    const viewportWidth = view?.innerWidth ?? doc.documentElement.clientWidth;
    const viewportHeight =
      view?.innerHeight ?? doc.documentElement.clientHeight;

    async function triggerAndAssertToast(
      testId: string,
      expectedText: string
    ): Promise<void> {
      await userEvent.click(canvas.getByTestId(testId));
      await waitFor(() => {
        const toasts = doc.body.querySelectorAll(".mbu-toast-root");
        expect(toasts.length).toBeGreaterThan(0);
        const toast = Array.from(toasts).find((node) =>
          node.textContent?.includes(expectedText)
        );
        expect(toast).toBeTruthy();
      });

      const toasts = doc.body.querySelectorAll<HTMLElement>(".mbu-toast-root");
      const toast = Array.from(toasts).find((node) =>
        node.textContent?.includes(expectedText)
      );
      if (!toast) {
        throw new Error(`Toast not found: ${expectedText}`);
      }

      await waitFor(() => {
        const viewport = doc.body.querySelector<HTMLElement>(
          ".mbu-toast-viewport"
        );
        expect(viewport).toBeTruthy();
        if (!viewport) {
          return;
        }
        expect(getComputedStyle(viewport).position).toBe("fixed");
      });

      const rect = toast.getBoundingClientRect();

      expect(rect.left).toBeGreaterThanOrEqual(-1);
      expect(rect.top).toBeGreaterThanOrEqual(-1);
      expect(rect.right).toBeLessThanOrEqual(viewportWidth + 1);
      expect(rect.bottom).toBeLessThanOrEqual(viewportHeight + 1);
    }

    await triggerAndAssertToast("toast-info", "コピーしました");
    await triggerAndAssertToast("toast-success", "保存しました");
    await triggerAndAssertToast("toast-error", "コピーに失敗しました");
    await triggerAndAssertToast("toast-long", "長いメッセージでも太く見えず");
  },
};
