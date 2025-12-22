import type { Meta, StoryObj } from "@storybook/react-vite";

import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { ActionsPane, type ActionsPaneProps } from "@/popup/panes/ActionsPane";
import type { RunContextActionRequest } from "@/popup/runtime";
import { createStoryPopupRuntime } from "@/popup/storybook/createStoryPopupRuntime";

function ActionsPaneStory(props: ActionsPaneProps): React.JSX.Element {
  return <ActionsPane {...props} />;
}

const meta = {
  title: "Popup/Panes/Actions",
  component: ActionsPaneStory,
  tags: ["test"],
  argTypes: {
    runtime: { control: false },
    notify: { control: false },
    navigateToPane: { control: false },
    focusTokenInput: { control: false },
  },
} satisfies Meta<typeof ActionsPaneStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    runtime: createStoryPopupRuntime({
      local: { openaiApiToken: "sk-storybook" },
      background: {
        runContextAction: (message: RunContextActionRequest) => {
          if (message.actionId === "builtin:summarize") {
            return {
              ok: true,
              resultType: "text",
              text: "要約結果（storybook）",
              source: "selection",
            };
          }
          return { ok: false, error: "storybook: unknown action" };
        },
      },
    }),
    notify: { info: fn(), success: fn(), error: fn() },
    navigateToPane: fn(),
    focusTokenInput: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    await waitFor(() => {
      expect(canvas.getByRole("button", { name: "要約" })).toBeTruthy();
    });

    await userEvent.click(canvas.getByRole("button", { name: "要約" }));
    await waitFor(() => {
      expect(args.notify.success).toHaveBeenCalledWith("完了しました");
      expect(
        (canvas.getByTestId("action-output") as HTMLTextAreaElement).value
      ).toContain("要約結果（storybook）");
      expect(canvas.getByTestId("action-source").textContent).toContain(
        "選択範囲"
      );
    });

    await userEvent.click(canvas.getByTestId("action-editor-select"));
    const listbox = await within(canvasElement.ownerDocument.body).findByRole(
      "listbox"
    );
    await userEvent.click(
      within(listbox).getByRole("option", { name: "要約" })
    );
    await userEvent.clear(canvas.getByTestId("action-editor-title"));
    await userEvent.type(
      canvas.getByTestId("action-editor-title"),
      "要約（編集テスト）"
    );
    await userEvent.click(canvas.getByTestId("action-editor-save"));

    await waitFor(() => {
      expect(args.notify.success).toHaveBeenCalledWith("保存しました");
      expect(
        canvas.getByRole("button", { name: "要約（編集テスト）" })
      ).toBeTruthy();
    });
  },
};
