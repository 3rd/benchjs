import type { BenchmarkRun } from "@/stores/benchmarkStore";

// benchmate pools measurement-phase operations over measured block time for stats.operationsPerSecond
export const getOpsPerSecond = (run: BenchmarkRun | undefined): number => {
  if (!run) return 0;
  if (run.status === "completed") return run.result?.stats.operationsPerSecond.average ?? 0;
  if (run.status !== "running" && run.status !== "warmup") return 0;
  if (run.measurementElapsedMs <= 0) return 0;
  return (run.measurementOperations / run.measurementElapsedMs) * 1000;
};
