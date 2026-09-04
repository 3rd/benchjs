import type { Meta, StoryObj } from "@storybook/react-vite";
import { ExportModal } from "./ExportModal";

const meta = {
  title: "Components/ExportModal",
  component: ExportModal,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof ExportModal>;

export default meta;
type Story = StoryObj<typeof meta>;

const sampleJson = JSON.stringify(
  {
    results: [
      {
        name: "Implementation A",
        totalTime: 1234,
        opsPerSec: 98_765,
      },
      {
        name: "Implementation B",
        totalTime: 2345,
        opsPerSec: 87_654,
      },
    ],
  },
  null,
  2,
);

export const Default: Story = {
  args: {
    isOpen: true,
    value: sampleJson,
    onOpenChange: () => {},
  },
};

export const Closed: Story = {
  args: {
    isOpen: false,
    value: sampleJson,
    onOpenChange: () => {},
  },
};
