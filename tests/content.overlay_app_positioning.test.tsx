import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import {
  OverlayApp,
  type OverlayViewModel,
} from "@/content/overlay/OverlayApp";

// Enable React's act() behavior warnings to be handled correctly in this test suite.
(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

async function flushEffects(times = 3): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  }
}

function setWindowSize(size: { width: number; height: number }): void {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: size.width,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: size.height,
  });
}

describe("OverlayApp positioning", () => {
  it("repositions when window is resized without panel size changes", async () => {
    const viewModel: OverlayViewModel = {
      open: true,
      status: "ready",
      mode: "text",
      source: "selection",
      title: "要約",
      primary: "結果",
      secondary: "",
      anchorRect: null,
    };

    const host = document.createElement("div");
    document.body.appendChild(host);

    const portalHost = document.createElement("div");
    const portalShadow = portalHost.attachShadow({ mode: "open" });
    document.body.appendChild(portalHost);

    const container = document.createElement("div");
    document.body.appendChild(container);

    const root = createRoot(container);

    setWindowSize({ width: 900, height: 700 });

    await act(async () => {
      root.render(
        <OverlayApp
          host={host}
          onDismiss={() => undefined}
          portalContainer={portalShadow}
          viewModel={viewModel}
        />
      );
      await flushEffects();
    });

    expect(host.style.left).toBe("340px");
    expect(host.style.top).toBe("16px");

    setWindowSize({ width: 850, height: 700 });
    window.dispatchEvent(new Event("resize"));

    expect(host.style.left).toBe("290px");
    expect(host.style.top).toBe("16px");

    act(() => {
      root.unmount();
    });
    container.remove();
    portalHost.remove();
    host.remove();
  });
});
