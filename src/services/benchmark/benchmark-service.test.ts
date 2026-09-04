import { createBenchmarkResult } from "@/testing/benchmark-fixtures";
import { useBenchmarkStore } from "@/stores/benchmarkStore";
import type { Implementation } from "@/stores/persistentStore";
import type { BenchmarkResult, WorkerToMainMessage } from "./types";
import { benchmarkService } from "./benchmark-service";

const benchmarkMocks = vi.hoisted(() => ({
  addEventListener: vi.fn(),
  bundleBenchmarkCode: vi.fn(),
  constructWorker: vi.fn(),
  postMessage: vi.fn(),
  terminate: vi.fn(),
}));

vi.mock("../code-processor/bundle-benchmark-code", () => ({
  bundleBenchmarkCode: benchmarkMocks.bundleBenchmarkCode,
}));

vi.mock("./worker?worker", () => ({
  default: class BenchmarkWorkerMock {
    constructor() {
      benchmarkMocks.constructWorker();
    }

    addEventListener = benchmarkMocks.addEventListener;
    postMessage = benchmarkMocks.postMessage;
    terminate = benchmarkMocks.terminate;
  },
}));

const documentMocks = {
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};

const implementations: Implementation[] = [
  { id: "first", filename: "first.ts", content: "export const run = () => 1;" },
  { id: "second", filename: "second.ts", content: "export const run = () => 2;" },
  { id: "third", filename: "third.ts", content: "export const run = () => 3;" },
];

const getRuns = () => Object.values(useBenchmarkStore.getState().runs).flat();

const getLatestRun = (implementationId: string) => {
  const run = useBenchmarkStore.getState().runs[implementationId]?.at(-1);
  if (!run) throw new Error(`Run not found for ${implementationId}`);
  return run;
};

const dispatchWorkerMessage = (message: WorkerToMainMessage, listenerIndex = -1) => {
  const listener = benchmarkMocks.addEventListener.mock.calls.at(listenerIndex)?.[1];
  if (typeof listener !== "function") throw new Error("Worker message listener not found");
  listener({ data: message });
};

type CompleteWorkerMessage = Extract<
  WorkerToMainMessage,
  { type: "complete" }
>;

const createCompleteMessage = (runId: string): CompleteWorkerMessage => {
  return {
    type: "complete",
    result: {
      entries: [createBenchmarkResult(runId)],
      clock: {
        provider: "performance.now",
        method: "performance.now",
        monotonic: true,
        sampleCount: 1,
        minimumPositiveTickMs: 0.001,
        zeroDeltaRateX: 0,
        readPairCostMs: {
          p50: 0.001,
          p99: 0.001,
        },
      },
      durationMs: 1,
      comparisons: [],
    },
    crossOriginIsolated: false,
  };
};

const startBenchmark = async (items: Implementation[]) => {
  const workerStarted = new Promise<void>((resolve) => {
    benchmarkMocks.postMessage.mockImplementationOnce(() => resolve());
  });
  const resultPromise = benchmarkService.runBenchmark("", items);
  await workerStarted;
  return { resultPromise };
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  benchmarkMocks.bundleBenchmarkCode.mockResolvedValue("processed code");
  vi.stubGlobal("document", {
    visibilityState: "visible",
    addEventListener: documentMocks.addEventListener,
    removeEventListener: documentMocks.removeEventListener,
  });
  useBenchmarkStore.setState({
    runs: {},
    runInfoByRunId: {},
    chartData: {},
    consoleLogs: {},
  });
});

