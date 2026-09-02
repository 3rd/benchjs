import type { RunInfo } from "./benchmarkStore";
import { useBenchmarkStore } from "./benchmarkStore";

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
