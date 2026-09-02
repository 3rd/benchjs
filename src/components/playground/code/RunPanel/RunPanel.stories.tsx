import type { Meta, StoryObj } from "@storybook/react-vite";
import { RunPanel } from "./RunPanel";

const meta: Meta<typeof RunPanel> = {
  title: "Playground/Code/RunPanel",
  component: RunPanel,
};
export default meta;

type Story = StoryObj<typeof RunPanel>;

export const Default: Story = {
  args: {
    implementation: {
      id: "main.ts",
      filename: "main.ts",
      content: "// Write your implementation here\n",
    },
  },
};
