import { useCallback } from "react";
import { PlayIcon, SquareIcon, TriangleAlertIcon } from "lucide-react";
import type { BenchmarkRun, ChartDataPoint, RunInfo } from "@/stores/benchmarkStore";
import type { BenchmarkPhase, EvidenceStatus } from "@/services/benchmark/types";
import { formatDuration, formatOps } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { MetricFigure } from "./MetricFigure";
import { PerformanceChart } from "./PerformanceChart";
import { StatsPanel } from "./StatsPanel";

const PHASE_LABELS: Record<BenchmarkPhase, string> = {
  warmup: "Warmup",
  pilot: "Pilot",
  assessment: "Assessment",
  measurement: "Measurement",
};

const STATUS_SENTENCES: Record<EvidenceStatus, string | null> = {
  complete: null,
  "timer-limited": "This browser's clock is too coarse for a precise measurement here.",
  "warmup-not-converged":
    "The benchmark couldn't reach a stable measurement — these numbers are indicative. Re-running usually resolves this.",
  "dependence-unresolved":
    "The benchmark couldn't reach a stable measurement — these numbers are indicative. Re-running usually resolves this.",
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

interface RunTabProps {
  isRunning: boolean;
  latestRun?: BenchmarkRun;
  runInfo?: RunInfo | null;
  onRun?: () => void;
  onStop?: () => void;
  chartData: ChartDataPoint[];
  clearChartData: (runId: string) => void;
}

export const RunTab = ({
  isRunning,
  latestRun,
  runInfo,
  onRun,
  onStop,
  chartData,
  clearChartData,
}: RunTabProps) => {
  const progress = latestRun?.progress ?? null;
  // warmup and pilot report no known final count; only measurement is determinate
  const isIndeterminate = isRunning && progress === null;
  const error = latestRun?.error ?? null;

  const elapsedTime = latestRun?.elapsedTime || latestRun?.result?.stats.elapsedMs || 0;
  const averageOpsPerSecond = latestRun?.result?.stats.operationsPerSecond.average ?? 0;
  const lastChartPoint = chartData[chartData.length - 1];
  const liveTimePerOp = lastChartPoint && lastChartPoint.timePerOp > 0 ? lastChartPoint.timePerOp : null;

  const result = latestRun?.result;
  const phase = isRunning ? latestRun?.phase : null;
  const status = result?.evidence.status ?? null;
  const isReliable = status === "complete";
  const statusSentence = status ? STATUS_SENTENCES[status] : null;

  const phaseLabel = phase ? PHASE_LABELS[phase] : "Starting";
  const progressLabel = isIndeterminate ? phaseLabel : `${phaseLabel} · ${(progress ?? 0).toFixed(0)}%`;

  const handleRun = useCallback(() => {
    if (latestRun) clearChartData(latestRun.id);
    onRun?.();
  }, [clearChartData, latestRun, onRun]);

  const chart = (
    <PerformanceChart averageOpsPerSecond={averageOpsPerSecond} chartData={chartData} isRunning={isRunning} />
  );

  return (
    <div className="pb-6">
      {error && (
        <div className="flex gap-2.5 items-start py-2 px-4 text-sm border-b text-destructive border-destructive/40 bg-destructive/5">
          <TriangleAlertIcon className="mt-0.5 w-4 h-4 shrink-0" />
          <p>Error: {error}</p>
        </div>
      )}

      <div className="flex gap-3 items-center py-2.5 px-4 border-b">
        {isRunning ?
          <Button className="px-2.5" variant="outline" onClick={onStop}>
            <SquareIcon className="w-4 h-4" />
            Stop
          </Button>
        : <Button className="px-2.5" onClick={handleRun}>
            <PlayIcon className="w-4 h-4" />
            Run Benchmark
          </Button>
        }
        {isRunning && (
          <div className="flex flex-1 gap-2.5 items-center min-w-0">
            <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
              {progressLabel}
            </span>
            <Progress
              className={cn("flex-1 h-1", isIndeterminate && "animate-pulse bg-primary")}
              value={isIndeterminate ? null : (progress ?? 0)}
            />
          </div>
        )}
        {!isRunning && status && !isReliable && (
          <span className="py-0.5 px-2.5 text-xs font-medium text-amber-600 rounded-full whitespace-nowrap dark:text-amber-400 bg-amber-500/10">
            Unreliable result
          </span>
        )}
        {elapsedTime > 0 && (
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">
            {formatDuration(elapsedTime)}
          </span>
        )}
      </div>

      {!isRunning && statusSentence && (
        <div className="py-2 px-4 text-xs text-amber-600 border-b dark:text-amber-400 bg-amber-500/5">
          {statusSentence}
        </div>
      )}

      {!latestRun && (
        <div className="py-7 px-5">
          <h3 className="text-sm font-semibold">No benchmark runs yet</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Run the benchmark to measure throughput, timing, and result reliability.
          </p>
        </div>
      )}

      {latestRun?.status === "cancelled" && (
        <div className="py-7 px-5">
          <p className="text-sm text-muted-foreground">This benchmark run was cancelled.</p>
        </div>
      )}

      {isRunning && (
        <div className="p-4">
          <div className="flex flex-wrap gap-x-12 gap-y-3">
            <MetricFigure
              label="Throughput"
              unit="ops/s"
              value={liveTimePerOp ? formatOps(1000 / liveTimePerOp) : "-"}
            />
            <MetricFigure
              label="Time per operation"
              value={liveTimePerOp ? formatDuration(liveTimePerOp) : "-"}
            />
          </div>
          <div className="mt-4">{chart}</div>
        </div>
      )}

      {!isRunning && result && (
        <StatsPanel chart={chart} result={result} runInfo={runInfo ?? null} wallTimeMs={elapsedTime} />
      )}
    </div>
  );
};
