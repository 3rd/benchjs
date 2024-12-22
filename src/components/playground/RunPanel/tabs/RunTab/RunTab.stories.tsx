import type { Meta, StoryObj } from "@storybook/react";
import { RunTab } from "./RunTab";

const meta = {
  title: "Playground/RunPanel/tabs/RunTab",
  component: RunTab,
} satisfies Meta<typeof RunTab>;

export default meta;
type Story = StoryObj<typeof RunTab>;

const mockChartData = [
  { time: 0, timePerOp: 12, iterations: 0 },
  { time: 100, timePerOp: 11, iterations: 100 },
  { time: 200, timePerOp: 10.5, iterations: 200 },
  { time: 300, timePerOp: 10.2, iterations: 300 },
  { time: 400, timePerOp: 10.1, iterations: 400 },
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
      iterations: 455,
      totalIterations: 1000,
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
      iterations: 1000,
      totalIterations: 1000,
      elapsedTime: 10_000,
      error: null,
      filename: "test.js",
      originalCode: "function test() {}",
      processedCode: "function test() {}",
      result: {
        name: "test",
        stats: {
          samples: 1000,
          batches: 10,
          time: {
            total: 10_000,
            average: 10,
            min: 8,
            max: 15,
            percentile50: 10,
            percentile90: 13,
            percentile95: 14,
          },
          opsPerSecond: {
            average: 100_000,
            min: 66_666,
            max: 125_000,
            margin: 0.5,
          },
        },
      },
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
      iterations: 455,
      totalIterations: 1000,
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
