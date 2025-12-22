import type { Meta, StoryObj } from "@storybook/react-vite";
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { expect, fn, waitFor } from "storybook/test";
import {
  OverlayApp,
  type OverlayViewModel,
} from "@/content/overlay/OverlayApp";
import { ensureShadowUiBaseStyles } from "@/ui/styles";
import { applyTheme, isTheme, type Theme } from "@/ui/theme";

// URLパラメータ例:
// - Storybookの`args`はXSS対策で英数字/スペース/_/-のみが許可されます（日本語は無視されます）
//   `?path=/story/content-overlayapp--ready&globals=theme:dark&args=primary:Hello%20world`
// - 日本語などを渡したい場合は`mbuPrimary`を使います（preview iframeにそのまま引き継がれます）
//   `?path=/story/content-overlayapp--ready&globals=theme:dark&mbuPrimary=要約結果（storybook）`
const LONG_PRIMARY_TEXT = [
  "要約結果（storybook）",
  "",
  "これは長文テスト用の本文です。",
  "短文では問題にならない余白/折返し/スクロール/ボタン位置ズレが起きないことを確認します。",
  "",
  "- 箇条書き1: 長文でも読みやすい",
  "- 箇条書き2: コピーボタンが本文と揃う",
  "- 箇条書き3: 横スクロールが発生しない",
  "",
  "本文が長い場合は、Overlay内がスクロールしてもヘッダやアクションが崩れないことを確認してください。",
  "",
  ...Array.from({ length: 18 }, (_, i) => `追加行 ${i + 1}: ダミーテキスト`),
].join("\n");
const CONTEXT_SELECTION_TEXT =
  "来週の定例ミーティングは2/12(木)10:00-11:00、Google Meetで実施します。";
const CONTEXT_SELECTION_SECONDARY = `選択範囲:\n${CONTEXT_SELECTION_TEXT}`;
const PROMPT_PRIMARY_TEXT = [
  "了解しました。以下の観点で整理します。",
  "",
  "- 日時: 2/12(木) 10:00-11:00",
  "- 場所: Google Meet",
  "- 目的: 進捗共有と課題確認",
].join("\n");
const CALENDAR_EVENT: NonNullable<OverlayViewModel["event"]> = {
  title: "プロジェクト定例ミーティング",
  start: "2026-02-12T10:00:00+09:00",
  end: "2026-02-12T11:00:00+09:00",
  location: "Google Meet",
  description: "進捗共有と課題確認",
};
const CALENDAR_PRIMARY_TEXT = [
  `タイトル: ${CALENDAR_EVENT.title}`,
  `日時: ${CALENDAR_EVENT.start} 〜 ${CALENDAR_EVENT.end ?? ""}`.trim(),
  `場所: ${CALENDAR_EVENT.location ?? ""}`.trim(),
  "",
  "概要:",
  CALENDAR_EVENT.description ?? "",
].join("\n");
const CALENDAR_URL = "https://calendar.google.com/";
const CALENDAR_ICS = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "SUMMARY:プロジェクト定例ミーティング",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\n");

const COMPONENTS_CSS_PATH = "src/styles/tokens/components.css";

type OverlayStoryArgs = {
  status: OverlayViewModel["status"];
  mode: OverlayViewModel["mode"];
  source: OverlayViewModel["source"];
  title: string;
  primary: string;
  secondary: string;
  event?: OverlayViewModel["event"];
  calendarUrl?: string;
  ics?: string;
};

function OverlayAppStory(args: OverlayStoryArgs): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [mount, setMount] = useState<{
    shadow: ShadowRoot;
    root: HTMLDivElement;
  } | null>(null);

  const urlPrimary = new URL(window.location.href).searchParams.get(
    "mbuPrimary"
  );
  const primary = urlPrimary ?? args.primary;

  const docTheme = document.documentElement.getAttribute("data-theme");
  const resolvedTheme: Theme = isTheme(docTheme) ? docTheme : "auto";

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

  useLayoutEffect(() => {
    if (!mount) {
      return;
    }

    applyTheme(resolvedTheme, mount.shadow);
  }, [mount, resolvedTheme]);

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
              viewModel={{
                open: true,
                status: args.status,
                mode: args.mode,
                source: args.source,
                title: args.title,
                primary,
                secondary: args.secondary,
                event: args.event,
                calendarUrl: args.calendarUrl,
                ics: args.ics,
                anchorRect: null,
              }}
            />,
            mount.root
          )
        : null}
    </>
  );
}

