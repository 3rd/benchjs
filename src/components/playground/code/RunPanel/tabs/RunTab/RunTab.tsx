import { useCallback } from "react";
import { PlayIcon, SquareIcon, TriangleAlertIcon } from "lucide-react";
import type { BenchmarkPhase, EvidenceStatus } from "@/services/benchmark/types";
import type { BenchmarkRun, ChartDataPoint, RunInfo } from "@/stores/benchmarkStore";
import { cn } from "@/lib/utils";
import { formatDuration, formatOps } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

const RELIABLE_STATUSES: EvidenceStatus[] = ["complete"];

const STATUS_SENTENCES: Record<EvidenceStatus, string | null> = {
  "complete": null,
  "timer-limited": "This browser's clock is too coarse for a precise measurement here.",
  "warmup-not-converged":
    "The benchmark couldn't reach a stable measurement — these numbers are indicative. Re-running usually resolves this.",
  "dependence-unresolved":
    "The benchmark couldn't reach a stable measurement — these numbers are indicative. Re-running usually resolves this.",
  "insufficient-budget":
    "The time budget ran out before the measurement finished — these numbers are indicative. Re-running usually resolves this.",
  "precision-missed": "The result is slightly less precise than targeted; the numbers are still usable.",
  "unstable":
    "Timing drifted during the measurement — these numbers are indicative. Close background work and re-run.",
  "optimization-sensitive": "Part of the measured code may have been optimized away; treat these numbers with care.",
  "unidentifiable": "No reliable estimate could be produced from this run.",
  "failed": "The run failed before producing a result.",
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
  const averageTime = latestRun?.result?.stats.timePerOperationMs.average ?? 0;
  const lastChartPoint = chartData[chartData.length - 1];
  const liveTimePerOp = lastChartPoint && lastChartPoint.timePerOp > 0 ? lastChartPoint.timePerOp : null;

  const result = latestRun?.result;
  const phase = isRunning ? latestRun?.phase : null;
  const status = result?.evidence.status ?? null;
  const isReliable = status !== null && RELIABLE_STATUSES.includes(status);
  const statusSentence = status ? STATUS_SENTENCES[status] : null;

  const progressLabel =
    isIndeterminate ? "…" : `${(progress ?? 0).toFixed(0)}%`;

  const handleRun = useCallback(() => {
    if (latestRun) clearChartData(latestRun.id);
    onRun?.();
  }, [clearChartData, latestRun, onRun]);

  const chart = (
    <PerformanceChart
      averageTime={averageTime}
      chartData={chartData}
      interval={result?.evidence.interval ?? null}
      isRunning={isRunning}
    />
  );

  return (
    <div className="p-3 pb-6 space-y-3 max-w-[1024px]">
      {error && (
        <Card className="border-destructive">
          <CardContent className="py-2 px-4">
            <div className="flex gap-2.5 items-start text-sm">
              <TriangleAlertIcon className="w-8 h-8" />
              <div className="flex flex-col flex-1 justify-center">
                <p>Error: {error}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="overflow-hidden p-0">
        {/* controls: Run and Stop share the same slot */}
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
                {phase ? `${PHASE_LABELS[phase]} · ${progressLabel}` : progressLabel}
              </span>
              <Progress
                className={cn("flex-1 h-1", isIndeterminate && "animate-pulse")}
                value={isIndeterminate ? 100 : (progress ?? 0)}
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

        {!isRunning && !result && (
          <div className="py-7 px-5">
            <h3 className="text-sm font-semibold">No benchmark runs yet</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Run the benchmark to measure throughput, timing, and result reliability.
            </p>
            <div className="mt-5 space-y-3">
              <div className="flex gap-6">
                <div className="w-[22%] h-2.5 rounded-md bg-muted" />
                <div className="w-[18%] h-2.5 rounded-md bg-muted" />
                <div className="w-[16%] h-2.5 rounded-md bg-muted" />
              </div>
              <div className="h-24 rounded-lg bg-muted/60" />
              <div className="flex gap-6">
                <div className="w-[14%] h-2.5 rounded-md bg-muted" />
                <div className="w-[14%] h-2.5 rounded-md bg-muted" />
                <div className="w-[14%] h-2.5 rounded-md bg-muted" />
                <div className="w-[14%] h-2.5 rounded-md bg-muted" />
                <div className="w-[14%] h-2.5 rounded-md bg-muted" />
              </div>
            </div>
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
      </Card>
    </div>
  );
};
