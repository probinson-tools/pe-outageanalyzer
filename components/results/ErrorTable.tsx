"use client";

import type { AnalysisResult } from "@/lib/types";

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-500/15 text-red-400 border-red-500/30",
  high: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  medium: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  low: "bg-green-500/15 text-green-400 border-green-500/30",
};
const FALLBACK_SEVERITY = "bg-white/10 text-white/50 border-white/20";

interface Props { errors: AnalysisResult["errors"] }

export default function ErrorTable({ errors }: Props) {
  if (!errors?.length) return null;
  return (
    <div className="glass rounded-2xl p-6">
      <h3 className="text-slate-100 font-semibold mb-1">Errors &amp; Exceptions</h3>
      <p className="text-slate-500 text-xs mb-4">{errors.length} distinct error types detected</p>
      <div className="space-y-2 max-h-96 overflow-y-auto scrollbar-thin pr-1">
        {errors.map((err, i) => (
          <div key={i} className="rounded-lg bg-white/3 border border-white/8 p-3 space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <span className="text-slate-200 text-sm font-medium leading-tight">{err.type}</span>
              <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full border font-medium ${SEVERITY_STYLES[err.severity] ?? FALLBACK_SEVERITY}`}>
                {err.severity}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span>×{err.count.toLocaleString()}</span>
              <span>First: {err.firstSeen}</span>
              <span>Last: {err.lastSeen}</span>
            </div>
            {err.sample && (
              <p className="text-slate-500 text-xs font-mono leading-relaxed bg-black/30 border border-white/10 rounded px-2 py-1.5 truncate">
                {err.sample}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
