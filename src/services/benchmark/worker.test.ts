import type { BenchEvents } from "benchmate";
import type { MainToWorkerMessage, WorkerToMainMessage } from "./types";

const benchMocks = vi.hoisted(() => ({
  on: vi.fn(),
  add: vi.fn(),
  run: vi.fn(),
}));

vi.mock("benchmate", () => ({
  Bench: class BenchMock {
    on = benchMocks.on;
    add = benchMocks.add;
    run = benchMocks.run;
  },
  blackhole: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

const startWorker = async () => {
  const messageListeners: ((event: { data: MainToWorkerMessage }) => Promise<void>)[] = [];
  const postMessage = vi.fn<(message: WorkerToMainMessage) => void>();
  const addEventListener = vi.fn(
    (type: string, listener: (event: { data: MainToWorkerMessage }) => Promise<void>) => {
      if (type === "message") messageListeners.push(listener);
    },
  );
  vi.stubGlobal("self", { addEventListener, postMessage });
  await import("./worker");
  const listener = messageListeners[0];
  if (!listener) throw new Error("Worker message listener not found");
  return { listener, postMessage };
};

it("revokes a benchmark module URL when importing it fails", async () => {
  const blobUrl = "data:text/javascript,throw%20new%20Error(%22import%20failed%22)";
  vi.spyOn(URL, "createObjectURL").mockReturnValue(blobUrl);
  const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const { listener, postMessage } = await startWorker();

  await listener({
    data: {
      type: "start",
      runs: [{ runId: "run-1", processedCode: "invalid module" }],
    },
  });

  expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  expect(revokeObjectURL).toHaveBeenCalledWith(blobUrl);
  expect(postMessage).toHaveBeenCalledWith({
    type: "error",
    runId: "run-1",
    error: "import failed",
  });
});

it("reports measurement counters that exclude warmup and outlive the measurement phase", async () => {
  const progressHandlers: ((progress: BenchEvents["progress"]) => void)[] = [];
  benchMocks.on.mockImplementation((event: string, handler: (progress: BenchEvents["progress"]) => void) => {
    if (event === "progress") progressHandlers.push(handler);
  });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("data:text/javascript,export default () => 1");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const clock = vi.spyOn(Date, "now").mockReturnValue(0);
  const { listener, postMessage } = await startWorker();

  await listener({
    data: {
      type: "start",
      runs: [{ runId: "run-1", processedCode: "export default () => 1;" }],
    },
  });
  const reportProgress = progressHandlers[0];
  if (!reportProgress) throw new Error("Progress handler not registered");

  clock.mockReturnValue(1000);
  reportProgress({
    task: "run-1",
    phase: "warmup",
    physicalBlocksCompleted: 1,
    physicalBlocksPlanned: null,
    operationsCompleted: 500,
    elapsedTimeMs: 100,
    maxTimeMs: 5000,
  });
  clock.mockReturnValue(2000);
  reportProgress({
    task: "run-1",
    phase: "measurement",
    physicalBlocksCompleted: 1,
    physicalBlocksPlanned: 4,
    operationsCompleted: 200,
    elapsedTimeMs: 50,
    maxTimeMs: 5000,
  });
  clock.mockReturnValue(3000);
  reportProgress({
    task: "run-1",
    phase: "assessment",
    physicalBlocksCompleted: 1,
    physicalBlocksPlanned: null,
    operationsCompleted: 10,
    elapsedTimeMs: 5,
    maxTimeMs: 5000,
  });

  const measurementCounters = postMessage.mock.calls
    .map(([message]) => message)
    .filter((message) => message.type === "progress")
    .map(({ phase, measurementOperations, measurementElapsedMs }) => ({
      phase,
      measurementOperations,
      measurementElapsedMs,
    }));

  expect(measurementCounters).toEqual([
    { phase: "warmup", measurementOperations: 0, measurementElapsedMs: 0 },
    {
      phase: "measurement",
      measurementOperations: 200,
      measurementElapsedMs: 50,
    },
    {
      phase: "assessment",
      measurementOperations: 200,
      measurementElapsedMs: 50,
    },
  ]);
});

it("reports timer-limited fixed progress as indeterminate", async () => {
  const progressHandlers: ((progress: BenchEvents["progress"]) => void)[] = [];
  benchMocks.on.mockImplementation((event: string, handler: (progress: BenchEvents["progress"]) => void) => {
    if (event === "progress") progressHandlers.push(handler);
  });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("data:text/javascript,export default () => 1");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(Date, "now").mockReturnValue(100);
  const { listener, postMessage } = await startWorker();

  await listener({
    data: {
      type: "start",
      runs: [{ runId: "run-1", processedCode: "export default () => 1;" }],
    },
  });
  const reportProgress = progressHandlers[0];
  if (!reportProgress) throw new Error("Progress handler not registered");

  reportProgress({
    task: "run-1",
    tasksCompleted: 0,
    tasksTotal: 1,
    iterationsCompleted: 0,
    iterationsTotal: 0,
    elapsedTimeMs: 0,
  });

  expect(postMessage).toHaveBeenCalledWith({
    type: "progress",
    runId: "run-1",
    measurementFraction: null,
    elapsedTime: 0,
    measurementOperations: 0,
    measurementElapsedMs: 0,
    timePerOp: 0,
    phase: "measurement",
  });
});
