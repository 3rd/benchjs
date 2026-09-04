import { BenchmarkResult } from "@/services/benchmark/types";

type BenchmarkStatsOverrides = {
  operations?: number;
  blocks?: number;
  elapsedMs?: number;
  timePerOperationMs?: Partial<BenchmarkResult["stats"]["timePerOperationMs"]>;
  operationsPerSecond?: Partial<BenchmarkResult["stats"]["operationsPerSecond"]>;
  observations?: BenchmarkResult["evidence"]["observations"];
};

export const createBenchmarkResult = (
  name: string,
  overrides: BenchmarkStatsOverrides = {},
): BenchmarkResult => ({
  name,
  taskType: "call",
  metadata: {
    schedule: { seed: null, yieldBetweenRounds: false, rows: [] },
    plan: null,
    executionKind: "sync",
  },
  stats: {
    operations: overrides.operations ?? 1000,
    blocks: overrides.blocks ?? 10,
    elapsedMs: overrides.elapsedMs ?? 1000,
    timePerOperationMs: {
      min: 900,
      max: 1100,
      average: 1000,
      median: 1000,
      percentile50: 1000,
      percentile90: 1050,
      percentile95: 1075,
      ...overrides.timePerOperationMs,
    },
    operationsPerSecond: {
      average: 1000,
      max: 1100,
      min: 900,
      ...overrides.operationsPerSecond,
    },
    harnessOverhead: {
      perInvocationMs: 0.0001,
      sampleCount: 100,
      observationSequences: [],
      modeledRemainderMs: { total: 0, average: 0 },
    },
  },
  evidence: {
    schemaVersion: 6,
    taskType: "call",
    measurement: "auto",
    schedule: "isolated",
    status: "complete",
    reasons: [],
    statsProvenance: { observationPhase: "measurement", modelPhase: null },
    observations: overrides.observations ?? [],
    interval: null,
  },
});
