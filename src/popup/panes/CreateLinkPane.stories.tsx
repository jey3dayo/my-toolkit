import type { Meta, StoryObj } from "@storybook/react-vite";

import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { CreateLinkPane } from "@/popup/panes/CreateLinkPane";
import type { PopupPaneBaseProps } from "@/popup/panes/types";
import { createStoryPopupRuntime } from "@/popup/storybook/createStoryPopupRuntime";

function CreateLinkPaneStory(props: PopupPaneBaseProps): React.JSX.Element {
  return <CreateLinkPane notify={props.notify} runtime={props.runtime} />;
}

const meta = {
  title: "Popup/Panes/CreateLink",
  component: CreateLinkPaneStory,
  tags: ["test"],
  argTypes: {
    runtime: { control: false },
    notify: { control: false },
  },
} satisfies Meta<typeof CreateLinkPaneStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    runtime: createStoryPopupRuntime({
      activeTab: {
        id: 1,
        title: "Example",
        url: "https://example.com/path?q=1",
      },
    }),
    notify: { info: fn(), success: fn(), error: fn() },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await waitFor(() => {
      const output = canvas.getByTestId(
        "create-link-output"
      ) as HTMLTextAreaElement;
      expect(output.value).toBe("[Example](<https://example.com/path?q=1>)");
    });

    await userEvent.click(canvas.getByTestId("create-link-format"));
    const listbox = await within(canvasElement.ownerDocument.body).findByRole(
      "listbox"
    );
    await userEvent.click(
      within(listbox).getByRole("option", { name: "HTML <a>" })
    );

    await waitFor(() => {
      const output = canvas.getByTestId(
        "create-link-output"
      ) as HTMLTextAreaElement;
      expect(output.value).toBe(
        '<a href="https://example.com/path?q=1">Example</a>'
      );
    });
  },
};
