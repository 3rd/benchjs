import { useMemo } from "react";
import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { ClockProfile, MeasurementPhase, PairedComparison } from "benchmate";
import { BenchmarkPhase, BenchmarkResult } from "@/services/benchmark/types";

export type BenchmarkStatus = "cancelled" | "completed" | "failed" | "running" | "warmup";

export interface BenchmarkRun {
  id: string;
  implementationId: string;
  createdAt: number;
  warmupStartedAt: number | null;
  warmupEndedAt: number | null;
  status: BenchmarkStatus;
  phase?: BenchmarkPhase | null;
  filename: string;
  originalCode: string;
  processedCode: string;
  // null while warmup/pilot collect evidence (indeterminate); measurement reports 0-100
  progress: number | null;
  elapsedTime: number;
  measurementOperations: number;
  measurementElapsedMs: number;
  error: string | null;
  result: BenchmarkResult | null;
  memoryUsage?: number;
}

export interface ChartDataPoint {
  time: number;
  timePerOp: number;
  phase?: MeasurementPhase | null;
}

export interface ConsoleLog {
  message: string;
  level: "debug" | "error" | "info" | "log" | "warn";
  timestamp: number;
  count: number;
}

export interface RunInfo {
  clock: ClockProfile;
  durationMs: number;
  comparisons: readonly PairedComparison[];
  crossOriginIsolated: boolean;
}

export interface BenchmarkState {
  // implementation runs
  runs: Record<string, BenchmarkRun[]>; // { [implementationId]: BenchmarkRun }
  addRuns: (run: BenchmarkRun[]) => void;
  updateRun: (id: string, data: Partial<Omit<BenchmarkRun, "id">>) => void;
  terminalizeRuns: (
    runIds: ReadonlySet<string>,
    status: "cancelled" | "failed",
    error: string | null,
  ) => void;
  discardRunsForImplementations: (
    implementationIds: ReadonlySet<string>,
  ) => void;
  removeRun: (id: string) => void;

  runInfoByRunId: Record<string, RunInfo>;
  setRunInfo: (runIds: string[], info: RunInfo) => void;

  // chart data
  chartData: Record<string, ChartDataPoint[]>; // { [runId]: ChartDataPoint[] }
  addChartPoint: (runId: string, point: ChartDataPoint) => void;
  setChartData: (runId: string, points: ChartDataPoint[]) => void;
  clearChartData: (runId: string) => void;

  // console logs
  consoleLogs: Record<string, ConsoleLog[]>;
  addConsoleLog: (runId: string, log: ConsoleLog) => void;
  bulkAddConsoleLogs: (runId: string, newLogs: ConsoleLog[]) => void;
}

