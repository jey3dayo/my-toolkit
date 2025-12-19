import type { Meta, StoryObj } from "@storybook/react-vite";
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { expect, fn, waitFor } from "storybook/test";
import {
  OverlayApp,
  type OverlayViewModel,
} from "@/content/overlay/OverlayApp";
import { ensureShadowUiBaseStyles } from "@/ui/styles";

type Props = {
  viewModel: OverlayViewModel;
};

function OverlayAppStory(props: Props): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [mount, setMount] = useState<{
    shadow: ShadowRoot;
    root: HTMLDivElement;
  } | null>(null);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    host.id = "my-browser-utils-overlay";
    host.style.position = "fixed";
    host.style.top = "16px";
    host.style.left = "16px";
    host.style.zIndex = "2147483647";

    const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    ensureShadowUiBaseStyles(shadow);

    const root = shadow.getElementById("my-browser-utils-overlay-root");
    const rootEl = root
      ? (root as HTMLDivElement)
      : document.createElement("div");
    rootEl.id = "my-browser-utils-overlay-root";
    if (!root) {
      shadow.appendChild(rootEl);
    }

    setMount({ shadow, root: rootEl });

    return () => {
      setMount(null);
    };
  }, []);

  const host = hostRef.current;

  return (
    <>
      <div ref={hostRef} />
      {mount && host
        ? createPortal(
            <OverlayApp
              host={host}
              onDismiss={fn()}
              portalContainer={mount.shadow}
              viewModel={props.viewModel}
            />,
            mount.root
          )
        : null}
    </>
  );
}

const meta = {
  title: "Content/OverlayApp",
  component: OverlayAppStory,
  tags: ["test"],
  argTypes: {
    viewModel: { control: false },
  },
} satisfies Meta<typeof OverlayAppStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = {
  args: {
    viewModel: {
      open: true,
      status: "loading",
      mode: "text",
      source: "selection",
      title: "要約",
      primary: "",
      secondary: "処理に数秒かかることがあります。",
      anchorRect: null,
    },
  },
  play: async ({ canvasElement }) => {
    await waitFor(() => {
      const host = canvasElement.querySelector<HTMLDivElement>(
        "#my-browser-utils-overlay"
      );
      expect(host).toBeTruthy();
      expect(host?.shadowRoot).toBeTruthy();
    });

    const host = canvasElement.querySelector<HTMLDivElement>(
      "#my-browser-utils-overlay"
    );
    const shadow = host?.shadowRoot ?? null;
    expect(shadow).not.toBeNull();
    expect(shadow?.textContent).toContain("処理中...");
    expect(shadow?.querySelector('[data-testid="overlay-copy"]')).toBeNull();
  },
};

export const Ready: Story = {
  args: {
    viewModel: {
      open: true,
      status: "ready",
      mode: "text",
      source: "selection",
      title: "要約",
      primary: "要約結果（storybook）",
      secondary: "選択範囲:\n引用テキスト",
      anchorRect: null,
    },
  },
  play: async ({ canvasElement }) => {
    await waitFor(() => {
      const host = canvasElement.querySelector<HTMLDivElement>(
        "#my-browser-utils-overlay"
      );
      const shadow = host?.shadowRoot ?? null;
      expect(
        shadow?.querySelector('[data-testid="overlay-copy"]')
      ).toBeTruthy();
    });
  },
};

export const ReadyStylesApplied: Story = {
  args: {
    viewModel: {
      open: true,
      status: "ready",
      mode: "text",
      source: "selection",
      title: "要約",
      primary: "要約結果（storybook）",
      secondary: "選択範囲:\n引用テキスト",
      anchorRect: null,
    },
  },
  play: async ({ canvasElement }) => {
    await waitFor(() => {
      const host = canvasElement.querySelector<HTMLDivElement>(
        "#my-browser-utils-overlay"
      );
      const shadow = host?.shadowRoot ?? null;
      expect(host).toBeTruthy();
      expect(shadow).toBeTruthy();
      expect(shadow?.querySelector(".mbu-overlay-panel")).toBeTruthy();
    });

    const host = canvasElement.querySelector<HTMLDivElement>(
      "#my-browser-utils-overlay"
    );
    const shadow = host?.shadowRoot ?? null;
    const panel = shadow?.querySelector<HTMLElement>(".mbu-overlay-panel");

    if (!(host && shadow && panel)) {
      throw new Error("overlay host/shadow/panel not mounted");
    }

    await waitFor(() => {
      expect(
        getComputedStyle(host).getPropertyValue("--primitive-space-7").trim()
      ).toBe("16px");
    });

    await waitFor(() => {
      expect(
        getComputedStyle(host).getPropertyValue("--mbu-surface").trim()
      ).not.toBe("");
    });

    await waitFor(() => {
      const styles = getComputedStyle(panel);
      expect(styles.display).toBe("grid");
      expect(styles.borderTopStyle).toBe("solid");
      expect(styles.borderTopWidth).toBe("1px");
    });
  },
};
