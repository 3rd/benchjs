import { CSSProperties } from "react";

export const CHART_COLORS = {
  time: "var(--chart-time)",
  samples: "var(--chart-samples)",
  grid: "var(--color-border)",
  label: "var(--color-muted-foreground)",
};

export const chartAxisTick = {
  fill: CHART_COLORS.label,
  fontSize: 11,
};

export const chartTooltipStyle: CSSProperties = {
  backgroundColor: "var(--color-popover)",
  border: "1px solid var(--color-border)",
  borderRadius: "calc(var(--radius) - 4px)",
  boxShadow: "0 4px 12px rgb(0 0 0 / 0.1)",
  color: "var(--color-popover-foreground)",
  fontSize: 12,
};

export const chartTooltipLabelStyle: CSSProperties = {
  color: "var(--color-popover-foreground)",
  fontWeight: 500,
};
