import type { Meta, StoryObj } from "@storybook/react-vite";
import { ClockIcon } from "lucide-react";
import { MetricCard } from "./MetricCard";

const meta: Meta<typeof MetricCard> = {
  title: "Common/MetricCard",
  component: MetricCard,
};
export default meta;

type Story = StoryObj<typeof MetricCard>;

export const Default: Story = {
  args: {
    title: "Elapsed Time",
    value: "0ms",
    icon: ClockIcon,
  },
};
