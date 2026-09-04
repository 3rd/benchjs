import { BenchEvents, BenchmarkOptions, BenchmarkRunResult, CallBenchmarkResult } from "benchmate";

// benchmark types
export type BenchmarkPhase = BenchEvents["taskPhaseStart"]["phase"];
export type EvidenceStatus = BenchEvents["taskEvidenceStatus"]["status"];

// the complete per-task entry; the host guide forbids replacing it with a browser-only shape
export type BenchmarkResult = CallBenchmarkResult;

// worker messages
export type MainToWorkerMessage = {
  type: "start";
  runs: {
    runId: string;
    processedCode: string;
  }[];
  options?: BenchmarkOptions;
};

export type ConsoleLevel = "debug" | "error" | "info" | "log" | "warn";

export type WorkerToMainMessage =
  | { type: "complete"; result: BenchmarkRunResult; crossOriginIsolated: boolean }
  | {
      type: "consoleBatch";
      runId: string;
      logs: {
        level: ConsoleLevel;
        message: string;
        count: number;
      }[];
    }
  | { type: "error"; runId: string; error: string }
  | { type: "evidenceStatus"; runId: string; status: EvidenceStatus; reasons: string[] }
  | { type: "phase"; runId: string; phase: BenchmarkPhase }
  | {
      type: "progress";
      runId: string;
      elapsedTime: number;
      // benchmate pools these two over measurement-phase blocks for stats.operationsPerSecond
      measurementOperations: number;
      measurementElapsedMs: number;
      timePerOp: number;
      // null while warmup/pilot collect evidence (no known final count); the
      // measurement phase reports its locked physical block fraction
      measurementFraction: number | null;
      phase?: BenchmarkPhase;
    }
  | { type: "setup"; runId: string }
  | { type: "taskComplete"; runId: string; elapsedTime: number }
  | { type: "taskStart"; runId: string }
  | { type: "teardown"; runId: string }
  | { type: "warmupEnd"; runId: string }
  | { type: "warmupStart"; runId: string };
