import type { Meta, StoryObj } from "@storybook/react-vite";
import { ConsoleTab } from "./ConsoleTab";

const meta = {
  title: "Playground/Code/RunPanel/tabs/ConsoleTab",
  component: ConsoleTab,
} satisfies Meta<typeof ConsoleTab>;

export default meta;
type Story = StoryObj<typeof ConsoleTab>;

const sampleLogs = [
  {
    timestamp: Date.now(),
    level: "info",
    message: "Application started",
    count: 1,
  },
  {
    timestamp: Date.now() + 1000,
    level: "warn",
    message: "Deprecated feature used",
    count: 3,
  },
  {
    timestamp: Date.now() + 2000,
    level: "error",
    message: "Failed to fetch data",
    count: 1,
  },
  {
    timestamp: Date.now() + 3000,
    level: "debug",
    message: "Debug information",
    count: 1,
  },
];

export const Default: Story = {
  args: {
    logs: sampleLogs,
  },
};

export const Empty: Story = {
  args: {
    logs: [],
  },
};
