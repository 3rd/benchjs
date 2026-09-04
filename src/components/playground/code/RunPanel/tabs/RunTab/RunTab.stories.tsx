import type { Meta, StoryObj } from "@storybook/react-vite";
import { createBenchmarkResult } from "@/testing/benchmark-fixtures";
import { RunTab } from "./RunTab";

const meta = {
  title: "Playground/Code/RunPanel/tabs/RunTab",
  component: RunTab,
} satisfies Meta<typeof RunTab>;

export default meta;
type Story = StoryObj<typeof RunTab>;

const mockChartData = [
  { time: 0, timePerOp: 12 },
  { time: 100, timePerOp: 11 },
  { time: 200, timePerOp: 10.5 },
  { time: 300, timePerOp: 10.2 },
  { time: 400, timePerOp: 10.1 },
];

const now = Date.now();

export const Running: Story = {
  args: {
    isRunning: true,
    latestRun: {
      id: "1",
      implementationId: "impl-1",
      createdAt: now,
      warmupStartedAt: now + 100,
      warmupEndedAt: now + 200,
      status: "running",
      progress: 45.5,
      measurementOperations: 455,
      measurementElapsedMs: 4550,
      elapsedTime: 4550,
      error: null,
      result: null,
      filename: "test.js",
      originalCode: "function test() {}",
      processedCode: "function test() {}",
    },
    chartData: mockChartData,
    clearChartData: () => {},
  },
};

export const Completed: Story = {
  args: {
    isRunning: false,
    latestRun: {
      id: "1",
      implementationId: "impl-1",
      createdAt: now,
      warmupStartedAt: now + 100,
      warmupEndedAt: now + 200,
      status: "completed",
      progress: 100,
      measurementOperations: 1000,
      measurementElapsedMs: 10_000,
      elapsedTime: 10_000,
      error: null,
      filename: "test.js",
      originalCode: "function test() {}",
      processedCode: "function test() {}",
      result: createBenchmarkResult("test", {
        operations: 1000,
        blocks: 10,
        elapsedMs: 10_000,
        timePerOperationMs: {
          average: 10,
          median: 10,
          min: 8,
          max: 15,
          percentile50: 10,
          percentile90: 13,
          percentile95: 14,
        },
        operationsPerSecond: {
          average: 100_000,
          min: 66_666,
          max: 125_000,
        },
      }),
    },
    chartData: mockChartData,
    clearChartData: () => {},
  },
};

export const Error: Story = {
  args: {
    isRunning: false,
    latestRun: {
      id: "1",
      implementationId: "impl-1",
      createdAt: now,
      warmupStartedAt: now + 100,
      warmupEndedAt: now + 200,
      status: "failed",
      progress: 45.5,
      measurementOperations: 455,
      measurementElapsedMs: 4550,
      elapsedTime: 4550,
      error: "Failed to execute benchmark: Stack overflow",
      filename: "test.js",
      originalCode: "function test() {}",
      processedCode: "function test() {}",
      result: null,
    },
    chartData: mockChartData,
    clearChartData: () => {},
  },
};

export const Cancelled: Story = {
  args: {
    isRunning: false,
    latestRun: {
      id: "1",
      implementationId: "impl-1",
      createdAt: now,
      warmupStartedAt: now + 100,
      warmupEndedAt: now + 200,
      status: "cancelled",
      progress: 45.5,
      measurementOperations: 455,
      measurementElapsedMs: 4550,
      elapsedTime: 4550,
      error: null,
      filename: "test.js",
      originalCode: "function test() {}",
      processedCode: "function test() {}",
      result: null,
    },
    chartData: mockChartData,
    clearChartData: () => {},
  },
};
