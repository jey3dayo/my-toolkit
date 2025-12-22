import type { Meta, StoryObj } from "@storybook/react-vite";

import { expect, userEvent, waitFor, within } from "storybook/test";
import { AuxTextDisclosure } from "./AuxTextDisclosure";

type Props = React.ComponentProps<typeof AuxTextDisclosure>;

function AuxTextDisclosureStory(props: Props): React.JSX.Element | null {
  return <AuxTextDisclosure {...props} />;
}

const meta = {
  title: "Shared/Components/AuxTextDisclosure",
  component: AuxTextDisclosureStory,
  tags: ["test"],
} satisfies Meta<typeof AuxTextDisclosureStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ClosedByDefault: Story = {
  args: {
    summary: "選択範囲",
    text: "  引用テキスト  ",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const details = canvasElement.querySelector<HTMLDetailsElement>(
      "details.mbu-overlay-aux"
    );
    expect(details).toBeTruthy();
    if (!details) {
      return;
    }
    expect(details.open).toBe(false);

    const summaryEl = canvas.getByText("選択範囲");

    await userEvent.click(summaryEl);
    await waitFor(() => {
      expect(details.open).toBe(true);
    });

    const quote =
      canvasElement.querySelector<HTMLElement>(".mbu-overlay-quote");
    expect(quote?.textContent).toBe("引用テキスト");

    await userEvent.click(summaryEl);
    await waitFor(() => {
      expect(details.open).toBe(false);
    });
  },
};

export const OpenByDefault: Story = {
  args: {
    summary: "選択範囲",
    text: "引用テキスト",
    defaultOpen: true,
  },
  play: ({ canvasElement }) => {
    const details = canvasElement.querySelector<HTMLDetailsElement>(
      "details.mbu-overlay-aux"
    );
    expect(details?.open).toBe(true);
  },
};

export const EmptyText: Story = {
  args: {
    summary: "選択範囲",
    text: "   ",
  },
  play: ({ canvasElement }) => {
    expect(canvasElement.querySelector("details.mbu-overlay-aux")).toBeNull();
  },
};
