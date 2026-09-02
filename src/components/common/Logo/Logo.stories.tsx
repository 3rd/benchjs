import type { Meta, StoryObj } from "@storybook/react-vite";
import { Logo } from "./Logo";

const meta: Meta<typeof Logo> = {
  title: "Common/Logo",
  component: Logo,
};
export default meta;

type Story = StoryObj<typeof Logo>;

export const Default: Story = {
  args: {},
};

export const Large: Story = {
  args: {
    size: "large",
  },
};

export const Huge: Story = {
  args: {
    size: "huge",
  },
};

export const NoIcon: Story = {
  args: {
    noIcon: true,
  },
};
