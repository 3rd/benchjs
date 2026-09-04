/* eslint-disable no-await-in-loop */
declare const self: DedicatedWorkerGlobalScope;
import { Bench, BenchmarkOptions, blackhole } from "benchmate";
import { serializeError } from "serialize-error";
import { benchmark } from "@/config";
import { MainToWorkerMessage, WorkerToMainMessage } from "./types";

const log = console.log;

const CONSOLE_FLUSH_INTERVAL_MS = 500;
// auto mode emits one progress event per measured block (thousands per second for
// fast tasks) and fixed mode one per whole percent; forwarding each one floods the
// main thread, so updates are coalesced
const PROGRESS_UPDATE_INTERVAL_MS = 100;

// fixed time mode completes with a batch-t interval on every machine; auto mode's
// pilot dependence hunt cannot finish within its own budget under correlated
// browser noise (boost clocks, GC) and ends dependence-unresolved instead
const DEFAULT_OPTIONS: BenchmarkOptions = {
  timeMs: benchmark.fixedTimeMs,
  method: "auto",
  quiet: true,
};

interface LogEntry {
  level: "debug" | "error" | "info" | "log" | "warn";
  message: string;
  count: number;
}

// console logging batching
let currentRunId: string | null = null;
let lastFlushTimestamp = 0;
const logsBuffer: LogEntry[] = [];
const flushLogs = (force = false) => {
  if (logsBuffer.length === 0 || !currentRunId) return;
  const now = Date.now();
  if (!force && now - lastFlushTimestamp < CONSOLE_FLUSH_INTERVAL_MS) return;

  self.postMessage({
    type: "consoleBatch",
    runId: currentRunId,
    logs: [...logsBuffer],
  });

  logsBuffer.length = 0;
  lastFlushTimestamp = now;
};

// patch console methods
const patchConsole = (runId: string, prevent = false) => {
  currentRunId = runId;
  const methods = ["log", "warn", "error", "info", "debug"] as const;

  for (const level of methods) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (console[level] as any) = function (...args: unknown[]) {
      if (prevent) return;

      const message = args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" ");

      const lastLog = logsBuffer[logsBuffer.length - 1];
      if (lastLog && lastLog.level === level && lastLog.message === message) {
        lastLog.count = lastLog.count + 1;
      } else {
        logsBuffer.push({ level, message, count: 1 });
      }
      flushLogs();
    };
  }
};

const postMessage = (message: WorkerToMainMessage) => {
  self.postMessage(message);
};

// benchmate progress counters cover one phase at a time and reset when the phase
// changes; TaskTracker folds them into one task-wide timeline and adds wall-clock timing
interface TaskTracker {
  startedAt: number;
  phase: string | null;
  finishedPhasesMs: number;
  finishedPhasesOps: number;
  finishedMeasurementMs: number;
  finishedMeasurementOps: number;
  phaseMs: number;
  phaseOps: number;
  lastUpdateSentAt: number;
  lastSentMeasuredMs: number;
  lastSentOps: number;
}

