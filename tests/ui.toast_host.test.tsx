import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { createNotifications, ToastHost } from "@/ui/toast";

// Enable React's act() behavior warnings to be handled correctly in this test suite.
(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

async function flushEffects(times = 3): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  }
}

describe("ToastHost", () => {
  it("renders toasts in the document surface", async () => {
    const { toastManager, notify } = createNotifications();

    const container = document.createElement("div");
    document.body.appendChild(container);

    const root = createRoot(container);
    await act(async () => {
      root.render(
        <ToastHost
          portalContainer={document.body}
          toastManager={toastManager}
        />
      );
      await flushEffects();
    });

    await act(async () => {
      notify.success("完了しました");
      await flushEffects();
    });

    expect(
      document.body.querySelector(".mbu-toast-root")?.textContent
    ).toContain("完了しました");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders portalled toasts inside the shadow root", async () => {
    const { toastManager, notify } = createNotifications();

    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "open" });
    const container = document.createElement("div");
    shadow.appendChild(container);
    document.body.appendChild(host);

    const root = createRoot(container);
    await act(async () => {
      root.render(
        <ToastHost portalContainer={shadow} toastManager={toastManager} />
      );
      await flushEffects();
    });

    await act(async () => {
      notify.error("失敗しました");
      await flushEffects();
    });

    expect(shadow.querySelector(".mbu-toast-root")?.textContent).toContain(
      "失敗しました"
    );
    expect(document.body.querySelector(".mbu-toast-root")).toBeNull();

    act(() => {
      root.unmount();
    });
    host.remove();
  });
});
