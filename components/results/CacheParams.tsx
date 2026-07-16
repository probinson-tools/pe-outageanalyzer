"use client";

import type { ParsedLogSummary } from "@/lib/types";

interface Props { params: ParsedLogSummary["queryParams"] }

// Params with many distinct values fragment the page cache (each unique value
// is a separate cache key), so they're the cache-optimization targets.
const HIGH_CARDINALITY = 10;

export default function CacheParams({ params }: Props) {
  const maxDistinct = Math.max(...params.map((p) => p.distinctValues), 1);

  return (
    <div className="glass rounded-2xl p-6">
      <h3 className="text-slate-100 font-semibold mb-1">Cache Optimization — Query Parameters</h3>
      <p className="text-slate-500 text-xs mb-4">
        Distinct values per query parameter across proxied requests. High-cardinality parameters
        (e.g. click/tracking IDs) fragment the cache — each unique value is a separate cache key.
      </p>
      {params.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 text-slate-600">
          <span className="text-sm">No query parameters observed</span>
        </div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto scrollbar-thin pr-1">
          {params.map((p, i) => {
            const high = p.distinctValues >= HIGH_CARDINALITY;
            return (
              <div key={i} className="rounded-lg bg-white/3 border border-white/8 p-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-slate-200 text-sm font-mono truncate">{p.name}</span>
                    {high && (
                      <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full border font-medium bg-red-500/15 text-red-400 border-red-500/30">
                        cache-buster
                      </span>
                    )}
                  </div>
                  <span className="shrink-0 text-slate-400 text-xs">
                    {p.distinctValues.toLocaleString()} distinct / {p.occurrences.toLocaleString()} req
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
                  <div
                    className={`h-full rounded-full opacity-80 ${high ? "bg-red-400" : "bg-blue-400"}`}
                    style={{ width: `${(p.distinctValues / maxDistinct) * 100}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
