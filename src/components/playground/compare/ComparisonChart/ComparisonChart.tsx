import { useId, useMemo } from "react";
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
import { isRankingEligible } from "@/components/playground/compare/comparison-ranking";
import { getOpsPerSecond } from "@/components/playground/compare/comparison-rate";
import { getResultEvidence } from "@/components/playground/result-evidence";

interface ComparisonChartProps {
  implementations: Implementation[];
  runs: Record<string, BenchmarkRun[]>;
}

export const ComparisonChart = ({ implementations, runs }: ComparisonChartProps) => {
  const evidenceDescriptionId = useId();
  const barData = useMemo(() => {
    return implementations.map((item) => {
      const run = runs[item.id]?.at(-1);
      const opsPerSec = getOpsPerSecond(run);
      const completedResult = run?.status === "completed" ? run.result : null;
      const evidence = completedResult ? getResultEvidence(completedResult) : null;
      let rateLabel = formatCountShort(opsPerSec);

      if (evidence?.hasEstimate === false) {
        rateLabel = "-";
      } else if (evidence?.label) {
        rateLabel += "*";
      }

      // call-task intervals are already ops/s bounds
      const interval = run?.status === "completed" ? (run.result?.evidence.interval ?? null) : null;
      let ci: [number, number] | undefined;
      if (interval && interval.upper !== null && opsPerSec > 0) {
        ci = [Math.max(opsPerSec - interval.lower, 0), Math.max(interval.upper - opsPerSec, 0)];
      }

      return {
        id: item.id,
        name: item.filename,
        "Operations/sec": evidence?.hasEstimate === false ? null : opsPerSec,
        rateLabel,
        evidence,
        ci,
      };
    });
  }, [implementations, runs]);

  const bestValue = Math.max(...barData.map((entry) => entry["Operations/sec"] ?? 0));
  const rankable = isRankingEligible(implementations.map((item) => ({ run: runs[item.id]?.at(-1) })));
  const highlightBest = rankable && bestValue > 0;

  const qualifiedEntries = barData.flatMap(({ id, name, evidence }) => {
    if (!evidence?.label) return [];

    return [{ id, name, label: evidence.label, status: evidence.status, description: evidence.description }];
  });

  const hasRates = barData.some((entry) => (entry["Operations/sec"] ?? 0) > 0);
  const isEmptyComparison = !hasRates && qualifiedEntries.length === 0;
  if (isEmptyComparison) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
        No results yet. Run implementations to compare their performance.
      </div>
    );
  }

  return (
    <figure aria-describedby={qualifiedEntries.length > 0 ? evidenceDescriptionId : undefined}>
      {hasRates && (
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
                  aria-label={`${entry.name}: ${entry.rateLabel} ops/sec. ${entry.evidence?.label ?? ""} ${entry.evidence?.description ?? ""}`}
                  fill={
                    highlightBest && entry["Operations/sec"] === bestValue ?
                      CHART_COLORS.samples
                    : CHART_COLORS.time
                  }
                />
              ))}
              <LabelList
                dataKey="rateLabel"
                fill={CHART_COLORS.label}
                fontSize={11}
                position="top"
              />
              <ErrorBar dataKey="ci" stroke={CHART_COLORS.label} strokeWidth={1.5} width={6} />
            </Bar>
          </RechartsBarChart>
        </ResponsiveContainer>
      )}
      {qualifiedEntries.length > 0 && (
        <figcaption id={evidenceDescriptionId} className="mt-3 space-y-2 text-xs text-amber-600 dark:text-amber-400">
          {qualifiedEntries.map(({ id, name, label, status, description }) => (
            <p key={id}>
              {name} — {label} ({status}). {description}
            </p>
          ))}
        </figcaption>
      )}
    </figure>
  );
};
