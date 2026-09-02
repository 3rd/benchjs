import type { Meta, StoryObj } from "@storybook/react-vite";
import { MonacoTab } from "./MonacoTab";

const meta: Meta<typeof MonacoTab> = {
  title: "Common/MonacoTab",
  component: MonacoTab,
};
export default meta;

type Story = StoryObj<typeof MonacoTab>;

export const Default: Story = {
  args: {
    tab: {
      id: "main.ts",
      name: "main.ts",
      active: false,
    },
    tabs: [
      { id: "main.ts", name: "main.ts", active: false },
      { id: "setup.ts", name: "setup.ts", active: false },
    ],
  },
};

export const Active: Story = {
  args: {
    tab: {
      id: "main.ts",
      name: "main.ts",
      active: true,
    },
    tabs: [
      { id: "main.ts", name: "main.ts", active: false },
      { id: "setup.ts", name: "setup.ts", active: false },
    ],
  },
};
