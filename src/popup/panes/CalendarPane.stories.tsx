import type { Meta, StoryObj } from "@storybook/react-vite";

import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import {
  CalendarPane,
  type CalendarPaneProps,
} from "@/popup/panes/CalendarPane";
import type { SummarizeEventRequest } from "@/popup/runtime";
import { createStoryPopupRuntime } from "@/popup/storybook/createStoryPopupRuntime";

function CalendarPaneStory(props: CalendarPaneProps): React.JSX.Element {
  return <CalendarPane {...props} />;
}

const meta = {
  title: "Popup/Panes/Calendar",
  component: CalendarPaneStory,
  tags: ["test"],
  argTypes: {
    runtime: { control: false },
    notify: { control: false },
    navigateToPane: { control: false },
    focusTokenInput: { control: false },
  },
} satisfies Meta<typeof CalendarPaneStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    runtime: createStoryPopupRuntime({
      local: { openaiApiToken: "sk-storybook" },
      sync: { calendarTargets: ["google", "ics"] },
      summaryTarget: {
        text: "storybook summary target",
        source: "selection",
        title: "storybook title",
        url: "https://example.com",
      },
      background: {
        summarizeEvent: (_message: SummarizeEventRequest) => ({
          ok: true,
          eventText: "イベント要約（storybook）",
          calendarUrl:
            "https://calendar.google.com/calendar/render?action=TEMPLATE",
          event: {
            title: "storybook event",
            start: "2025-01-01T10:00:00+09:00",
            end: "2025-01-01T11:00:00+09:00",
            location: "オンライン",
            description: "storybook description",
          },
        }),
      },
    }),
    notify: { info: fn(), success: fn(), error: fn() },
    navigateToPane: fn(),
    focusTokenInput: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    await waitFor(() => {
      expect(canvas.getByRole("button", { name: "抽出する" })).toBeTruthy();
    });

    await userEvent.click(canvas.getByRole("button", { name: "抽出する" }));

    await waitFor(() => {
      expect(args.notify.success).toHaveBeenCalledWith("完了しました");
      expect(
        (canvas.getByTestId("calendar-output") as HTMLTextAreaElement).value
      ).toContain("イベント要約（storybook）");
      expect(canvas.getByTestId("calendar-source").textContent).toContain(
        "選択範囲"
      );
      expect(canvas.getByTestId("calendar-open-google")).toBeEnabled();
      expect(canvas.getByTestId("calendar-download-ics")).toBeEnabled();
    });
  },
};