afterEach(() => {
  benchmarkService.dispose();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("benchmark cancellation", () => {
  it("cancels every running or warmup run owned by the shared worker", async () => {
    const { resultPromise } = await startBenchmark(implementations);
    useBenchmarkStore.getState().updateRun(getLatestRun("second").id, {
      status: "warmup",
    });

    expect(vi.getTimerCount()).toBe(1);
    benchmarkService.stopBenchmark(getLatestRun("first").id);

    await expect(resultPromise).resolves.toEqual([]);
    expect(getRuns().map((run) => run.status)).toEqual(["cancelled", "cancelled", "cancelled"]);
    expect(benchmarkMocks.terminate).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(documentMocks.addEventListener).toHaveBeenCalledTimes(1);
    expect(documentMocks.removeEventListener).toHaveBeenCalledTimes(1);
    expect(documentMocks.removeEventListener).toHaveBeenCalledWith(
      "visibilitychange",
      documentMocks.addEventListener.mock.calls[0][1],
    );
  });

  it("cancels the active worker batch when the supplied id is outside it", async () => {
    const { resultPromise } = await startBenchmark(implementations.slice(0, 2));

    benchmarkService.stopBenchmark("another-run");

    await expect(resultPromise).resolves.toEqual([]);
    expect(getRuns().map((run) => run.status)).toEqual(["cancelled", "cancelled"]);
    expect(benchmarkMocks.terminate).toHaveBeenCalledTimes(1);
  });

  it("preserves terminal runs when cancelling their active siblings", async () => {
    const { resultPromise } = await startBenchmark(implementations);
    useBenchmarkStore.getState().updateRun(getLatestRun("first").id, {
      status: "completed",
      progress: 100,
    });

    benchmarkService.stopBenchmark(getLatestRun("second").id);

    await expect(resultPromise).resolves.toEqual([]);
    expect(getRuns().map((run) => run.status)).toEqual(["completed", "cancelled", "cancelled"]);
  });

  it("keeps single-run cancellation behavior", async () => {
    const { resultPromise } = await startBenchmark([implementations[0]]);

    benchmarkService.stopBenchmark(getLatestRun("first").id);

    await expect(resultPromise).resolves.toEqual([]);
    expect(getRuns().map((run) => run.status)).toEqual(["cancelled"]);
  });

  it("cancels an affected batch and discards artifacts owned by replaced code", async () => {
    const { resultPromise } = await startBenchmark(
      implementations.slice(0, 2),
    );
    const firstRun = getLatestRun("first");
    const secondRun = getLatestRun("second");
    const completeMessage = createCompleteMessage(firstRun.id);
    const runInfo = {
      clock: completeMessage.result.clock,
      durationMs: completeMessage.result.durationMs,
      comparisons: completeMessage.result.comparisons,
      crossOriginIsolated: completeMessage.crossOriginIsolated,
    };
    const store = useBenchmarkStore.getState();
    store.setRunInfo([firstRun.id, secondRun.id], runInfo);
    store.addChartPoint(firstRun.id, {
      time: 1,
      timePerOp: 1,
    });
    store.addChartPoint(secondRun.id, {
      time: 2,
      timePerOp: 2,
    });
    store.addConsoleLog(firstRun.id, {
      level: "info",
      message: "first",
      timestamp: 1,
      count: 1,
    });
    store.addConsoleLog(secondRun.id, {
      level: "info",
      message: "second",
      timestamp: 2,
      count: 1,
    });

    benchmarkService.discardRunsForImplementations(new Set(["first"]));

    await expect(resultPromise).resolves.toEqual([]);
    const state = useBenchmarkStore.getState();
    expect(state.runs.first).toBeUndefined();
    expect(state.runs.second?.[0].status).toBe("cancelled");
    expect(state.runInfoByRunId[firstRun.id]).toBeUndefined();
    expect(state.runInfoByRunId[secondRun.id]).toEqual(runInfo);
    expect(state.chartData[firstRun.id]).toBeUndefined();
    expect(state.chartData[secondRun.id]).toEqual([
      { time: 2, timePerOp: 2 },
    ]);
    expect(state.consoleLogs[firstRun.id]).toBeUndefined();
    expect(state.consoleLogs[secondRun.id]).toEqual([
      {
        level: "info",
        message: "second",
        timestamp: 2,
        count: 1,
      },
    ]);
    expect(benchmarkMocks.terminate).toHaveBeenCalledTimes(1);
  });

  it("does not restart a stopped session after preprocessing finishes", async () => {
    const bundleResolvers: ((processedCode: string) => void)[] = [];
    benchmarkMocks.bundleBenchmarkCode.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          bundleResolvers.push(resolve);
        }),
    );
    let result: BenchmarkResult[] | null = null;
    const resultPromise = benchmarkService.runBenchmark("", [implementations[0]]);
    resultPromise.then((value) => {
      result = value;
    });
    const run = getLatestRun("first");

    benchmarkService.stopBenchmark(run.id);
    await Promise.resolve();
    const resolveBundle = bundleResolvers.shift();
    if (!resolveBundle) throw new Error("Pending bundle not found");
    resolveBundle("processed code");
    benchmarkMocks.bundleBenchmarkCode.mockResolvedValue("processed code");
    const replacement = await startBenchmark([implementations[1]]);

    expect(result).toEqual([]);
    expect(getLatestRun("first").status).toBe("cancelled");
    expect(getLatestRun("first").processedCode).toBe("");
    expect(benchmarkMocks.constructWorker).toHaveBeenCalledTimes(1);

    benchmarkService.stopBenchmark(getLatestRun("second").id);
    await expect(replacement.resultPromise).resolves.toEqual([]);
  });
});

