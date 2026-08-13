"use client";

import { useState } from "react";
import type { StatusAnalysis } from "@/lib/types";

interface Props {
  urls: StatusAnalysis["httpCacheUrls"];
  totals: StatusAnalysis["httpCacheTotals"];
}

const INITIAL_ROWS = 25;

export default function HttpCachePanel({ urls, totals }: Props) {
  const [showAll, setShowAll] = useState(false);
  if (!urls.length) return null;

  const visible = showAll ? urls : urls.slice(0, INITIAL_ROWS);
  const maxAccess = urls[0]?.accessCount || 1;
  const queryPct = totals.distinctUrls ? (totals.withQuery / totals.distinctUrls) * 100 : 0;

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h3 className="text-slate-100 font-semibold">HTTP Page Cache Contents</h3>
        <span className="shrink-0 text-xs px-2 py-0.5 rounded-full border font-medium bg-white/5 text-slate-400 border-white/10">
          {totals.distinctUrls.toLocaleString()} distinct URLs
        </span>
      </div>
      <p className="text-slate-500 text-xs mb-5">
        Origin responses currently held in cache, ranked by access count. Access counts are cumulative
        per instance, so the peak observed value is shown.
      </p>

      {totals.withQuery > 0 && (
        <div className="mb-5 rounded-xl p-4 border border-amber-500/20 bg-amber-500/10 text-xs">
          <p className="text-amber-400 font-semibold mb-1">
            {totals.withQuery.toLocaleString()} of {totals.distinctUrls.toLocaleString()} cached URLs (
            {queryPct.toFixed(0)}%) carry a query string
          </p>
          <p className="text-slate-400 leading-relaxed">
            Every distinct query string becomes its own cache key. Where those parameters are tracking
            or click IDs that do not change the response, they fragment the cache and force needless
            origin fetches — normalising them out of the cache key consolidates the entries.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {visible.map((u) => (
          <div key={u.url} className="space-y-1">
            <div className="flex items-baseline justify-between gap-4">
              <span className="font-mono text-[11px] text-slate-300 truncate" title={u.url}>
                {u.url}
              </span>
              <span className="text-slate-400 text-xs shrink-0 tabular-nums">
                {u.accessCount.toLocaleString()}
                {u.hasQuery && <span className="ml-2 text-amber-400/70">?</span>}
              </span>
            </div>
            <div className="h-1 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-400/50"
                style={{ width: `${(u.accessCount / maxAccess) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {urls.length > INITIAL_ROWS && (
        <button
          type="button"
          onClick={() => setShowAll(!showAll)}
          className="mt-4 text-xs text-blue-400 hover:text-blue-300"
        >
          {showAll
            ? `Show top ${INITIAL_ROWS}`
            : `Show all ${urls.length} ranked URLs${
                totals.distinctUrls > urls.length ? ` (of ${totals.distinctUrls.toLocaleString()} total)` : ""
              }`}
        </button>
      )}
    </div>
  );
}