export const useBenchmarkStore = create<BenchmarkState>()(
  devtools((set) => ({
    // runs
    runs: {},
    addRuns: (runs) =>
      set((state) => {
        const updatedRuns = { ...state.runs };
        for (const run of runs) {
          const updatedImplementationRuns = updatedRuns[run.implementationId] || [];
          updatedImplementationRuns.push(run);
          updatedRuns[run.implementationId] = updatedImplementationRuns;
        }
        return { runs: updatedRuns };
      }),
    updateRun: (id, data) =>
      set((state) => {
        const updatedRuns = { ...state.runs };

        // Find the implementation that contains this run
        for (const [implId, implRuns] of Object.entries(updatedRuns)) {
          const runIndex = implRuns.findIndex((run) => run.id === id);
          if (runIndex !== -1) {
            // Update the specific run
            updatedRuns[implId] = [
              ...implRuns.slice(0, runIndex),
              { ...implRuns[runIndex], ...data },
              ...implRuns.slice(runIndex + 1),
            ];
            break;
          }
        }

        return { runs: updatedRuns };
      }),
    terminalizeRuns: (runIds, status, error) =>
      set((state) => {
        let changed = false;
        const updatedRuns = { ...state.runs };

        for (const [implementationId, implementationRuns] of Object.entries(state.runs)) {
          let updatedImplementationRuns: BenchmarkRun[] | null = null;

          for (let index = 0; index < implementationRuns.length; index += 1) {
            const run = implementationRuns[index];
            if (!runIds.has(run.id)) continue;
            if (run.status !== "running" && run.status !== "warmup") continue;

            updatedImplementationRuns ??= [...implementationRuns];
            updatedImplementationRuns[index] = {
              ...run,
              status,
              progress: null,
              error,
            };
          }

          if (!updatedImplementationRuns) continue;
          updatedRuns[implementationId] = updatedImplementationRuns;
          changed = true;
        }

        return changed ? { runs: updatedRuns } : state;
      }),
    discardRunsForImplementations: (implementationIds) =>
      set((state) => {
        const discardedRunIds = new Set<string>();
        const runs: Record<string, BenchmarkRun[]> = {};
        let changed = false;

        for (const [implementationId, implementationRuns] of Object.entries(
          state.runs,
        )) {
          if (!implementationIds.has(implementationId)) {
            runs[implementationId] = implementationRuns;
            continue;
          }

          changed = true;
          for (const run of implementationRuns) discardedRunIds.add(run.id);
        }

        if (!changed) return state;

        return {
          runs,
          runInfoByRunId: Object.fromEntries(
            Object.entries(state.runInfoByRunId).filter(
              ([runId]) => !discardedRunIds.has(runId),
            ),
          ),
          chartData: Object.fromEntries(
            Object.entries(state.chartData).filter(
              ([runId]) => !discardedRunIds.has(runId),
            ),
          ),
          consoleLogs: Object.fromEntries(
            Object.entries(state.consoleLogs).filter(
              ([runId]) => !discardedRunIds.has(runId),
            ),
          ),
        };
      }),
    removeRun: (id) =>
      set((state) => ({
        runs: Object.fromEntries(Object.entries(state.runs).filter(([key]) => key !== id)),
      })),

    // run-level info
    runInfoByRunId: {},
    setRunInfo: (runIds, info) =>
      set((state) => ({
        runInfoByRunId: {
          ...state.runInfoByRunId,
          ...Object.fromEntries(runIds.map((runId) => [runId, info])),
        },
      })),

    // chart data
    chartData: {},
    addChartPoint: (runId, point) =>
      set((state) => ({
        chartData: {
          ...state.chartData,
          [runId]: [...(state.chartData[runId] || []), point],
        },
      })),
    setChartData: (runId, points) =>
      set((state) => ({
        chartData: {
          ...state.chartData,
          [runId]: points,
        },
      })),
    clearChartData: (runId) =>
      set((state) => ({
        chartData: {
          ...state.chartData,
          [runId]: [],
        },
      })),

    // console logs
    consoleLogs: {},
    addConsoleLog: (runId, log) => {
      return set((state) => {
        const currentLogs = state.consoleLogs[runId] || [];
        const lastLog = currentLogs[currentLogs.length - 1];

        // repeated message
        if (lastLog && lastLog.message === log.message && lastLog.level === log.level) {
          const updatedLog = {
            ...lastLog,
            count: lastLog.count + log.count,
            timestamp: log.timestamp,
          };
          return {
            consoleLogs: {
              ...state.consoleLogs,
              [runId]: [...currentLogs.slice(0, -1), updatedLog],
            },
          };
        }

        // new message
        return {
          consoleLogs: {
            ...state.consoleLogs,
            [runId]: [...currentLogs, { ...log, count: log.count }],
          },
        };
      });
    },
    bulkAddConsoleLogs: (runId: string, newLogs: ConsoleLog[]) =>
      set((state) => {
        const currentLogs = state.consoleLogs[runId] || [];
        const updatedLogs = [...currentLogs];

        for (const log of newLogs) {
          const lastLog = updatedLogs[updatedLogs.length - 1];
          if (lastLog && lastLog.level === log.level && lastLog.message === log.message) {
            lastLog.count += log.count;
            lastLog.timestamp = log.timestamp;
          } else {
            updatedLogs.push({ ...log, count: log.count });
          }
        }

        return {
          consoleLogs: {
            ...state.consoleLogs,
            [runId]: updatedLogs,
          },
        };
      }),
  })),
);

export const useRunsForImplementation = (implementationId: string) => {
  const store = useBenchmarkStore();
  return useMemo(() => {
    return store.runs[implementationId] || [];
  }, [implementationId, store]);
};

export const useLatestRunForImplementation = (implementationId: string) => {
  const runs = useRunsForImplementation(implementationId);
  return useMemo(() => {
    return runs[runs.length - 1] ?? null;
  }, [runs]);
};