describe("benchmark session lifecycle", () => {
  it("cancels and settles an active session before starting its replacement", async () => {
    const sessionA = await startBenchmark(implementations.slice(0, 2));
    let sessionAResult: BenchmarkResult[] | null = null;
    sessionA.resultPromise.then((value) => {
      sessionAResult = value;
    });

    const sessionB = await startBenchmark([implementations[2]]);

    expect(sessionAResult).toEqual([]);
    expect(getLatestRun("first").status).toBe("cancelled");
    expect(getLatestRun("second").status).toBe("cancelled");
    expect(getLatestRun("third").status).toBe("running");
    expect(benchmarkMocks.constructWorker).toHaveBeenCalledTimes(2);
    expect(benchmarkMocks.terminate).toHaveBeenCalledTimes(1);

    dispatchWorkerMessage(
      {
        type: "warmupStart",
        runId: getLatestRun("first").id,
      },
      0,
    );
    expect(getLatestRun("first").status).toBe("cancelled");

    benchmarkService.stopBenchmark(getLatestRun("third").id);
    await expect(sessionB.resultPromise).resolves.toEqual([]);
  });

  it("releases the worker and session after completion", async () => {
    const { resultPromise } = await startBenchmark([implementations[0]]);
    const run = getLatestRun("first");

    dispatchWorkerMessage(createCompleteMessage(run.id));

    const results = await resultPromise;
    expect(results.map((result) => result.name)).toEqual([run.id]);
    expect(getLatestRun("first").status).toBe("completed");
    expect(benchmarkMocks.terminate).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(documentMocks.removeEventListener).toHaveBeenCalledTimes(1);
    benchmarkService.dispose();
    expect(benchmarkMocks.terminate).toHaveBeenCalledTimes(1);
  });

  it("fails every active run and releases the worker after an error", async () => {
    const { resultPromise } = await startBenchmark(implementations.slice(0, 2));
    const rejection = expect(resultPromise).rejects.toThrow("worker failed");

    dispatchWorkerMessage({
      type: "error",
      runId: getLatestRun("first").id,
      error: "worker failed",
    });

    await rejection;
    expect(getRuns().map((run) => run.status)).toEqual(["failed", "failed"]);
    expect(benchmarkMocks.terminate).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(documentMocks.removeEventListener).toHaveBeenCalledTimes(1);
    benchmarkService.dispose();
    expect(benchmarkMocks.terminate).toHaveBeenCalledTimes(1);
  });

  it("disposes a session while preprocessing is pending", async () => {
    const bundleResolvers: ((processedCode: string) => void)[] = [];
    benchmarkMocks.bundleBenchmarkCode.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          bundleResolvers.push(resolve);
        }),
    );
    const resultPromise = benchmarkService.runBenchmark("", [implementations[0]]);
    let result: BenchmarkResult[] | null = null;
    resultPromise.then((value) => {
      result = value;
    });

    benchmarkService.dispose();
    await Promise.resolve();
    const resolveBundle = bundleResolvers.shift();
    if (!resolveBundle) throw new Error("Pending bundle not found");
    resolveBundle("processed code");
    benchmarkMocks.bundleBenchmarkCode.mockResolvedValue("processed code");
    const replacement = await startBenchmark([implementations[1]]);

    expect(result).toEqual([]);
    expect(getLatestRun("first").status).toBe("cancelled");
    expect(getLatestRun("first").processedCode).toBe("");
    expect(benchmarkMocks.constructWorker).toHaveBeenCalledTimes(1);

    benchmarkService.stopBenchmark(getLatestRun("second").id);
    await expect(replacement.resultPromise).resolves.toEqual([]);
  });

  it("disposes a session while its worker is running", async () => {
    const { resultPromise } = await startBenchmark([implementations[0]]);

    benchmarkService.dispose();

    await expect(resultPromise).resolves.toEqual([]);
    expect(getLatestRun("first").status).toBe("cancelled");
    expect(benchmarkMocks.terminate).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(documentMocks.removeEventListener).toHaveBeenCalledTimes(1);
  });
});
