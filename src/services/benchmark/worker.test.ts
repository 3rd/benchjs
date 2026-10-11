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

const nativeConsoleMethods = {
  log: console.log,
  warn: console.warn,
  error: console.error,
  info: console.info,
  debug: console.debug,
};

afterEach(() => {
  Object.assign(console, nativeConsoleMethods);
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

it("forwards console output from module evaluation to its run before tasks start", async () => {
  const handlers: Record<string, (event: BenchEvents["taskStart"]) => void> = {};
  benchMocks.on.mockImplementation((event: string, handler: (event: BenchEvents["taskStart"]) => void) => {
    handlers[event] = handler;
  });
  benchMocks.run.mockImplementationOnce(() => {
    handlers.taskStart({ task: "run-1" });
  });
  vi.spyOn(URL, "createObjectURL")
    .mockReturnValueOnce(`data:text/javascript,${encodeURIComponent('console.log("setup ran"); export default () => 1;')}`)
    .mockReturnValueOnce(`data:text/javascript,${encodeURIComponent('console.log("setup ran"); export default () => 2;')}`);
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const { listener, postMessage } = await startWorker();

  await listener({
    data: {
      type: "start",
      runs: [
        { runId: "run-1", processedCode: "" },
        { runId: "run-2", processedCode: "" },
      ],
    },
  });

  expect(postMessage.mock.calls.slice(0, 3).map(([message]) => message)).toEqual([
    { type: "consoleBatch", runId: "run-1", logs: [{ level: "log", message: "setup ran", count: 1 }] },
    { type: "consoleBatch", runId: "run-2", logs: [{ level: "log", message: "setup ran", count: 1 }] },
    { type: "taskStart", runId: "run-1" },
  ]);
});

it("logs errors, collections, undefined, functions, and symbols as readable text", async () => {
  const handlers: Record<string, (event: BenchEvents["taskStart"]) => void> = {};
  benchMocks.on.mockImplementation((event: string, handler: (event: BenchEvents["taskStart"]) => void) => {
    handlers[event] = handler;
  });
  benchMocks.run.mockImplementationOnce(() => {
    handlers.taskStart({ task: "run-1" });

    const parse = () => 1;
    console.log("text", new Error("boom"), undefined, NaN, new Map([[1, "a"]]), new Set([3]), () => 1, parse, Symbol("s"), {
      a: 1,
    });
  });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("data:text/javascript,export%20default%20()%20%3D%3E%201%3B");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const { listener, postMessage } = await startWorker();

  await listener({ data: { type: "start", runs: [{ runId: "run-1", processedCode: "" }] } });

  expect(postMessage).toHaveBeenCalledWith({
    type: "consoleBatch",
    runId: "run-1",
    logs: [
      {
        level: "log",
        message:
          'text Error: boom undefined NaN Map(1) {1 => "a"} Set(1) {3} [Function] [Function: parse] Symbol(s) {"a":1}',
        count: 1,
      },
    ],
  });
});

it("completes the run when logged values contain cycles, BigInts, or throwing getters", async () => {
  const handlers: Record<string, (event: BenchEvents["taskStart"]) => void> = {};
  benchMocks.on.mockImplementation((event: string, handler: (event: BenchEvents["taskStart"]) => void) => {
    handlers[event] = handler;
  });
  benchMocks.run.mockImplementationOnce(() => {
    handlers.taskStart({ task: "run-1" });

    const node: Record<string, unknown> = { name: "n" };
    node.self = node;
    const shared = { x: 1 };
    const loop = new Map<string, unknown>();
    loop.set("self", loop);
    const hostile = {
      get broken() {
        throw new Error("getter");
      },
    };

    console.log(node, { a: shared, b: shared }, 10n, { n: 1n }, hostile, loop);
  });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("data:text/javascript,export%20default%20()%20%3D%3E%201%3B");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const { listener, postMessage } = await startWorker();

  await listener({ data: { type: "start", runs: [{ runId: "run-1", processedCode: "" }] } });

  expect(postMessage).toHaveBeenCalledWith({
    type: "consoleBatch",
    runId: "run-1",
    logs: [
      {
        level: "log",
        message:
          '{"name":"n","self":"[Circular]"} {"a":{"x":1},"b":{"x":1}} 10n {"n":"1n"} [Unserializable] Map(1) {"self" => [Circular]}',
        count: 1,
      },
    ],
  });
  expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "complete" }));
});

it("keeps the first 1000 console entries of a run and counts later messages as omitted", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(0);

  const handlers: Record<string, (event: BenchEvents["taskStart"]) => void> = {};
  benchMocks.on.mockImplementation((event: string, handler: (event: BenchEvents["taskStart"]) => void) => {
    handlers[event] = handler;
  });
  benchMocks.run.mockImplementationOnce(() => {
    handlers.taskStart({ task: "run-1" });

    for (let repeat = 0; repeat < 3; repeat++) {
      console.log("same");
    }

    for (let index = 0; index < 1005; index++) {
      console.log(index);
    }
  });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("data:text/javascript,export%20default%20()%20%3D%3E%201%3B");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const { listener, postMessage } = await startWorker();

  await listener({ data: { type: "start", runs: [{ runId: "run-1", processedCode: "" }] } });

  expect(postMessage).toHaveBeenCalledWith({
    type: "consoleBatch",
    runId: "run-1",
    logs: [
      { level: "log", message: "same", count: 3 },
      ...Array.from({ length: 999 }, (_, index) => ({ level: "log", message: String(index), count: 1 })),
      { level: "warn", message: "Message omitted: console capture keeps the first 1000 entries per run", count: 6 },
    ],
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
