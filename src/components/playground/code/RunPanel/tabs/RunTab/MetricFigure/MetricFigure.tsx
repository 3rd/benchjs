interface MetricFigureProps {
  label: string;
  value: string;
  unit?: string;
  caption?: string;
}

export const MetricFigure = ({ label, value, unit, caption }: MetricFigureProps) => (
  <div>
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="text-2xl font-semibold tracking-tight tabular-nums">
      {value}
      {unit && <span className="ml-1 text-sm font-normal tracking-normal text-muted-foreground">{unit}</span>}
    </p>
    {caption && <p className="text-xs text-muted-foreground tabular-nums">{caption}</p>}
  </div>
);
