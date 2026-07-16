"use client";

import type { ParsedLogSummary } from "@/lib/types";

interface Props { patterns: ParsedLogSummary["topUrlPatterns"] }

export default function TopUrlPatterns({ patterns }: Props) {
  if (!patterns?.length) return null;
  const maxCount = Math.max(...patterns.map((p) => p.count), 1);

  return (
    <div className="glass rounded-2xl p-6">
      <h3 className="text-slate-100 font-semibold mb-1">Top URL Patterns</h3>
      <p className="text-slate-500 text-xs mb-4">
        Host + path (query strings stripped) from failed/rejected requests
      </p>
      <div className="space-y-2 max-h-96 overflow-y-auto scrollbar-thin pr-1">
        {patterns.map((p, i) => (
          <div key={i} className="rounded-lg bg-white/3 border border-white/8 p-3 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-200 text-sm font-mono truncate">{p.pattern}</span>
              <span className="shrink-0 text-slate-400 text-xs">{p.count.toLocaleString()}</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
              <div className="h-full rounded-full bg-blue-400 opacity-80" style={{ width: `${(p.count / maxCount) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
