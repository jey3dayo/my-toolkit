import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { ThemeCycleButton } from "@/components/ThemeCycleButton";
import type { Theme } from "@/ui/theme";
import { nextTheme } from "@/ui/themeCycle";

function ThemeCycleButtonStory(): React.JSX.Element {
  const [theme, setTheme] = useState<Theme>("auto");

  return (
    <ThemeCycleButton
      className="mbu-overlay-action mbu-overlay-icon-button"
      onToggle={() => {
        setTheme((prev) => nextTheme(prev));
      }}
      testId="theme-cycle"
      theme={theme}
    />
  );
}

const meta = {
  title: "Shared/Components/ThemeCycleButton",
  component: ThemeCycleButtonStory,
  tags: ["test"],
} satisfies Meta<typeof ThemeCycleButtonStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Cycle: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByTestId("theme-cycle");

    expect(button.getAttribute("aria-label")).toContain("自動");

    await userEvent.click(button);
    await waitFor(() => {
      expect(button.getAttribute("aria-label")).toContain("ライト");
    });

    await userEvent.click(button);
    await waitFor(() => {
      expect(button.getAttribute("aria-label")).toContain("ダーク");
    });

    await userEvent.click(button);
    await waitFor(() => {
      expect(button.getAttribute("aria-label")).toContain("自動");
    });
  },
};