const handleStartRuns = async (
  runs: { runId: string; processedCode: string }[],
  options: BenchmarkOptions = DEFAULT_OPTIONS,
) => {
  try {
    // the blackhole source transform references this global so bundled user
    // modules can consume discarded expression values without importing benchmate
    (globalThis as Record<string, unknown>).__benchmateBlackhole = blackhole;

    const trackers = new Map<string, TaskTracker>();
    const getTracker = (runId: string): TaskTracker => {
      let tracker = trackers.get(runId);
      if (!tracker) {
        tracker = {
          startedAt: Date.now(),
          phase: null,
          finishedPhasesMs: 0,
          finishedPhasesOps: 0,
          finishedMeasurementMs: 0,
          finishedMeasurementOps: 0,
          phaseMs: 0,
          phaseOps: 0,
          lastUpdateSentAt: 0,
          lastSentMeasuredMs: 0,
          lastSentOps: 0,
        };
        trackers.set(runId, tracker);
      }
      return tracker;
    };

    const runner = new Bench(options);

    runner.on("taskStart", ({ task: runId }) => {
      getTracker(runId);
      // patch globals
      patchConsole(runId);
      postMessage({ type: "taskStart", runId });
    });

    runner.on("taskPhaseStart", ({ task: runId, phase }) => {
      postMessage({ type: "phase", runId, phase });
      if (phase === "warmup") postMessage({ type: "warmupStart", runId });
    });

    runner.on("taskPhaseEnd", ({ task: runId, phase }) => {
      if (phase === "warmup") postMessage({ type: "warmupEnd", runId });
    });

    runner.on("taskEvidenceStatus", ({ task: runId, status, reasons }) => {
      postMessage({ type: "evidenceStatus", runId, status, reasons: [...reasons] });
    });

    runner.on("progress", (progress) => {
      const tracker = getTracker(progress.task);
      const now = Date.now();

      if ("iterationsTotal" in progress) {
        // fixed mode: intermediate events fire per whole percent during measurement,
        // with counters covering the measurement phase only
        if (now - tracker.lastUpdateSentAt < PROGRESS_UPDATE_INTERVAL_MS) return;
        tracker.lastUpdateSentAt = now;
        const timePerOp =
          progress.iterationsCompleted > 0 ? progress.elapsedTimeMs / progress.iterationsCompleted : 0;
        postMessage({
          type: "progress",
          runId: progress.task,
          measurementFraction: progress.iterationsCompleted / progress.iterationsTotal,
          elapsedTime: now - tracker.startedAt,
          measurementOperations: progress.iterationsCompleted,
          measurementElapsedMs: progress.elapsedTimeMs,
          timePerOp,
          phase: "measurement",
        });
        return;
      }

      // auto mode: fold per-phase counters into task-wide totals; a counter that
      // moved backward means benchmate reset it on a phase change
      if (tracker.phase !== progress.phase || progress.elapsedTimeMs < tracker.phaseMs) {
        tracker.finishedPhasesMs += tracker.phaseMs;
        tracker.finishedPhasesOps += tracker.phaseOps;
        if (tracker.phase === "measurement") {
          tracker.finishedMeasurementMs += tracker.phaseMs;
          tracker.finishedMeasurementOps += tracker.phaseOps;
        }
        tracker.phase = progress.phase;
      }
      tracker.phaseMs = progress.elapsedTimeMs;
      tracker.phaseOps = progress.operationsCompleted;

      if (now - tracker.lastUpdateSentAt < PROGRESS_UPDATE_INTERVAL_MS) return;
      tracker.lastUpdateSentAt = now;

      const measuredTime = tracker.finishedPhasesMs + progress.elapsedTimeMs;
      const totalOps = tracker.finishedPhasesOps + progress.operationsCompleted;
      // marginal rate since the last forwarded update: cumulative averaging would
      // drag warmup samples into the measurement phase and never flatten
      const deltaMs = measuredTime - tracker.lastSentMeasuredMs;
      const deltaOps = totalOps - tracker.lastSentOps;
      let timePerOp = 0;
      if (deltaOps > 0 && deltaMs > 0) timePerOp = deltaMs / deltaOps;
      else if (totalOps > 0) timePerOp = measuredTime / totalOps;
      tracker.lastSentMeasuredMs = measuredTime;
      tracker.lastSentOps = totalOps;

      // warmup and pilot have no known final count; only measurement reports a
      // determinate fraction from the locked physical block plan
      const measurementFraction =
        progress.phase === "measurement" && progress.physicalBlocksPlanned ?
          progress.physicalBlocksCompleted / progress.physicalBlocksPlanned
        : null;

      const inMeasurement = progress.phase === "measurement";

      postMessage({
        type: "progress",
        runId: progress.task,
        measurementFraction,
        elapsedTime: now - tracker.startedAt,
        measurementOperations:
          tracker.finishedMeasurementOps + (inMeasurement ? progress.operationsCompleted : 0),
        measurementElapsedMs: tracker.finishedMeasurementMs + (inMeasurement ? progress.elapsedTimeMs : 0),
        timePerOp,
        phase: progress.phase,
      });
    });

    runner.on("setup", ({ task: runId }) => {
      postMessage({ type: "setup", runId });
    });

    runner.on("teardown", ({ task: runId }) => {
      postMessage({ type: "teardown", runId });
    });

    runner.on("taskComplete", (result) => {
      // final console flush for task
      flushLogs(true);
      const tracker = trackers.get(result.name);
      postMessage({
        type: "taskComplete",
        runId: result.name,
        elapsedTime: tracker ? Date.now() - tracker.startedAt : 0,
      });
    });

    // load benchmark modules
    for (const run of runs) {
      const blob = new Blob([run.processedCode], { type: "text/javascript" });
      const blobUrl = URL.createObjectURL(blob);
      try {
        const module = await import(/* @vite-ignore */ blobUrl);
        const benchmarkFn = module.default;
        if (typeof benchmarkFn !== "function") {
          log("Invalid benchmark function:", { benchmarkFn, run });
          throw new TypeError("Benchmark code must return a function");
        }
        runner.add(run.runId, benchmarkFn as () => void);
      } finally {
        URL.revokeObjectURL(blobUrl);
      }
    }

    // run benchmark and post the complete result without a browser-only shape
    const result = await runner.run();
    flushLogs(true);
    postMessage({
      type: "complete",
      result,
      crossOriginIsolated: self.crossOriginIsolated,
    });
  } catch (error) {
    // send errors
    for (const run of runs) {
      postMessage({
        type: "error",
        runId: run.runId,
        error: serializeError(error).message || "Unknown error",
      });
    }
  }
};

self.addEventListener("message", async (event: MessageEvent<MainToWorkerMessage>) => {
  const message = event.data;

  // eslint-disable-next-line sonarjs/no-small-switch
  switch (message.type) {
    case "start": {
      await handleStartRuns(message.runs, message.options);
      break;
    }
    default: {
      console.error("Unknown message type:", message);
      break;
    }
  }
});
