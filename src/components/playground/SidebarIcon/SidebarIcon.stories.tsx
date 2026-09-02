import type { Meta, StoryObj } from "@storybook/react-vite";
import { Search } from "lucide-react";
import { SidebarIcon } from "./SidebarIcon";

const meta: Meta<typeof SidebarIcon> = {
  title: "Playground/SidebarIcon",
  component: SidebarIcon,
  render: (args) => (
    <div className="flex gap-2 items-center">
      <SidebarIcon {...args} />
    </div>
  ),
};
export default meta;

type Story = StoryObj<typeof SidebarIcon>;

export const Default: Story = {
  args: {
    icon: Search,
    isActive: false,
    tooltip: "Search",
  },
};