function ensureOverlayFallbackStyles(shadow: ShadowRoot): void {
  if (shadow.querySelector("#mbu-ui-base-styles")) {
    return;
  }
  const link = shadow.ownerDocument.createElement("link");
  link.id = "mbu-ui-base-styles";
  link.rel = "stylesheet";
  link.href = COMPONENTS_CSS_PATH;
  shadow.appendChild(link);
}

function OverlayAppFallbackStory(args: OverlayStoryArgs): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [mount, setMount] = useState<{
    shadow: ShadowRoot;
    root: HTMLDivElement;
  } | null>(null);
  const removedLinksRef = useRef<HTMLLinkElement[]>([]);

  const docTheme = document.documentElement.getAttribute("data-theme");
  const resolvedTheme: Theme = isTheme(docTheme) ? docTheme : "auto";

  useLayoutEffect(() => {
    const tokenLinks = Array.from(
      document.querySelectorAll<HTMLLinkElement>(
        "#mbu-ui-token-primitives, #mbu-ui-token-semantic, #mbu-ui-base-styles"
      )
    );
    removedLinksRef.current = tokenLinks;
    for (const link of tokenLinks) {
      link.remove();
    }

    const host = hostRef.current;
    if (!host) {
      return;
    }

    host.id = "my-browser-utils-overlay-fallback";
    host.style.position = "fixed";
    host.style.top = "16px";
    host.style.left = "16px";
    host.style.zIndex = "2147483647";

    const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    ensureOverlayFallbackStyles(shadow);

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
      for (const link of removedLinksRef.current) {
        document.head.appendChild(link);
      }
      removedLinksRef.current = [];
      setMount(null);
    };
  }, []);

  useLayoutEffect(() => {
    if (!mount) {
      return;
    }

    applyTheme(resolvedTheme, mount.shadow);
  }, [mount, resolvedTheme]);

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
              viewModel={{
                open: true,
                status: args.status,
                mode: args.mode,
                source: args.source,
                title: args.title,
                primary: args.primary,
                secondary: args.secondary,
                event: args.event,
                calendarUrl: args.calendarUrl,
                ics: args.ics,
                anchorRect: null,
              }}
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
    status: { control: false },
    mode: { control: false },
    source: { control: false },
    title: { control: false },
    event: { control: false },
    calendarUrl: { control: false },
    ics: { control: false },
    primary: {
      control: "text",
    },
    secondary: {
      control: "text",
    },
  },
} satisfies Meta<typeof OverlayAppStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = {
  args: {
    status: "loading",
    mode: "text",
    source: "selection",
    title: "要約",
    primary: "",
    secondary: "処理に数秒かかることがあります。",
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
    status: "ready",
    mode: "text",
    source: "selection",
    title: "要約",
    primary: "要約結果（storybook）",
    secondary: "選択範囲:\n引用テキスト",
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

    const host = canvasElement.querySelector<HTMLDivElement>(
      "#my-browser-utils-overlay"
    );
    const shadow = host?.shadowRoot ?? null;
    const copyButton = shadow?.querySelector<HTMLElement>(
      '[data-testid="overlay-copy"]'
    );
    const primary = shadow?.querySelector<HTMLElement>(
      ".mbu-overlay-primary-text"
    );
    if (!(shadow && copyButton && primary)) {
      throw new Error("overlay copy/primary not found");
    }

    const copyRect = copyButton.getBoundingClientRect();
    const primaryRect = primary.getBoundingClientRect();
    expect(copyRect.top).toBeLessThanOrEqual(primaryRect.top + 1);
  },
};

export const PromptReady: Story = {
  args: {
    status: "ready",
    mode: "text",
    source: "selection",
    title: "プロンプト",
    primary: PROMPT_PRIMARY_TEXT,
    secondary: CONTEXT_SELECTION_SECONDARY,
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

    const host = canvasElement.querySelector<HTMLDivElement>(
      "#my-browser-utils-overlay"
    );
    const shadow = host?.shadowRoot ?? null;
    const title = shadow?.querySelector(".mbu-overlay-title");
    const chip = shadow?.querySelector(".mbu-overlay-chip");
    const auxSummary = shadow?.querySelector(".mbu-overlay-aux-summary");
    const quote = shadow?.querySelector(".mbu-overlay-quote");

    expect(title?.textContent).toContain("プロンプト");
    expect(chip?.textContent).toContain("選択範囲");
    expect(auxSummary?.textContent).toContain("選択したテキスト");
    expect(quote?.textContent).toContain("Google Meet");
    expect(shadow?.querySelector(".mbu-overlay-secondary-text")).toBeNull();
  },
};

