"use client";

import type { AnalysisResult } from "@/lib/types";

const IMPACT_STYLES: Record<string, { badge: string; bar: string }> = {
  critical: { badge: "bg-red-500/15 text-red-400 border-red-500/30", bar: "bg-red-500" },
  high: { badge: "bg-orange-500/15 text-orange-400 border-orange-500/30", bar: "bg-orange-500" },
  medium: { badge: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30", bar: "bg-yellow-500" },
  low: { badge: "bg-blue-500/15 text-blue-400 border-blue-500/30", bar: "bg-blue-400" },
};

interface Props { patterns: AnalysisResult["patterns"] }

export default function PatternList({ patterns }: Props) {
  const maxOcc = Math.max(...patterns.map((p) => p.occurrences), 1);

  return (
    <div className="glass rounded-2xl p-6">
      <h3 className="text-white font-semibold mb-1">Problem Patterns Detected</h3>
      <p className="text-white/40 text-xs mb-6">{patterns.length} recurring patterns identified in log data</p>
      <div className="grid md:grid-cols-2 gap-4">
        {patterns.map((p, i) => {
          const styles = IMPACT_STYLES[p.impact];
          const pct = Math.round((p.occurrences / maxOcc) * 100);
          return (
            <div key={i} className="rounded-xl bg-white/3 border border-white/6 p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-white text-sm font-semibold leading-tight">{p.name}</p>
                <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full border font-medium ${styles.badge}`}>
                  {p.impact}
                </span>
              </div>
              <p className="text-white/50 text-xs leading-relaxed">{p.description}</p>
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-white/30">
                  <span>Occurrences</span>
                  <span>{p.occurrences.toLocaleString()}</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
                  <div className={`h-full rounded-full ${styles.bar} opacity-80`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
