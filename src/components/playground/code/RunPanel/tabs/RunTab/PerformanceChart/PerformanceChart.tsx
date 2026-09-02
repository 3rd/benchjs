import { useMemo } from "react";
import type { IntervalEvidence } from "benchmate";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartDataPoint } from "@/stores/benchmarkStore";
import { CHART_COLORS, chartAxisTick, chartTooltipLabelStyle, chartTooltipStyle } from "@/lib/chart-style";
import { formatCount, formatCountShort, formatDuration } from "@/lib/formatters";

type PhaseRegion = {
  phase: NonNullable<ChartDataPoint["phase"]>;
  start: number;
  end: number;
};

const PHASE_FILLS: Record<PhaseRegion["phase"], string> = {
  warmup: CHART_COLORS.label,
  assessment: CHART_COLORS.label,
  calibration: CHART_COLORS.label,
  overhead: CHART_COLORS.label,
  probe: CHART_COLORS.label,
  pilot: CHART_COLORS.samples,
  measurement: CHART_COLORS.time,
};

interface PerformanceChartProps {
  chartData: ChartDataPoint[];
  isRunning: boolean;
  interval: IntervalEvidence | null;
  averageTime: number;
}

export const PerformanceChart = ({ chartData, isRunning, interval, averageTime }: PerformanceChartProps) => {
  const phaseRegions = useMemo(() => {
    const regions: PhaseRegion[] = [];
    for (const point of chartData) {
      if (!point.phase) continue;
      const previous = regions[regions.length - 1];
      if (previous && previous.phase === point.phase) {
        previous.end = point.time;
      } else {
        regions.push({ phase: point.phase, start: previous ? previous.end : 0, end: point.time });
      }
    }
    return regions;
  }, [chartData]);

  const chartSpan = chartData[chartData.length - 1]?.time ?? 0;
  // call-task intervals are ops/s bounds; invert them into time-per-op for this axis
  const ciBand =
    interval && interval.upper !== null && interval.lower > 0 ?
      { y1: 1000 / interval.upper, y2: 1000 / interval.lower }
    : null;
  // a log axis shows the microsecond warmup spike and the nanosecond steady state together
  const useLogScale = chartData.length > 1 && chartData.every((point) => point.timePerOp > 0);

  return (
    <div className="h-[220px]">
      <ResponsiveContainer height="100%" width="100%">
          <ComposedChart data={chartData} margin={{ top: 5, right: 30, left: 30, bottom: 5 }}>
            <defs>
              <linearGradient id="samplesFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={CHART_COLORS.samples} stopOpacity={0.25} />
                <stop offset="100%" stopColor={CHART_COLORS.samples} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
            <XAxis
              axisLine={{ stroke: CHART_COLORS.grid }}
              dataKey="time"
              domain={[0, "dataMax"]}
              tick={chartAxisTick}
              tickFormatter={(value: number) => `${(value / 1000).toFixed(2)}s`}
              tickLine={false}
              type="number"
            />
            <YAxis
              axisLine={false}
              domain={useLogScale ? ["auto", "auto"] : [0, "auto"]}
              scale={useLogScale ? "log" : "linear"}
              tick={chartAxisTick}
              tickFormatter={formatDuration}
              tickLine={false}
              width={60}
              yAxisId="left"
            />
            <YAxis
              axisLine={false}
              orientation="right"
              tick={chartAxisTick}
              tickFormatter={formatCountShort}
              tickLine={false}
              width={60}
              yAxisId="right"
            />
            {phaseRegions.map((region) => (
              <ReferenceArea
                key={`${region.phase}-${region.start}`}
                fill={PHASE_FILLS[region.phase]}
                fillOpacity={0.08}
                label={
                  chartSpan > 0 && (region.end - region.start) / chartSpan > 0.15 ?
                    {
                      value: region.phase.charAt(0).toUpperCase() + region.phase.slice(1),
                      position: "insideTop",
                      fill: CHART_COLORS.label,
                      fontSize: 10,
                    }
                  : undefined
                }
                stroke="none"
                x1={region.start}
                x2={region.end}
                yAxisId="left"
              />
            ))}
            {!isRunning && ciBand && (
              <ReferenceArea
                fill={CHART_COLORS.time}
                fillOpacity={0.12}
                label={{ value: "95% CI", position: "insideRight", fill: CHART_COLORS.label, fontSize: 10 }}
                stroke={CHART_COLORS.time}
                strokeDasharray="4 4"
                strokeOpacity={0.4}
                y1={ciBand.y1}
                y2={ciBand.y2}
                yAxisId="left"
              />
            )}
            {!isRunning && averageTime > 0 && (
              <ReferenceLine
                label={{ value: "Mean", position: "right", fill: CHART_COLORS.label, fontSize: 10 }}
                stroke={CHART_COLORS.time}
                strokeDasharray="4 4"
                strokeOpacity={0.6}
                y={averageTime}
                yAxisId="left"
              />
            )}
            <Tooltip
              contentStyle={chartTooltipStyle}
              formatter={(value, name) => {
                if (name === "Total samples") return [formatCount(Number(value)), name];
                return [formatDuration(Number(value)), name];
              }}
              labelFormatter={(value) => {
                const point = chartData.find((p) => p.time === value);
                const label = `Time: ${(Number(value) / 1000).toFixed(2)}s`;
                return point?.phase ?
                    `${label} — ${point.phase.charAt(0).toUpperCase()}${point.phase.slice(1)}`
                  : label;
              }}
              labelStyle={chartTooltipLabelStyle}
            />
            <Legend wrapperStyle={{ paddingTop: 5, fontSize: 12 }} />
            <Area
              dataKey="iterations"
              fill="url(#samplesFill)"
              isAnimationActive={false}
              name="Total samples"
              stroke={CHART_COLORS.samples}
              strokeWidth={2}
              type="monotone"
              yAxisId="right"
            />
            <Line
              dataKey="timePerOp"
              dot={false}
              isAnimationActive={false}
              name="Time per operation"
              stroke={CHART_COLORS.time}
              strokeWidth={2}
              type="monotone"
              yAxisId="left"
            />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};
