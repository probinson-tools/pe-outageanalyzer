export interface ErrorEntry {
  type: string;
  count: number;
  severity: "critical" | "high" | "medium" | "low";
  firstSeen: string;
  lastSeen: string;
  sample: string;
}

export interface BotEntry {
  ip: string;
  requests: number;
  userAgent: string;
  classification: string;
  threat: "high" | "medium" | "low";
}

export interface TimelinePoint {
  time: string;
  errors: number;
  warnings: number;
  requests: number;
  memoryPressure: number;
}

export interface PatternEntry {
  name: string;
  description: string;
  occurrences: number;
  impact: "critical" | "high" | "medium" | "low";
}

export interface Recommendation {
  title: string;
  description: string;
  priority: "immediate" | "short-term" | "long-term";
  category: string;
}

export interface AnalysisResult {
  summary: {
    totalErrors: number;
    totalWarnings: number;
    criticalEvents: number;
    timespan: string;
    outageTime: string;
    fileName: string;
    topErrorType: string;
    estimatedCause: string;
  };
  errors: ErrorEntry[];
  bots: BotEntry[];
  timeline: TimelinePoint[];
  patterns: PatternEntry[];
  synopsis: string;
  recommendations: Recommendation[];
  severityDistribution: { name: string; value: number; color: string }[];
  categoryBreakdown: { name: string; count: number }[];
}
