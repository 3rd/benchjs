import { Info, Square } from "lucide-react";
import { BenchmarkRun } from "@/stores/benchmarkStore";
import { Implementation } from "@/stores/persistentStore";
import { formatCount, formatTime } from "@/lib/formatters";
import { cn } from "@/lib/utils";
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

const calculateOpsPerSecond = (run: BenchmarkRun): number => {
  if (run.status === "completed" && run.result?.stats.opsPerSecond.average) {
    return run.result.stats.opsPerSecond.average;
  }
  if (run.status === "running" && run.elapsedTime > 0 && run.completedIterations > 0) {
    return (run.completedIterations / run.elapsedTime) * 1000;
  }
  return 0;
};

const calculateRunMetrics = (runs: ImplementationRun[]): Map<string, RunMetrics> => {
  const metrics = new Map<string, RunMetrics>();

  let best = 0;
  for (const item of runs) {
    const runOpsPerSecond = item.run ? calculateOpsPerSecond(item.run) : 0;
    if (runOpsPerSecond > best) best = runOpsPerSecond;
  }

  for (const item of runs) {
    if (item.run?.status === "completed" && item.run.result?.stats.opsPerSecond.average) {
      const opsPerSecond = item.run.result.stats.opsPerSecond.average;
      metrics.set(item.implementation.id, {
        opsPerSecond,
        percentageDiff: ((best - opsPerSecond) / best) * 100,
        isBest: opsPerSecond === best,
      });
    } else if (item.run?.status === "running") {
      const currentOps = calculateOpsPerSecond(item.run);
      if (currentOps > 0) {
        metrics.set(item.implementation.id, {
          opsPerSecond: currentOps,
          percentageDiff: ((best - currentOps) / best) * 100,
          isBest: currentOps === best,
        });
      }
    }
  }
  return metrics;
};

const OpsPerSecondCell = ({
  run,
  metrics,
}: {
  run: BenchmarkRun | undefined;
  metrics: RunMetrics | undefined;
}) => {
  if (!run) return <span>-</span>;

  const opsPerSecond = calculateOpsPerSecond(run);
  if (opsPerSecond === 0) return <span>-</span>;

  const isRunning = run.status === "running";

  return (
    <div className="flex gap-2 items-center">
      <span
        className={cn(
          "font-medium",
          isRunning && "text-blue-600",
          metrics?.isBest && "font-semibold text-green-600",
          !metrics?.isBest && "text-orange-600",
        )}
      >
        {formatCount(Math.round(opsPerSecond))}
      </span>
      {metrics?.isBest && <span className="text-xs font-medium text-green-600">Best</span>}
      {metrics && !metrics.isBest && metrics.percentageDiff > 0 && (
        <span className="text-xs text-muted-foreground">(-{metrics.percentageDiff.toFixed(1)}%)</span>
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
                checked={implementation.selected}
                onCheckedChange={() => onToggleSelect(implementation.id)}
              />
            </TableCell>
            <TableCell>{implementation.filename}</TableCell>
            <TableCell>{run?.status ?? "N/A"}</TableCell>
            <TableCell>{run ? formatTime(run.elapsedTime) : "-"}</TableCell>
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
