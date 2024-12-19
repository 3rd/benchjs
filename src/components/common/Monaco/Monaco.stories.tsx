import type { Meta, StoryObj } from "@storybook/react";
import { Monaco } from "./Monaco";

const meta: Meta<typeof Monaco> = {
  title: "Common/Monaco",
  component: Monaco,
  render: (args) => (
    <div className="h-[400px]">
      <Monaco height="100%" language="typescript" {...args} />
    </div>
  ),
};
export default meta;

type Story = StoryObj<typeof Monaco>;

export const Default: Story = {
  args: {},
};

export const WithTabs: Story = {
  args: {
    tabs: [
      {
        name: "main.ts",
        active: true,
      },
      {
        name: "setup.ts",
        active: false,
      },
    ],
  },
};
