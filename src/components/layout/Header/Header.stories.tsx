import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@/components/ui/button";
import { Header } from "./Header";

const meta: Meta<typeof Header> = {
  title: "Layout/Header",
  component: Header,
};
export default meta;

type Story = StoryObj<typeof Header>;

export const Default: Story = {
  args: {},
};

export const CustomNav: Story = {
  args: {
    customNav: (
      <Button className="gap-2 w-full sm:w-auto" variant="outline">
        View Source
      </Button>
    ),
  },
};
