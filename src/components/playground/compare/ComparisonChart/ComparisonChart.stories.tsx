import { createBenchmarkResult } from "@/testing/benchmark-fixtures";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { BenchmarkStatus } from "@/stores/benchmarkStore";
import { ComparisonChart } from "./ComparisonChart";

const meta = {
  title: "Playground/Compare/ComparisonChart",
  component: ComparisonChart,
} satisfies Meta<typeof ComparisonChart>;

export default meta;
type Story = StoryObj<typeof meta>;

const mockImplementations = [
  {
    id: "1",
    filename: "implementation1.ts",
    content: 'console.log("test")',
  },
  {
    id: "2",
    filename: "implementation2.ts",
    content: 'console.log("test2")',
  },
];

const now = Date.now();

const mockRuns = {
  "1": [
    {
      id: "run1",
      implementationId: "1",
      status: "completed" as BenchmarkStatus,
      filename: "implementation1.ts",
      originalCode: 'console.log("test")',
      processedCode: 'console.log("test")',
      elapsedTime: 1000,
      completedIterations: 100_000,
      totalIterations: 1000,
      progress: 100,
      createdAt: now,
      warmupStartedAt: now + 100,
      warmupEndedAt: now + 200,
      error: null,
      result: createBenchmarkResult("implementation1.ts", {
        operations: 100,
        operationsPerSecond: { average: 200 },
      }),
    },
  ],
  "2": [
    {
      id: "run2",
      implementationId: "2",
      status: "running" as BenchmarkStatus,
      filename: "implementation2.ts",
      originalCode: 'console.log("test2")',
      processedCode: 'console.log("test2")',
      elapsedTime: 500,
      completedIterations: 500,
      totalIterations: 1000,
      progress: 50,
      createdAt: now,
      warmupStartedAt: now + 100,
      warmupEndedAt: null,
      error: null,
      result: createBenchmarkResult("implementation2.ts", {
        operations: 50,
        blocks: 5,
        elapsedMs: 500,
        timePerOperationMs: { min: 450, max: 550, average: 500, median: 500, percentile50: 500, percentile90: 525, percentile95: 537 },
        operationsPerSecond: { average: 1500, max: 550, min: 450 },
      }),
    },
  ],
};

export const Default: Story = {
  args: {
    implementations: mockImplementations,
    runs: mockRuns,
  },
};
