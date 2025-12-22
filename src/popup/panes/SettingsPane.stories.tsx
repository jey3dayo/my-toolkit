import type { Meta, StoryObj } from "@storybook/react-vite";
import { useRef } from "react";

import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { SettingsPane } from "@/popup/panes/SettingsPane";
import type { PopupPaneBaseProps } from "@/popup/panes/types";
import { createStoryPopupRuntime } from "@/popup/storybook/createStoryPopupRuntime";

function SettingsPaneStory(props: PopupPaneBaseProps): React.JSX.Element {
  const tokenInputRef = useRef<HTMLInputElement | null>(null);
  return (
    <SettingsPane
      notify={props.notify}
      runtime={props.runtime}
      tokenInputRef={tokenInputRef}
    />
  );
}

const meta = {
  title: "Popup/Panes/Settings",
  component: SettingsPaneStory,
  tags: ["test"],
  argTypes: {
    runtime: { control: false },
    notify: { control: false },
  },
} satisfies Meta<typeof SettingsPaneStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    runtime: createStoryPopupRuntime(),
    notify: { info: fn(), success: fn(), error: fn() },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    const tokenInput = canvas.getByTestId("openai-token");
    await userEvent.clear(tokenInput);
    await userEvent.type(tokenInput, "sk-test");

    await userEvent.click(canvas.getByTestId("token-save"));
    await waitFor(() => {
      expect(args.notify.success).toHaveBeenCalledWith("保存しました");
    });

    await userEvent.click(canvas.getByTestId("token-visible"));
    await userEvent.click(canvas.getByTestId("token-visible"));
  },
};
