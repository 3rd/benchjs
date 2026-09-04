import type { ReactNode } from "react";
import type { IntervalEvidence } from "benchmate";
import type { RunInfo } from "@/stores/benchmarkStore";
import type { BenchmarkResult } from "@/services/benchmark/types";
import { formatCount, formatDuration, formatOps } from "@/lib/formatters";
import { MetricFigure } from "../MetricFigure";

// Benchmate repeats each series-level verdict flag on every block in its phase group.
const SERIES_FLAGS = new Set(["change-detected", "drift-detected"]);

// call-task intervals are on the inverse scale: lower/upper are operations per second
const formatOpsInterval = (interval: IntervalEvidence | null) => {
  if (!interval) return "-";
  if (interval.upper === null) return `≥ ${formatOps(interval.lower)} ops/s`;
  return `${formatOps(interval.lower)} – ${formatOps(interval.upper)} ops/s`;
};

interface StatsPanelProps {
  result: BenchmarkResult;
  runInfo: RunInfo | null;
  wallTimeMs: number;
  chart: ReactNode;
}

export const StatsPanel = ({ result, runInfo, wallTimeMs, chart }: StatsPanelProps) => {
  const { stats, evidence } = result;
  const time = stats.timePerOperationMs;
  const mean = time.average;
  const interval = evidence.interval;

  const opsMean = stats.operationsPerSecond.average;
  const precisionLabel =
    interval && interval.upper !== null && opsMean !== null && opsMean > 0 ?
      `±${(((interval.upper - interval.lower) / 2 / opsMean) * 100).toFixed(2)}%`
    : null;
  const ciCaption = interval ? `95% CI ${formatOpsInterval(interval)}` : "Indicative estimate";

  const flagCounts = new Map<string, number>();
  for (const observation of evidence.observations) {
    for (const flag of observation.flags) {
      flagCounts.set(flag, (flagCounts.get(flag) ?? 0) + 1);
    }
  }
  const flagsLabel = [...flagCounts.entries()]
    .map(([flag, count]) => (SERIES_FLAGS.has(flag) ? flag : `${flag} ×${count}`))
    .join(", ");

  const overheadMs = stats.harnessOverhead.perInvocationMs;

  const distribution = [
    { label: "Min", value: time.min },
    { label: "p50", value: time.percentile50 },
    { label: "p90", value: time.percentile90 },
    { label: "p95", value: time.percentile95 },
    { label: "Max", value: time.max },
  ];

  const observationPhase = evidence.statsProvenance.observationPhase;
  const blocksNoun = observationPhase === "measurement" ? "measured blocks" : `${observationPhase} blocks`;

  // single-valued fields in this app (task type, measurement mode, schedule, interval method, clock) are omitted
  const details: { label: string; value: string }[] = [];
  if (evidence.status !== "complete") details.push({ label: "Status", value: evidence.status });
  if (observationPhase !== "measurement") {
    details.push({ label: "Stats source", value: `${observationPhase} phase` });
  }
  details.push(
    { label: "Operations", value: formatCount(stats.operations) },
    { label: "Measured blocks", value: formatCount(stats.blocks) },
    { label: "Blocks (all phases)", value: formatCount(evidence.observations.length) },
    { label: "Measured time", value: formatDuration(stats.elapsedMs) },
    { label: "Wall time", value: wallTimeMs > 0 ? formatDuration(wallTimeMs) : "-" },
    {
      label: "Measured share",
      value: wallTimeMs > 0 ? `${((stats.elapsedMs / wallTimeMs) * 100).toFixed(0)}% of wall` : "-",
    },
    {
      label: "Per-block ops/s range",
      value: `${formatOps(stats.operationsPerSecond.min)} – ${formatOps(stats.operationsPerSecond.max)}`,
    },
    { label: "Overhead per op", value: formatDuration(overheadMs) },
    {
      label: "Mean minus overhead",
      value: formatDuration(stats.harnessOverhead.modeledRemainderMs.average),
    },
  );
  if (interval && interval.effectiveCount !== interval.physicalCount) {
    details.push({
      label: "Effective samples",
      value: `${formatCount(interval.effectiveCount)} of ${formatCount(interval.physicalCount)}`,
    });
  }
  if (runInfo) {
    const clockTick = formatDuration(runInfo.clock.minimumPositiveTickMs);
    const readCostP99 = formatDuration(runInfo.clock.readPairCostMs.p99);
    details.push(
      { label: "Clock tick", value: clockTick },
      { label: "Zero-delta rate", value: `${(runInfo.clock.zeroDeltaRateX * 100).toFixed(1)}%` },
    );
    if (readCostP99 !== clockTick) {
      details.push({ label: "Read cost p99", value: readCostP99 });
    }
    details.push({
      label: "Isolation",
      value: runInfo.crossOriginIsolated ? "cross-origin isolated" : "not isolated",
    });
  }
  if (flagsLabel) details.push({ label: "Flags", value: flagsLabel });

  return (
    <div className="p-4">
      <div className="flex flex-wrap gap-x-12 gap-y-3">
        <MetricFigure
          caption={ciCaption}
          label="Throughput"
          unit={precisionLabel ? `ops/s ${precisionLabel}` : "ops/s"}
          value={formatOps(opsMean)}
        />
        <MetricFigure
          caption={`Mean of ${formatCount(stats.blocks)} ${blocksNoun}`}
          label="Time per operation"
          value={formatDuration(mean)}
        />
      </div>

      <div className="mt-4">{chart}</div>

      <section className="pt-3 mt-4 border-t">
        <p className="mb-2 text-xs text-muted-foreground">Distribution (time per operation)</p>
        <div className="grid grid-cols-5 gap-4">
          {distribution.map((entry) => (
            <div key={entry.label}>
              <p className="text-xs text-muted-foreground">{entry.label}</p>
              <p className="text-sm font-medium tabular-nums">{formatDuration(entry.value)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="pt-3 mt-4 border-t">
        <p className="mb-2 text-xs text-muted-foreground">Run details</p>
        <div className="grid grid-cols-3 gap-x-6 gap-y-2.5">
          {details.map((row) => (
            <div key={row.label}>
              <p className="text-xs text-muted-foreground">{row.label}</p>
              <p className="text-sm tabular-nums">{row.value}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
