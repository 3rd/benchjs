import { Info, Square } from "lucide-react";
import { BenchmarkRun } from "@/stores/benchmarkStore";
import { Implementation } from "@/stores/persistentStore";
import { formatCount, formatDuration } from "@/lib/formatters";
import { isRankingEligible } from "@/components/playground/compare/comparison-ranking";
import { getOpsPerSecond } from "@/components/playground/compare/comparison-rate";
import { getResultEvidence } from "@/components/playground/result-evidence";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface ComparisonTableProps {
  implementations: (Implementation & { selected: boolean })[];
  runs: Record<string, BenchmarkRun[]>;
  isRunning: boolean;
  onSelectAll: (checked: boolean) => void;
  onToggleSelect: (id: string) => void;
  onRunSingle: (impl: Implementation) => void;
  onStop: (runId: string) => void;
}

interface RunMetrics {
  opsPerSecond: number;
  percentageDiff: number;
  isBest: boolean;
}

interface ImplementationRun {
  implementation: Implementation & { selected: boolean };
  run: BenchmarkRun | undefined;
  metrics: RunMetrics | undefined;
}

const calculateRunMetrics = (runs: ImplementationRun[]): Map<string, RunMetrics> => {
  const metrics = new Map<string, RunMetrics>();
  const rankable = isRankingEligible(runs);
  const finishedRuns = runs.filter((item) => item.run?.status === "completed");

  let best = 0;
  for (const item of finishedRuns) {
    const runOpsPerSecond = getOpsPerSecond(item.run);
    if (runOpsPerSecond > best) best = runOpsPerSecond;
  }

  for (const item of finishedRuns) {
    const opsPerSecond = getOpsPerSecond(item.run);
    if (opsPerSecond <= 0) continue;
    metrics.set(item.implementation.id, {
      opsPerSecond,
      percentageDiff: ((best - opsPerSecond) / best) * 100,
      isBest: rankable && opsPerSecond === best,
    });
  }
  return metrics;
};

const OPS_PER_SECOND_CLASS_NAMES = {
  provisional: "font-medium text-blue-600",
  best: "font-semibold text-green-600",
  settled: "font-medium text-orange-600",
};

const getOpsPerSecondState = (run: BenchmarkRun, metrics: RunMetrics | undefined) => {
  const isActiveRun = run.status === "running" || run.status === "warmup";
  if (isActiveRun) return "provisional";

  if (metrics?.isBest) return "best";

  return "settled";
};

interface OpsPerSecondCellProps {
  run: BenchmarkRun | undefined;
  metrics: RunMetrics | undefined;
}

const OpsPerSecondCell = ({ run, metrics }: OpsPerSecondCellProps) => {
  if (!run) return <span>-</span>;

  const opsPerSecond = getOpsPerSecond(run);
  const completedResult = run.status === "completed" ? run.result : null;
  const evidence = completedResult ? getResultEvidence(completedResult) : null;
  const shouldHideRateDetails = opsPerSecond === 0 && !evidence?.label;
  if (shouldHideRateDetails) return <span>-</span>;

  const state = getOpsPerSecondState(run, metrics);
  const shouldShowDeficit = state === "settled" && metrics !== undefined && metrics.percentageDiff > 0;

  return (
    <div className="space-y-1">
      <div className="flex gap-2 items-center">
        <span className={OPS_PER_SECOND_CLASS_NAMES[state]}>
          {opsPerSecond > 0 ? formatCount(Math.round(opsPerSecond)) : "-"}
        </span>
        {state === "best" && <span className="text-xs font-medium text-green-600">Best</span>}
        {shouldShowDeficit && (
          <span className="text-xs text-muted-foreground">(-{metrics.percentageDiff.toFixed(1)}%)</span>
        )}
      </div>
      {evidence?.label && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              aria-label={`${evidence.label} (${evidence.status}). ${evidence.description ?? ""}`}
              className="flex gap-1 items-center text-xs text-amber-600 dark:text-amber-400"
            >
              {evidence.label}
              <Info className="w-3 h-3" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p>{evidence.status}</p>
              <p>{evidence.description}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
};

const ActionCell = ({
  run,
  implementation,
  isRunning,
  onRunSingle,
  onStop,
}: {
  run: BenchmarkRun | undefined;
  implementation: Implementation;
  isRunning: boolean;
  onRunSingle: (impl: Implementation) => void;
  onStop: (runId: string) => void;
}) => {
  const isActiveRun = run?.status === "running" || run?.status === "warmup";

  if (isActiveRun && run) {
    return (
      <div className="flex gap-2 justify-end items-center">
        <Progress className="w-[100px]" value={run.progress} />
        <Button size="sm" variant="outline" onClick={() => onStop(run.id)}>
          <Square className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-x-2">
      <Button disabled={isRunning} variant="outline" onClick={() => onRunSingle(implementation)}>
        {run?.result ? "Re-Run" : "Run"}
      </Button>
    </div>
  );
};

const HeaderTooltip = ({ label, tooltip }: { label: string; tooltip: string }) => (
  <div className="flex items-center">
    {label}
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <Info className="ml-1 w-4 h-4" />
        </TooltipTrigger>
        <TooltipContent>
          <p>{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  </div>
);

export const ComparisonTable = ({
  implementations,
  runs,
  isRunning,
  onSelectAll,
  onToggleSelect,
  onRunSingle,
  onStop,
}: ComparisonTableProps) => {
  const implementationRuns: ImplementationRun[] = implementations.map((implementation) => ({
    implementation,
    run: runs[implementation.id]?.at(-1),
    metrics: undefined,
  }));

  const runMetrics = calculateRunMetrics(implementationRuns);
  for (const item of implementationRuns) {
    item.metrics = runMetrics.get(item.implementation.id);
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[50px]">
            <Checkbox
              aria-label="Select all implementations"
              checked={implementations.length > 0 && implementations.every((impl) => impl.selected)}
              onCheckedChange={onSelectAll}
            />
          </TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>
            <HeaderTooltip label="Total Time (ms)" tooltip="Total execution time in milliseconds" />
          </TableHead>
          <TableHead>
            <HeaderTooltip label="Ops/sec" tooltip="Operations per second" />
          </TableHead>
          <TableHead className="text-right">Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {implementationRuns.map(({ implementation, run, metrics }) => (
          <TableRow key={implementation.id}>
            <TableCell>
              <Checkbox
                aria-label={`Select ${implementation.filename}`}
                checked={implementation.selected}
                onCheckedChange={() => onToggleSelect(implementation.id)}
              />
            </TableCell>
            <TableCell>{implementation.filename}</TableCell>
            <TableCell>{run?.status ?? "N/A"}</TableCell>
            <TableCell>{run ? formatDuration(run.elapsedTime) : "-"}</TableCell>
            <TableCell>
              <OpsPerSecondCell metrics={metrics} run={run} />
            </TableCell>
            <TableCell className="text-right">
              <ActionCell
                implementation={implementation}
                isRunning={isRunning}
                run={run}
                onRunSingle={onRunSingle}
                onStop={onStop}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};
