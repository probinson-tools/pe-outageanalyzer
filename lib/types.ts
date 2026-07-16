// ── AI response (Claude fills this in, grounded in ParsedLogSummary + Confluence) ──

export interface Recommendation {
  title: string;
  description: string;
  priority: "immediate" | "short-term" | "long-term";
  category: "memory" | "database" | "caching" | "passthrough" | "blocking" | "monitoring" | "configuration";
  configReference?: string;
}

export interface AnalysisResult {
  synopsis: string;
  recommendations: Recommendation[];
}

// ── Parsed log data (deterministic, computed client-side by lib/logParser.ts) ──

export interface ChartPoint {
  time: number;
  threadCount: number;
  dbPoolSize: number;
  memoryUsedPct: number | null;
  oomCount: number;
}

export interface TopError {
  type: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  sample: string;
}

export interface TopIp {
  ip: string;
  count: number;
}

export interface TopUserAgent {
  userAgent: string;
  count: number;
}

export interface TopUrlPattern {
  pattern: string;
  count: number;
}

export interface ParsedLogSummary {
  fileName: string;
  lineCount: number;
  timespan: { start: string; end: string } | null;
  chartPoints: ChartPoint[];
  dbPoolServerName: string | null;
  topErrors: TopError[];
  topIps: TopIp[];
  topUserAgents: TopUserAgent[];
  topUrlPatterns: TopUrlPattern[];
  flags: {
    dbPoolLeakSuspected: boolean;
    oomDetected: boolean;
    oomTotal: number;
    peakDbPoolSize: number;
    peakThreadCount: number;
    minFreeMemoryPct: number | null;
    totalExceptions: number;
    distinctErrorTypes: number;
  };
}
