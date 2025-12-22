import type { Meta, StoryObj } from "@storybook/react-vite";

import { expect, within } from "storybook/test";

import { Icon, type IconName } from "./icon";

const iconNames: IconName[] = [
  "menu",
  "zap",
  "table",
  "link",
  "settings",
  "monitor",
  "sun",
  "moon",
  "pin",
  "copy",
  "close",
  "eye",
  "eye-off",
];

function IconGallery(): React.JSX.Element {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
        gap: 12,
        padding: 16,
      }}
    >
      {iconNames.map((name) => (
        <div
          key={name}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: 12,
            borderRadius: 12,
            border: "1px solid var(--color-border-ui)",
            background: "var(--color-surface)",
          }}
        >
          <Icon aria-hidden="true" data-testid={`icon-${name}`} name={name} />
          <code style={{ fontSize: 12 }}>{name}</code>
        </div>
      ))}
    </div>
  );
}

const meta = {
  title: "Shared/Components/Icon",
  component: IconGallery,
  tags: ["test"],
} satisfies Meta<typeof IconGallery>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Gallery: Story = {
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);

    for (const name of iconNames) {
      const svg = canvas.getByTestId(`icon-${name}`);
      expect(svg.tagName.toLowerCase()).toBe("svg");
    }
  },
};
