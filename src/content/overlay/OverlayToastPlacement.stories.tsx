import type { Meta, StoryObj } from "@storybook/react-vite";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { expect, userEvent, waitFor } from "storybook/test";
import { ensureShadowUiBaseStyles } from "@/ui/styles";
import { applyTheme, isTheme, type Theme } from "@/ui/theme";
import { createNotifications, ToastHost } from "@/ui/toast";

function OverlayToastPlacementStory(): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [shadow, setShadow] = useState<ShadowRoot | null>(null);
  const notifications = useMemo(() => createNotifications(), []);

  const docTheme = document.documentElement.getAttribute("data-theme");
  const resolvedTheme: Theme = isTheme(docTheme) ? docTheme : "auto";

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    host.id = "my-browser-utils-overlay";
    const shadowRoot = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    ensureShadowUiBaseStyles(shadowRoot);
    applyTheme(resolvedTheme, shadowRoot);

    host.style.left = "auto";
    host.style.right = "40px";
    host.style.top = "16px";
    setShadow(shadowRoot);
  }, [resolvedTheme]);

  return (
    <>
      <div ref={hostRef} />
      {shadow
        ? createPortal(
            <div className="mbu-overlay-surface">
              <ToastHost
                placement="surface"
                portalContainer={shadow}
                toastManager={notifications.toastManager}
              />
              <div className="mbu-overlay-panel" style={{ width: 520 }}>
                <div className="mbu-overlay-header">
                  <div className="mbu-overlay-header-left">
                    <div className="mbu-overlay-title">Overlay Toast</div>
                  </div>
                  <div className="mbu-overlay-actions">
                    <button
                      className="mbu-overlay-action"
                      data-testid="toast-trigger"
                      onClick={() => {
                        notifications.notify.success("コピーしました");
                      }}
                      type="button"
                    >
                      Copy
                    </button>
                  </div>
                </div>
                <div className="mbu-overlay-body">
                  <div style={{ color: "var(--mbu-text-muted)", fontSize: 12 }}>
                    toastが画面外に出ないことを確認するfixtureです。
                  </div>
                </div>
              </div>
            </div>,
            shadow
          )
        : null}
    </>
  );
}

const meta = {
  title: "Content/Overlay/Toast/Placement",
  component: OverlayToastPlacementStory,
  tags: ["test"],
} satisfies Meta<typeof OverlayToastPlacementStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  play: async ({ canvasElement }) => {
    const doc = canvasElement.ownerDocument;

    await waitFor(() => {
      expect(doc.getElementById("my-browser-utils-overlay")).toBeTruthy();
    });

    const host = doc.getElementById("my-browser-utils-overlay");
    if (!(host instanceof HTMLElement)) {
      throw new Error("Overlay host not found");
    }
    const shadow = host.shadowRoot;
    if (!shadow) {
      throw new Error("ShadowRoot not found");
    }

    const trigger = shadow.querySelector<HTMLElement>(
      '[data-testid="toast-trigger"]'
    );
    if (!trigger) {
      throw new Error("Toast trigger not found");
    }
    await userEvent.click(trigger);

    await waitFor(() => {
      expect(shadow.querySelector(".mbu-toast-root")).toBeTruthy();
    });

    const toast = shadow.querySelector<HTMLElement>(".mbu-toast-root");
    if (!toast) {
      throw new Error("Toast not found");
    }

    const panel = shadow.querySelector<HTMLElement>(".mbu-overlay-panel");
    if (!panel) {
      throw new Error("Panel not found");
    }

    const rect = toast.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const view = doc.defaultView;
    const viewportWidth = view?.innerWidth ?? doc.documentElement.clientWidth;
    const viewportHeight =
      view?.innerHeight ?? doc.documentElement.clientHeight;

    expect(rect.left).toBeGreaterThanOrEqual(-1);
    expect(rect.top).toBeGreaterThanOrEqual(-1);
    expect(rect.right).toBeLessThanOrEqual(viewportWidth + 1);
    expect(rect.bottom).toBeLessThanOrEqual(viewportHeight + 1);
    expect(rect.top).toBeGreaterThanOrEqual(panelRect.bottom + 7);
  },
};
