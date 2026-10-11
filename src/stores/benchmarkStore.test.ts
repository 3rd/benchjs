import type { BenchmarkRun, ConsoleLog, RunInfo } from "./benchmarkStore";
import { useBenchmarkStore } from "./benchmarkStore";

const createRun = (id: string, implementationId: string) => ({
  id,
  implementationId,
  createdAt: 100,
  warmupStartedAt: null,
  warmupEndedAt: null,
  status: "running",
  filename: `${implementationId}.ts`,
  originalCode: "export const run = () => 1;",
  processedCode: "",
  progress: null,
  elapsedTime: 0,
  measurementOperations: 0,
  measurementElapsedMs: 0,
  error: null,
  result: null,
}) satisfies BenchmarkRun;

describe("benchmark runs", () => {
  it("adds a re-run without mutating the implementation's previous run history", () => {
    const previousRun = createRun("run-1", "example");
    const nextRun = createRun("run-2", "example");
    useBenchmarkStore.setState({ runs: { example: [previousRun] } });
    const previousRuns = useBenchmarkStore.getState().runs.example;

    useBenchmarkStore.getState().addRuns([nextRun]);

    const runs = useBenchmarkStore.getState().runs.example;
    expect(runs).not.toBe(previousRuns);
    expect(runs).toEqual([previousRun, nextRun]);
    expect(previousRuns).toEqual([previousRun]);
  });
});

describe("benchmark console logs", () => {
  it("merges a repeated batch message without mutating the previous log entry", () => {
    const previousLog = { message: "[worker] tick", level: "log", timestamp: 100, count: 2 } satisfies ConsoleLog;
    useBenchmarkStore.setState({ consoleLogs: { "run-1": [previousLog] } });
    const previousLogs = useBenchmarkStore.getState().consoleLogs["run-1"];

    useBenchmarkStore.getState().bulkAddConsoleLogs("run-1", [
      { message: "[worker] tick", level: "log", timestamp: 200, count: 3 },
      { message: "[worker] done", level: "info", timestamp: 300, count: 1 },
    ]);

    expect(useBenchmarkStore.getState().consoleLogs["run-1"]).toEqual([
      { message: "[worker] tick", level: "log", timestamp: 200, count: 5 },
      { message: "[worker] done", level: "info", timestamp: 300, count: 1 },
    ]);
    expect(previousLogs).toEqual([{ message: "[worker] tick", level: "log", timestamp: 100, count: 2 }]);
  });
});

describe("benchmark run information", () => {
  it("associates result context with each run that produced it", () => {
    const info: RunInfo = {
      clock: {
        provider: "performance.now",
        method: "performance.now",
        monotonic: true,
        sampleCount: 100,
        minimumPositiveTickMs: 0.001,
        zeroDeltaRateX: 0,
        readPairCostMs: { p50: 0.001, p99: 0.002 },
      },
      durationMs: 1000,
      comparisons: [],
      crossOriginIsolated: false,
    };

    useBenchmarkStore.setState({ runInfoByRunId: {} });
    useBenchmarkStore.getState().setRunInfo(["run-a", "run-b"], info);

    expect(useBenchmarkStore.getState().runInfoByRunId).toEqual({
      "run-a": info,
      "run-b": info,
    });
    expect(useBenchmarkStore.getState().runInfoByRunId["another-document-run"]).toBeUndefined();
  });
});
