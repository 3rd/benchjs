import type { Meta, StoryObj } from "@storybook/react-vite";
import { createBenchmarkResult } from "@/testing/benchmark-fixtures";
import type { BenchmarkStatus } from "@/stores/benchmarkStore";
import { ShareDialog } from "./ShareDialog";

const mockImplementations = [
  { id: "1", filename: "quicksort.ts", content: "// implementation" },
  { id: "2", filename: "mergesort.ts", content: "// implementation" },
  { id: "3", filename: "bubblesort.ts", content: "// implementation" },
];

const createBenchmarkRun = (id: string, implId: string, filename: string, ops: number) => ({
  id,
  implementationId: implId,
  filename,
  originalCode: "// implementation",
  processedCode: "// processed implementation",
  status: "completed" as BenchmarkStatus,
  progress: 100,
  createdAt: Date.now(),
  warmupStartedAt: Date.now(),
  warmupEndedAt: Date.now(),
  runStartedAt: Date.now(),
  runEndedAt: Date.now(),
  elapsedTime: 1000,
  error: null,
  measurementOperations: 1000,
  measurementElapsedMs: 1000,
  result: createBenchmarkResult(filename, {
    operations: 100,
    operationsPerSecond: { average: ops, max: ops * 1.1, min: ops * 0.9 },
  }),
});

const mockRuns = {
  "1": [createBenchmarkRun("run1", "1", "quicksort.ts", 15_000)],
  "2": [createBenchmarkRun("run2", "2", "mergesort.ts", 12_000)],
};

const meta = {
  title: "Playground/ShareDialog",
  component: ShareDialog,
  parameters: {
    layout: "centered",
  },
  args: {
    open: true,
    onOpenChange: () => {},
    shareUrl: "http://localhost:3000/#code=example",
  },
} satisfies Meta<typeof ShareDialog>;

export default meta;
type Story = StoryObj<typeof ShareDialog>;

export const Default: Story = {
  args: {
    implementations: mockImplementations,
    runs: mockRuns,
  },
};

export const NoRuns: Story = {
  args: {
    implementations: mockImplementations,
    runs: {},
  },
};

export const SingleRun: Story = {
  args: {
    implementations: mockImplementations,
    runs: {
      "1": [createBenchmarkRun("run1", "1", "quicksort.ts", 15_000)],
    },
  },
};
