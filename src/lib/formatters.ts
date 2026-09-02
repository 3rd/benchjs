export const formatDuration = (ms: number): string => {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  if (ms >= 1) return `${ms.toFixed(2)}ms`;
  if (ms >= 0.001) return `${(ms * 1000).toFixed(2)}µs`;
  return `${(ms * 1_000_000).toFixed(2)}ns`;
};

export const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
};

export const formatCount = (num: number): string => {
  return new Intl.NumberFormat("en-US").format(Math.floor(num));
};

export const formatCountShort = (value: number): string => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return value.toString();
};

export const formatOps = (value: number | null): string => {
  return value === null ? "-" : formatCount(Math.round(value));
};
