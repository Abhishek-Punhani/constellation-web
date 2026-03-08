export const STATE_COLORS: Record<string, string> = {
  NEW: "#6b7280",
  INIT: "#3b82f6",
  ORBIT: "#06b6d4",
  RUN: "#10b981",
  SAFE: "#f59e0b",
  ERROR: "#ef4444",
  DEAD: "#374151",
  TRANSITIONING: "#8b5cf6",
};

export const LOG_LEVEL_ORDER = [
  "TRACE",
  "DEBUG",
  "INFO",
  "STATUS",
  "WARNING",
  "CRITICAL",
] as const;
