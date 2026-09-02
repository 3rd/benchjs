import type { Meta, StoryObj } from "@storybook/react-vite";
import { FileTree } from "./FileTree";

const meta: Meta<typeof FileTree> = {
  title: "Common/FileTree",
  component: FileTree,
};
export default meta;

type Story = StoryObj<typeof FileTree>;

export const Default: Story = {
  args: {
    item: {
      id: "root",
      name: "root",
      type: "root",
      children: [
        {
          id: "dist",
          name: "dist",
          type: "folder",
          children: [],
        },
        {
          id: "node_modules",
          name: "node_modules",
          type: "folder",
          children: [],
          count: 42,
        },
        {
          id: "src",
          name: "src",
          type: "folder",
          children: [
            {
              id: "main.ts",
              name: "main.ts",
              type: "file",
            },
          ],
        },
      ],
    },
  },
};

export const WithActiveFile: Story = {
  args: {
    ...Default.args,
    activeFileId: "main.ts",
  },
};
