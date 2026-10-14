import type { BenchmarkResult, EvidenceStatus } from "@/services/benchmark/types";

const UNSETTLED_MEASUREMENT_DESCRIPTION =
  "The benchmark couldn't reach a stable measurement — these numbers are indicative. Re-running usually resolves this.";

const STATUS_SENTENCES: Record<EvidenceStatus, string | null> = {
  complete: null,
  "timer-limited": "This browser's clock is too coarse for a precise measurement here.",
  "warmup-not-converged": UNSETTLED_MEASUREMENT_DESCRIPTION,
  "dependence-unresolved": UNSETTLED_MEASUREMENT_DESCRIPTION,
  "insufficient-budget":
    "The time budget ran out before the measurement finished — these numbers are indicative. Re-running usually resolves this.",
  "precision-missed": "The result is slightly less precise than targeted; the numbers are still usable.",
  unstable:
    "Timing drifted during the measurement — these numbers are indicative. Close background work and re-run.",
  "optimization-sensitive":
    "Part of the measured code may have been optimized away; treat these numbers with care.",
  unidentifiable: "No reliable estimate could be produced from this run.",
  failed: "The run failed before producing a result.",
};

export const EVIDENCE_LABELS = {
  indicative: "Indicative estimate",
  unavailable: "Estimate unavailable",
  unreliable: "Unreliable result",
};

export const getResultEvidence = (result: BenchmarkResult) => {
  const status = result.evidence.status;
  const isReliable = status === "complete";
  const hasEstimate = result.stats.operationsPerSecond.average !== null;
  let label: string | null = null;

  if (!hasEstimate) {
    label = EVIDENCE_LABELS.unavailable;
  } else if (!isReliable) {
    label = result.evidence.interval ? EVIDENCE_LABELS.unreliable : EVIDENCE_LABELS.indicative;
  }

  return { status, isReliable, hasEstimate, label, description: STATUS_SENTENCES[status] };
};
