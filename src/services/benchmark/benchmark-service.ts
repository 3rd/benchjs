import { BenchmarkOptions } from "benchmate";
import { nanoid } from "nanoid";
import { serializeError } from "serialize-error";
import { useBenchmarkStore } from "@/stores/benchmarkStore";
import { getCurrentDocument, Implementation, usePersistentStore } from "@/stores/persistentStore";
import { benchmark, features } from "@/config";
import { bundleBenchmarkCode } from "../code-processor/bundle-benchmark-code";
import { BenchmarkResult, WorkerToMainMessage } from "./types";
import BenchmarkWorker from "./worker?worker";

let worker: Worker | null = null;
let activeCleanup: (() => void) | null = null;

const stopBenchmark = (runId: string): void => {
  const store = useBenchmarkStore.getState();
  if (worker) {
    worker.terminate();
    worker = null;
  }
  activeCleanup?.();
  activeCleanup = null;

  store.updateRun(runId, {
    status: "cancelled",
    progress: null,
    error: null,
  });
};

const getMemoryUsage = async () => {
  if (
    typeof performance !== "undefined" &&
    "measureUserAgentSpecificMemory" in performance &&
    self.crossOriginIsolated
  ) {
    try {
      const memResult = await performance.measureUserAgentSpecificMemory();
      return memResult.bytes;
    } catch (error) {
      console.error("Failed to measure memory:", error);
    }
  }
  return 0;
};

