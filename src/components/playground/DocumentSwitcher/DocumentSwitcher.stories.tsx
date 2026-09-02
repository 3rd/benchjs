import type { Meta, StoryObj } from "@storybook/react-vite";
import { DocumentSwitcher } from "./DocumentSwitcher";

const meta = {
  title: "Playground/DocumentSwitcher",
  component: DocumentSwitcher,
  parameters: {
    layout: "centered",
  },
  args: {
    documents: [
      { id: "sorting", title: "Sorting algorithms" },
      { id: "iteration", title: "Array iteration" },
      { id: "untitled", title: "" },
    ],
    currentDocumentId: "sorting",
    currentTitle: "Sorting algorithms",
    onCreate: () => {},
    onDelete: () => {},
    onRename: () => {},
    onSelect: () => {},
  },
} satisfies Meta<typeof DocumentSwitcher>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
