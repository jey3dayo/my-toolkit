import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor } from "storybook/test";

import {
  OverlayAppFallbackStory,
  OverlayAppStory,
} from "@/content/overlay/OverlayApp.story-helpers";

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

const meta = {
  title: "Content/Overlay/App/要約・プロンプト",
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

export const ThemeToggle: Story = {
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
        shadow?.querySelector('[data-testid="overlay-theme"]')
      ).toBeTruthy();
    });

    const host = canvasElement.querySelector<HTMLDivElement>(
      "#my-browser-utils-overlay"
    );
    const shadow = host?.shadowRoot ?? null;
    const themeButton = shadow?.querySelector<HTMLButtonElement>(
      '[data-testid="overlay-theme"]'
    );
    if (!themeButton) {
      throw new Error("overlay theme button not found");
    }

    expect(themeButton.getAttribute("aria-label")).toContain("自動");

    await userEvent.click(themeButton);
    await waitFor(() => {
      expect(themeButton.getAttribute("aria-label")).toContain("ライト");
    });

    await userEvent.click(themeButton);
    await waitFor(() => {
      expect(themeButton.getAttribute("aria-label")).toContain("ダーク");
    });

    await userEvent.click(themeButton);
    await waitFor(() => {
      expect(themeButton.getAttribute("aria-label")).toContain("自動");
    });
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