export const benchmarkService = {
  async runBenchmark(
    setupCode: string,
    implementations: Implementation[],
    runnerOptions?: BenchmarkOptions,
  ): Promise<BenchmarkResult[]> {
    const libraries = getCurrentDocument(usePersistentStore.getState()).libraries;
    // eslint-disable-next-line no-async-promise-executor
    return new Promise(async (resolve, reject) => {
      // background tabs throttle timers and distort measurements
      const handleVisibilityChange = () => {
        if (document.visibilityState !== "hidden") return;
        const store = useBenchmarkStore.getState();
        for (const implementationRuns of Object.values(store.runs)) {
          const latest = implementationRuns[implementationRuns.length - 1];
          if (latest && (latest.status === "running" || latest.status === "warmup")) {
            store.addConsoleLog(latest.id, {
              level: "warn",
              message: "[benchmate] page hidden during the run; background throttling can distort results",
              timestamp: Date.now(),
              count: 1,
            });
          }
        }
      };
      // the worker's benchmark loop starves its own timers (microtask-chained
      // awaits), so the run clock ticks here; progress fractions come from the
      // worker's real progress events
      const taskWallStarts = new Map<string, number>();
      const finishedTasks = new Set<string>();
      let heartbeat: ReturnType<typeof setInterval> | undefined;

      const teardown = () => {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
        if (heartbeat) clearInterval(heartbeat);
      };

      try {
        const store = useBenchmarkStore.getState();
        const totalIterations =
          runnerOptions && typeof runnerOptions.iterations === "number" ? runnerOptions.iterations : 0;

        // create runs
        const runs = implementations.map((implementation) => ({
          id: nanoid(),
          implementationId: implementation.id,
          createdAt: Date.now(),
          warmupStartedAt: null,
          warmupEndedAt: null,
          status: "running" as const,
          filename: implementation.filename,
          originalCode: implementation.content,
          processedCode: "",
          progress: null,
          elapsedTime: 0,
          completedIterations: 0,
          totalIterations,
          error: null,
          result: null,
        }));
        store.addRuns(runs);

        // pre-processing
        const processedRuns = await Promise.all(
          runs.map(async (run) => {
            try {
              const processedCode = await bundleBenchmarkCode(
                run.originalCode,
                setupCode,
                libraries,
              );
              store.updateRun(run.id, {
                processedCode,
              });
              return {
                runId: run.id,
                processedCode,
                success: true,
              };
            } catch (error) {
              store.updateRun(run.id, {
                status: "failed",
                error: serializeError(error).message || "Failed to process code",
              });
              return {
                runId: run.id,
                processedCode: "",
                success: false,
                error: serializeError(error).message,
              };
            }
          }),
        );

        // bail if any pre-processing failed
        const hasProcessingError = processedRuns.some((r) => !r.success);
        if (hasProcessingError) {
          const remainingRuns = processedRuns.filter((r) => r.success);
          for (const run of remainingRuns) {
            store.updateRun(run.runId, {
              status: "failed",
              error: "Cancelled due to errors in other implementations",
            });
          }
          reject(new Error("Failed to process one or more implementations"));
          return;
        }

        // setup worker
        if (worker) worker.terminate();
        activeCleanup?.();
        activeCleanup = teardown;
        worker = new BenchmarkWorker();
        document.addEventListener("visibilitychange", handleVisibilityChange);
        heartbeat = setInterval(() => {
          const now = Date.now();
          for (const [runId, startedAt] of taskWallStarts) {
            if (finishedTasks.has(runId)) continue;
            store.updateRun(runId, { elapsedTime: now - startedAt });
          }
        }, 200);

        worker.addEventListener("message", (event: MessageEvent<WorkerToMainMessage>) => {
          const message = event.data;

          switch (message.type) {
            case "warmupStart": {
              store.updateRun(message.runId, {
                status: "warmup",
                warmupStartedAt: Date.now(),
              });
              store.addConsoleLog(message.runId, {
                level: "info",
                message: "[benchmate] Warmup started",
                timestamp: Date.now(),
                count: 1,
              });
              break;
            }
            case "warmupEnd": {
              store.updateRun(message.runId, {
                status: "running",
                warmupEndedAt: Date.now(),
              });
              store.addConsoleLog(message.runId, {
                level: "info",
                message: "[benchmate] Warmup ended",
                timestamp: Date.now(),
                count: 1,
              });
              break;
            }
            case "progress": {
              store.updateRun(message.runId, {
                progress: message.measurementFraction === null ? null : message.measurementFraction * 100,
                elapsedTime: message.elapsedTime,
                completedIterations: message.iterationsCompleted,
                totalIterations: message.totalIterations,
                phase: message.phase ?? null,
              });

              // record chart data on every progress event
              if (message.iterationsCompleted > 0 && message.timePerOp > 0) {
                store.addChartPoint(message.runId, {
                  time: message.elapsedTime,
                  timePerOp: message.timePerOp,
                  iterations: message.iterationsCompleted,
                  phase: message.phase ?? null,
                });
              }
              break;
            }
            case "complete": {
              const runInfo = {
                clock: message.result.clock,
                durationMs: message.result.durationMs,
                comparisons: message.result.comparisons,
                crossOriginIsolated: message.crossOriginIsolated,
              };
              const runIds = message.result.entries
                .filter((entry) => entry.taskType === "call")
                .map((entry) => entry.name);
              store.setRunInfo(runIds, runInfo);

              const callEntries: BenchmarkResult[] = [];
              for (const entry of message.result.entries) {
                if (entry.taskType !== "call") continue;
                callEntries.push(entry);
                store.updateRun(entry.name, {
                  status: "completed",
                  progress: 100,
                  result: entry,
                });

                // replace the coalesced live chart with the complete per-block evidence trace
                const observations = entry.evidence.observations;
                if (observations.length > 0) {
                  const startedAt = observations[0].startedAtMs;
                  let cumulativeOps = 0;
                  const points = [];
                  for (const observation of observations) {
                    cumulativeOps += observation.operations;
                    if (observation.operations <= 0 || observation.elapsedMs <= 0) continue;
                    points.push({
                      time: observation.startedAtMs - startedAt + observation.elapsedMs,
                      timePerOp: observation.elapsedMs / observation.operations,
                      iterations: cumulativeOps,
                      phase: observation.phase,
                    });
                  }
                  if (points.length > 0) store.setChartData(entry.name, points);
                }
                store.addConsoleLog(entry.name, {
                  level: "info",
                  message: `[benchmate] Run completed: ${entry.evidence.status}`,
                  timestamp: Date.now(),
                  count: 1,
                });
                if (features.memory.enabled) {
                  (async () => {
                    const memoryUsage = await getMemoryUsage();
                    store.updateRun(entry.name, { memoryUsage });
                  })();
                }
              }

              teardown();
              resolve(callEntries);
              break;
            }
            case "evidenceStatus": {
              const reasons = message.reasons.length > 0 ? `: ${message.reasons.join("; ")}` : "";
              store.addConsoleLog(message.runId, {
                level: message.status === "complete" ? "info" : "warn",
                message: `[benchmate] Evidence ${message.status}${reasons}`,
                timestamp: Date.now(),
                count: 1,
              });
              break;
            }
            case "error": {
              store.updateRun(message.runId, {
                status: "failed",
                error: message.error,
              });
              store.addConsoleLog(message.runId, {
                level: "error",
                message: `[benchmate] ${message.error}`,
                timestamp: Date.now(),
                count: 1,
              });
              teardown();
              reject(new Error(message.error));
              break;
            }
            case "consoleBatch": {
              store.bulkAddConsoleLogs(
                message.runId,
                message.logs.map((log) => ({
                  level: log.level,
                  message: `[worker] ${log.message}`,
                  timestamp: Date.now(),
                  count: log.count,
                })),
              );
              break;
            }
            case "taskStart": {
              taskWallStarts.set(message.runId, Date.now());
              store.addConsoleLog(message.runId, {
                message: `[benchmate] Task started: ${message.runId}`,
                level: "info",
                timestamp: Date.now(),
                count: 1,
              });
              break;
            }
            case "setup": {
              store.addConsoleLog(message.runId, {
                message: "[benchmate] Task setup completed",
                level: "info",
                timestamp: Date.now(),
                count: 1,
              });
              break;
            }
            case "teardown": {
              store.addConsoleLog(message.runId, {
                message: "[benchmate] Teardown",
                level: "info",
                timestamp: Date.now(),
                count: 1,
              });
              break;
            }
            case "phase": {
              store.updateRun(message.runId, { phase: message.phase });
              store.addConsoleLog(message.runId, {
                message: `[benchmate] Phase: ${message.phase}`,
                level: "info",
                timestamp: Date.now(),
                count: 1,
              });
              break;
            }
            case "taskComplete": {
              finishedTasks.add(message.runId);
              store.updateRun(message.runId, {
                elapsedTime: message.elapsedTime,
                phase: null,
              });
              store.addConsoleLog(message.runId, {
                message: `[benchmate] Task completed: ${message.runId}`,
                level: "info",
                timestamp: Date.now(),
                count: 1,
              });
              break;
            }
            default: {
              console.error("Unknown message type:", message);
              break;
            }
          }
        });

        // start benchmark
        worker.postMessage({
          type: "start",
          runs: processedRuns.map((run) => ({
            runId: run.runId,
            processedCode: run.processedCode,
          })),
          options: runnerOptions,
        });
      } catch (error) {
        teardown();
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        reject(error);
      }
    });
  },
  stopBenchmark,
};
