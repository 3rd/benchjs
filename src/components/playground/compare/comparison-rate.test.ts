import { createBenchmarkResult } from "@/testing/benchmark-fixtures";
import type { BenchmarkRun } from "@/stores/benchmarkStore";
import { getOpsPerSecond } from "./comparison-rate";

const createRun = (overrides: Partial<BenchmarkRun> = {}): BenchmarkRun => ({
  id: "run-1",
  implementationId: "implementation-1",
  createdAt: 100,
  warmupStartedAt: 110,
  warmupEndedAt: 120,
  status: "running",
  filename: "implementation1.ts",
  originalCode: "export const run = () => 1;",
  processedCode: "export default () => 1;",
  progress: null,
  elapsedTime: 4000,
  measurementOperations: 0,
  measurementElapsedMs: 0,
  error: null,
  result: null,
  ...overrides,
});

describe("comparison ops/sec", () => {
  it("rates a running benchmark on its measured blocks, not on wall-clock time", () => {
    const run = createRun({
      status: "running",
      elapsedTime: 4000,
      measurementOperations: 2000,
      measurementElapsedMs: 1000,
    });

    expect(getOpsPerSecond(run)).toBe(2000);
  });

  it("rates a completed benchmark from the reported measurement average", () => {
    const run = createRun({
      status: "completed",
      progress: 100,
      measurementOperations: 2000,
      measurementElapsedMs: 1000,
      result: createBenchmarkResult("implementation1.ts", {
        operationsPerSecond: { average: 1800 },
      }),
    });

    expect(getOpsPerSecond(run)).toBe(1800);
  });

  it("reports no rate while warmup runs before the first measured block", () => {
    const run = createRun({
      status: "warmup",
      elapsedTime: 900,
      measurementOperations: 0,
      measurementElapsedMs: 0,
    });

    expect(getOpsPerSecond(run)).toBe(0);
  });

  it("reports no rate for a cancelled run that produced no result", () => {
    const run = createRun({
      status: "cancelled",
      measurementOperations: 2000,
      measurementElapsedMs: 1000,
    });

    expect(getOpsPerSecond(run)).toBe(0);
  });
});