export const ReadyLongText: Story = {
  args: {
    status: "ready",
    mode: "text",
    source: "selection",
    title: "要約",
    primary: LONG_PRIMARY_TEXT,
    secondary: "選択範囲:\n引用テキスト",
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

    const host = canvasElement.querySelector<HTMLDivElement>(
      "#my-browser-utils-overlay"
    );
    const shadow = host?.shadowRoot ?? null;
    const panel = shadow?.querySelector<HTMLElement>(".mbu-overlay-panel");
    const body = shadow?.querySelector<HTMLElement>(".mbu-overlay-body");
    const copyButton = shadow?.querySelector<HTMLElement>(
      '[data-testid="overlay-copy"]'
    );
    const primary = shadow?.querySelector<HTMLElement>(
      ".mbu-overlay-primary-text"
    );
    if (!(panel && body && copyButton && primary)) {
      throw new Error("overlay elements not found");
    }

    await waitFor(() => {
      expect(body.scrollHeight).toBeGreaterThan(body.clientHeight);
    });

    const copyRect = copyButton.getBoundingClientRect();
    const primaryRect = primary.getBoundingClientRect();
    expect(copyRect.top).toBeLessThanOrEqual(primaryRect.top + 1);

    expect(panel.scrollWidth).toBeLessThanOrEqual(panel.clientWidth + 1);
  },
};

export const CalendarReady: Story = {
  args: {
    status: "ready",
    mode: "event",
    source: "selection",
    title: "カレンダー登録",
    primary: CALENDAR_PRIMARY_TEXT,
    secondary: CONTEXT_SELECTION_SECONDARY,
    event: CALENDAR_EVENT,
    calendarUrl: CALENDAR_URL,
    ics: CALENDAR_ICS,
  },
  play: async ({ canvasElement }) => {
    await waitFor(() => {
      const host = canvasElement.querySelector<HTMLDivElement>(
        "#my-browser-utils-overlay"
      );
      const shadow = host?.shadowRoot ?? null;
      expect(shadow?.querySelector(".mbu-overlay-event-table")).toBeTruthy();
    });

    const host = canvasElement.querySelector<HTMLDivElement>(
      "#my-browser-utils-overlay"
    );
    const shadow = host?.shadowRoot ?? null;
    const bodyActions = shadow?.querySelector<HTMLElement>(
      ".mbu-overlay-body-actions"
    );
    const headerActions = shadow?.querySelector<HTMLElement>(
      ".mbu-overlay-actions"
    );
    const quote = shadow?.querySelector<HTMLElement>(".mbu-overlay-quote");

    expect(shadow?.textContent).toContain("プロジェクト定例ミーティング");
    expect(shadow?.textContent).toContain("Google Meet");
    expect(bodyActions?.textContent).toContain("Googleカレンダーに登録");
    expect(bodyActions?.textContent).toContain(".ics");
    expect(
      bodyActions?.querySelector('[data-testid="overlay-copy"]')
    ).toBeTruthy();
    expect(
      headerActions?.querySelector('[data-testid="overlay-copy"]')
    ).toBeNull();
    expect(quote?.textContent).toContain("Google Meet");
  },
};

export const ReadyStylesApplied: Story = {
  args: {
    status: "ready",
    mode: "text",
    source: "selection",
    title: "要約",
    primary: "要約結果（storybook）",
    secondary: "選択範囲:\n引用テキスト",
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

export const ReadyStylesFallbackApplied: Story = {
  args: {
    status: "ready",
    mode: "text",
    source: "selection",
    title: "要約",
    primary: "要約結果（storybook）",
    secondary: "選択範囲:\n引用テキスト",
  },
  render: (args) => <OverlayAppFallbackStory {...args} />,
  play: async ({ canvasElement }) => {
    await waitFor(() => {
      const host = canvasElement.querySelector<HTMLDivElement>(
        "#my-browser-utils-overlay-fallback"
      );
      const shadow = host?.shadowRoot ?? null;
      expect(host).toBeTruthy();
      expect(shadow).toBeTruthy();
      expect(shadow?.querySelector(".mbu-overlay-panel")).toBeTruthy();
    });

    const host = canvasElement.querySelector<HTMLDivElement>(
      "#my-browser-utils-overlay-fallback"
    );
    const shadow = host?.shadowRoot ?? null;
    const panel = shadow?.querySelector<HTMLElement>(".mbu-overlay-panel");

    if (!(host && shadow && panel)) {
      throw new Error("overlay host/shadow/panel not mounted");
    }

    await waitFor(() => {
      expect(
        getComputedStyle(host).getPropertyValue("--primitive-space-7").trim()
      ).toBe("");
    });

    await waitFor(() => {
      expect(
        getComputedStyle(host).getPropertyValue("--mbu-surface").trim()
      ).not.toBe("");
    });

    await waitFor(() => {
      const styles = getComputedStyle(panel);
      expect(styles.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    });
  },
};
