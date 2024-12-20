export const formatTime = (ms: number): string => {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(2)}s`;
  }
  
  if (ms >= 1) {
    return `${ms.toFixed(2)}ms`;
  }
  
  if (ms >= 0.001) {
    return `${(ms * 1000).toFixed(2)}µs`;
  }
  
  return `${(ms * 1000000).toFixed(2)}ns`;
};

export const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
};
