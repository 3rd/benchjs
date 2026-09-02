import { useMemo } from "react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ErrorBar,
  LabelList,
  BarChart as RechartsBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BenchmarkRun } from "@/stores/benchmarkStore";
import { Implementation } from "@/stores/persistentStore";
import { CHART_COLORS, chartAxisTick, chartTooltipLabelStyle, chartTooltipStyle } from "@/lib/chart-style";
import { formatCountShort } from "@/lib/formatters";

interface ComparisonChartProps {
  implementations: Implementation[];
  runs: Record<string, BenchmarkRun[]>;
}

export const ComparisonChart = ({ implementations, runs }: ComparisonChartProps) => {
  const barData = useMemo(() => {
    return implementations.map((item) => {
      const run = runs[item.id]?.at(-1);
      const isRunning = run?.status === "running" || run?.status === "warmup";
      const opsPerSec =
        isRunning && run.completedIterations ?
          run.completedIterations / (run.elapsedTime / 1000)
        : run?.result?.stats.operationsPerSecond.average || 0;

      // call-task intervals are already ops/s bounds
      const interval = run?.status === "completed" ? (run.result?.evidence.interval ?? null) : null;
      let ci: [number, number] | undefined;
      if (interval && interval.upper !== null && opsPerSec > 0) {
        ci = [Math.max(opsPerSec - interval.lower, 0), Math.max(interval.upper - opsPerSec, 0)];
      }

      return {
        name: item.filename,
        "Operations/sec": opsPerSec,
        ci,
      };
    });
  }, [implementations, runs]);

  const bestValue = Math.max(...barData.map((entry) => entry["Operations/sec"]));
  // the host guide forbids a fastest marker unless every member has complete evidence
  const rankable = implementations.every((item) => {
    const run = runs[item.id]?.at(-1);
    return !run || (run.status === "completed" && run.result?.evidence.status === "complete");
  });
  const highlightBest = rankable && barData.length > 1 && bestValue > 0;

  if (barData.every((entry) => entry["Operations/sec"] <= 0)) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
        No results yet. Run implementations to compare their performance.
      </div>
    );
  }

  return (
    <div>
      <div>
        <ResponsiveContainer height={400} width="100%">
          <RechartsBarChart data={barData} margin={{ top: 20, right: 10, left: 20, bottom: 0 }}>
            <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis
              axisLine={{ stroke: CHART_COLORS.grid }}
              dataKey="name"
              height={30}
              interval={0}
              textAnchor="end"
              tick={{ ...chartAxisTick, fontSize: 12 }}
              tickLine={false}
            />
            <YAxis
              axisLine={false}
              label={{
                value: "Ops/sec",
                angle: -90,
                position: "left",
                style: { textAnchor: "middle", fill: CHART_COLORS.label },
              }}
              tick={chartAxisTick}
              tickFormatter={formatCountShort}
              tickLine={false}
            />
            <Tooltip
              contentStyle={chartTooltipStyle}
              cursor={{ fill: CHART_COLORS.grid, fillOpacity: 0.4 }}
              formatter={(value) => `${Math.round(Number(value)).toLocaleString()} ops/sec`}
              labelStyle={chartTooltipLabelStyle}
            />
            <Bar
              dataKey="Operations/sec"
              fill={CHART_COLORS.time}
              isAnimationActive={false}
              maxBarSize={72}
              radius={[4, 4, 0, 0]}
            >
              {barData.map((entry) => (
                <Cell
                  key={entry.name}
                  fill={
                    highlightBest && entry["Operations/sec"] === bestValue ?
                      CHART_COLORS.samples
                    : CHART_COLORS.time
                  }
                />
              ))}
              <LabelList
                dataKey="Operations/sec"
                fill={CHART_COLORS.label}
                fontSize={11}
                formatter={(value) => formatCountShort(Number(value))}
                position="top"
              />
              <ErrorBar dataKey="ci" stroke={CHART_COLORS.label} strokeWidth={1.5} width={6} />
            </Bar>
          </RechartsBarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
