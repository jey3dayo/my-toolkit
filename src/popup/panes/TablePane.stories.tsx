import type { Meta, StoryObj } from '@storybook/react-vite';

import { expect, fn, userEvent, waitFor, within } from 'storybook/test';

import { createStoryPopupRuntime } from '../storybook/createStoryPopupRuntime';
import { TablePane } from './TablePane';
import type { PopupPaneBaseProps } from './types';

function TablePaneStory(props: PopupPaneBaseProps): React.JSX.Element {
  return <TablePane notify={props.notify} runtime={props.runtime} />;
}

const meta = {
  title: 'Popup/TablePane',
  component: TablePaneStory,
  tags: ['test'],
  argTypes: {
    runtime: { control: false },
    notify: { control: false },
  },
} satisfies Meta<typeof TablePaneStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    runtime: createStoryPopupRuntime({ sync: { autoEnableSort: false, domainPatterns: [] }, activeTabId: 1 }),
    notify: { info: fn(), success: fn(), error: fn() },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByTestId('enable-table-sort'));
    await waitFor(() => {
      expect(args.notify.success).toHaveBeenCalledWith('テーブルソートを有効化しました');
    });

    await userEvent.click(canvas.getByTestId('auto-enable-sort'));
    await waitFor(() => {
      expect(args.notify.success).toHaveBeenCalledWith('保存しました');
    });

    await userEvent.type(canvas.getByTestId('pattern-input'), 'example.com/path*');
    await userEvent.click(canvas.getByTestId('pattern-add'));
    await waitFor(() => {
      expect(args.notify.success).toHaveBeenCalledWith('追加しました');
    });
  },
};
