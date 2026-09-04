import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartDataPoint } from "@/stores/benchmarkStore";
import { CHART_COLORS, chartAxisTick, chartTooltipLabelStyle, chartTooltipStyle } from "@/lib/chart-style";
import { formatCount, formatCountShort } from "@/lib/formatters";

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
  averageOpsPerSecond: number;
}

export const PerformanceChart = ({ chartData, isRunning, averageOpsPerSecond }: PerformanceChartProps) => {
  const points = useMemo(
    () =>
      chartData
        .filter((point) => point.timePerOp > 0)
        .map((point) => ({ ...point, opsPerSecond: 1000 / point.timePerOp })),
    [chartData],
  );

  const phaseRegions = useMemo(() => {
    const regions: PhaseRegion[] = [];
    for (const point of points) {
      if (!point.phase) continue;
      const previous = regions[regions.length - 1];
      if (previous && previous.phase === point.phase) {
        previous.end = point.time;
      } else {
        regions.push({ phase: point.phase, start: previous ? previous.end : 0, end: point.time });
      }
    }
    return regions;
  }, [points]);

  const chartSpan = points[points.length - 1]?.time ?? 0;
  const useLogScale = points.length > 1;

  return (
    <div className="h-[220px]">
      <ResponsiveContainer height="100%" width="100%">
        <LineChart data={points} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
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
            domain={useLogScale ? ["dataMin", "dataMax"] : [0, "auto"]}
            scale={useLogScale ? "log" : "linear"}
            tick={chartAxisTick}
            tickFormatter={formatCountShort}
            tickLine={false}
            width={48}
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
            />
          ))}
          {!isRunning && averageOpsPerSecond > 0 && (
            <ReferenceLine
              label={{
                value: "Mean",
                position: "insideTopRight",
                fill: CHART_COLORS.label,
                fontSize: 10,
              }}
              stroke={CHART_COLORS.time}
              strokeDasharray="4 4"
              strokeOpacity={0.6}
              y={averageOpsPerSecond}
            />
          )}
          <Tooltip
            contentStyle={chartTooltipStyle}
            formatter={(value) => [`${formatCount(Math.round(Number(value)))} ops/s`, "Throughput"]}
            labelFormatter={(value) => {
              const point = points.find((p) => p.time === value);
              const label = `Time: ${(Number(value) / 1000).toFixed(2)}s`;
              return point?.phase ?
                  `${label}: ${point.phase.charAt(0).toUpperCase()}${point.phase.slice(1)}`
                : label;
            }}
            labelStyle={chartTooltipLabelStyle}
          />
          <Line
            dataKey="opsPerSecond"
            dot={false}
            isAnimationActive={false}
            name="Throughput"
            stroke={CHART_COLORS.time}
            strokeWidth={2}
            type="monotone"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
