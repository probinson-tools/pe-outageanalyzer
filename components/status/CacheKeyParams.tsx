"use client";

import { useState } from "react";
import type { CacheKeyParam, StatusAnalysis } from "@/lib/types";


interface Props {
  params: CacheKeyParam[];
  totals: StatusAnalysis["httpCacheTotals"];
}

const INITIAL_ROWS = 15;

export default function CacheKeyParams({ params, totals }: Props) {
  const [showAll, setShowAll] = useState(false);
  if (!params.length) return null;

  const visible = showAll ? params : params.slice(0, INITIAL_ROWS);
  const maxUrls = params[0]?.urlCount || 1;
  const ceiling = totals.withQuery - totals.collapsedIfNoParams;

  const byMerge = (a: CacheKeyParam, b: CacheKeyParam) => b.collapsesTo - a.collapsesTo;

  // Known click IDs cannot change what the origin returns, so excluding them is safe.
  const safeCandidates = [...params]
    .filter((p) => p.collapsesTo > 0 && p.likelyTracking)
    .sort(byMerge)
    .slice(0, 8);

  // Churny but unrecognised. These are NOT presented as safe: a SKU, product code,
  // page number or search term is highly unique *and* selects the content, so
  // excluding it would serve the wrong page. Surfaced for a human to judge.
  const reviewCandidates = [...params]
    .filter((p) => p.collapsesTo > 0 && !p.likelyTracking && p.uniquenessPct >= 50)
    .sort(byMerge)
    .slice(0, 8);

  const Chip = ({ p }: { p: CacheKeyParam }) => (
    <span
      className="text-xs px-2 py-1 rounded border bg-white/5 text-slate-300 border-white/10 font-mono"
      title={`${p.distinctValues} distinct values across ${p.urlCount} cached URLs`}
    >
      {p.name}
      <span className="text-amber-400 ml-2">−{p.collapsesTo}</span>
    </span>
  );

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h3 className="text-slate-100 font-semibold">Cache Key Parameters</h3>
        <span className="shrink-0 text-xs px-2 py-0.5 rounded-full border font-medium bg-white/5 text-slate-400 border-white/10">
          {params.length} distinct parameters
        </span>
      </div>
      <p className="text-slate-500 text-xs mb-5">
        Every query parameter across the cached URLs, ranked by how many cached entries carry it.
        Each distinct query string is its own cache key, so a parameter that varies without changing
        the origin response splits one page into many entries and forces needless origin fetches.
      </p>

      <div className="mb-5 rounded-xl bg-white/3 border border-white/8 p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">URLs with params</p>
          <p className="text-slate-100 text-lg font-bold mt-0.5">{totals.withQuery.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Distinct paths</p>
          <p className="text-slate-100 text-lg font-bold mt-0.5">{totals.collapsedIfNoParams.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Upper bound</p>
          <p className={`text-lg font-bold mt-0.5 ${ceiling > 0 ? "text-amber-400" : "text-slate-100"}`}>
            −{ceiling.toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Fragmentation</p>
          <p className="text-slate-100 text-lg font-bold mt-0.5">
            {totals.collapsedIfNoParams ? (totals.withQuery / totals.collapsedIfNoParams).toFixed(1) : "—"}×
          </p>
        </div>
        <p className="col-span-2 md:col-span-4 text-slate-500 text-xs leading-relaxed">
          Those {totals.withQuery.toLocaleString()} entries cover only{" "}
          {totals.collapsedIfNoParams.toLocaleString()} distinct paths. Excluding every parameter from
          the key is the ceiling, not a recommendation — parameters that genuinely change the response
          must stay in.
        </p>
      </div>

      {safeCandidates.length > 0 && (
        <div className="mb-4 rounded-xl p-4 border border-green-500/20 bg-green-500/10">
          <p className="text-green-400 text-xs font-semibold mb-1">
            Known click IDs — safe to exclude from the cache key
          </p>
          <p className="text-slate-400 text-xs mb-3 leading-relaxed">
            These match well-known ad and analytics tracking patterns. They are passed for attribution
            and cannot change what the origin returns, so excluding them merges entries without
            affecting what gets served.
          </p>
          <div className="flex flex-wrap gap-2">
            {safeCandidates.map((p) => (
              <Chip key={p.name} p={p} />
            ))}
          </div>
        </div>
      )}

      {reviewCandidates.length > 0 && (
        <div className="mb-5 rounded-xl p-4 border border-amber-500/20 bg-amber-500/10">
          <p className="text-amber-400 text-xs font-semibold mb-1">
            High value churn — confirm before excluding
          </p>
          <p className="text-slate-400 text-xs mb-3 leading-relaxed">
            These fragment the cache too, but they are not recognised tracking parameters and their
            purpose cannot be inferred from the name alone. A parameter that <em>selects</em> content
            — a SKU, product code, page number, search term or filter — is highly unique precisely
            because it identifies the page, and excluding it would serve the wrong response. Confirm
            with the site owner before changing the key for any of these.
          </p>
          <div className="flex flex-wrap gap-2">
            {reviewCandidates.map((p) => (
              <Chip key={p.name} p={p} />
            ))}
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-white/8">
              <th className="pb-2 pr-4 font-semibold">Parameter</th>
              <th className="pb-2 pr-4 font-semibold w-32">Cached URLs</th>
              <th className="pb-2 pr-4 font-semibold text-right">Accesses</th>
              <th className="pb-2 pr-4 font-semibold text-right">Distinct Values</th>
              <th className="pb-2 pr-4 font-semibold text-right">Unique</th>
              <th className="pb-2 font-semibold text-right">Merges If Excluded</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => (
              <tr key={p.name} className="border-b border-white/5 last:border-0">
                <td className="py-2.5 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-slate-200">{p.name}</span>
                    {p.likelyTracking && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30"
                        title="Matches a well-known ad or analytics click-ID pattern"
                      >
                        tracking
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-2.5 pr-4">
                  <div className="space-y-1">
                    <span className="text-slate-300 text-xs tabular-nums">{p.urlCount.toLocaleString()}</span>
                    <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-blue-400/50"
                        style={{ width: `${(p.urlCount / maxUrls) * 100}%` }}
                      />
                    </div>
                  </div>
                </td>
                <td className="py-2.5 pr-4 text-right text-slate-400 text-xs tabular-nums">
                  {p.accessCount.toLocaleString()}
                </td>
                <td className="py-2.5 pr-4 text-right text-slate-300 text-xs tabular-nums">
                  {p.distinctValues.toLocaleString()}
                </td>
                <td
                  className={`py-2.5 pr-4 text-right text-xs tabular-nums ${
                    p.uniquenessPct >= 90 ? "text-amber-400" : "text-slate-500"
                  }`}
                >
                  {p.uniquenessPct.toFixed(0)}%
                </td>
                <td
                  className={`py-2.5 text-right text-xs font-medium tabular-nums ${
                    p.collapsesTo > 0 ? "text-amber-400" : "text-slate-600"
                  }`}
                >
                  {p.collapsesTo > 0 ? `−${p.collapsesTo.toLocaleString()}` : "0"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {params.length > INITIAL_ROWS && (
        <button
          type="button"
          onClick={() => setShowAll(!showAll)}
          className="mt-4 text-xs text-blue-400 hover:text-blue-300"
        >
          {showAll ? `Show top ${INITIAL_ROWS}` : `Show all ${params.length} parameters`}
        </button>
      )}

      <p className="mt-4 text-slate-600 text-[11px] leading-relaxed">
        &ldquo;Merges if excluded&rdquo; is measured for each parameter on its own, so the figures do
        not add up. Two parameters on the same URLs each report a merge the other would also achieve,
        and a parameter can read 0 simply because another one still splits those URLs apart —
        <span className="text-slate-500"> high volume with 0 merges usually means a co-occurring parameter is the real cause.</span>
      </p>
    </div>
  );
}
