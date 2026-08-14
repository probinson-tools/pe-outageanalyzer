"use client";

import { useState } from "react";
import { STATUS_THRESHOLDS } from "@/lib/statusParser";
import type { CacheUrlPattern, StatusAnalysis } from "@/lib/types";

interface Props {
  patterns: CacheUrlPattern[];
  totals: StatusAnalysis["httpCacheTotals"];
}

const INITIAL_ROWS = 20;

/** Drop the scheme so the pattern column reads as a path, not a URL bar. */
function displayPattern(pattern: string): string {
  return pattern.replace(/^https?:\/\//, "");
}

export default function CacheUrlPatterns({ patterns, totals }: Props) {
  const [showAll, setShowAll] = useState(false);
  if (!patterns.length) return null;

  const visible = showAll ? patterns : patterns.slice(0, INITIAL_ROWS);
  const maxSingle = patterns[0]?.singleAccessCount || 1;
  const singlePct = totals.distinctUrls ? (totals.singleAccessUrls / totals.distinctUrls) * 100 : 0;
  const flagged = patterns.filter((p) => p.flagged);

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h3 className="text-slate-100 font-semibold">Cache Efficiency by URL Pattern</h3>
        <span className="shrink-0 text-xs px-2 py-0.5 rounded-full border font-medium bg-white/5 text-slate-400 border-white/10">
          {totals.patternCount.toLocaleString()} patterns
        </span>
      </div>
      <p className="text-slate-500 text-xs mb-5">
        Cached URLs grouped to host plus their first {STATUS_THRESHOLDS.PATTERN_DIRECTORY_DEPTH} path
        directories, ranked by how many of them were accessed exactly once. An entry accessed once was
        fetched from the origin, stored, and never reused before it expired — it cost a round trip and
        heap and paid nothing back.
      </p>

      <div className="mb-5 rounded-xl bg-white/3 border border-white/8 p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Accessed once</p>
          <p className={`text-lg font-bold mt-0.5 ${singlePct >= 75 ? "text-amber-400" : "text-slate-100"}`}>
            {totals.singleAccessUrls.toLocaleString()}
          </p>
          <p className="text-slate-500 text-xs">{singlePct.toFixed(1)}% of the cache</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Never reused</p>
          <p className="text-slate-100 text-lg font-bold mt-0.5">
            {totals.whollySingleAccessPatterns.toLocaleString()}
          </p>
          <p className="text-slate-500 text-xs">patterns, every entry once</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Flagged</p>
          <p className={`text-lg font-bold mt-0.5 ${flagged.length ? "text-amber-400" : "text-slate-100"}`}>
            {totals.flaggedPatternCount.toLocaleString()}
          </p>
          <p className="text-slate-500 text-xs">patterns worth excluding</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Recoverable</p>
          <p className={`text-lg font-bold mt-0.5 ${flagged.length ? "text-amber-400" : "text-slate-100"}`}>
            {totals.flaggedSingleAccessUrls.toLocaleString()}
          </p>
          <p className="text-slate-500 text-xs">
            {totals.singleAccessUrls
              ? `${((totals.flaggedSingleAccessUrls / totals.singleAccessUrls) * 100).toFixed(0)}% of the waste`
              : "entries"}
          </p>
        </div>
      </div>

      {flagged.length > 0 && (
        <div className="mb-5 rounded-xl p-4 border border-amber-500/20 bg-amber-500/10">
          <p className="text-amber-400 text-xs font-semibold mb-1">
            Candidates for a no-cache rule — high volume, almost never reused
          </p>
          <p className="text-slate-400 text-xs mb-3 leading-relaxed">
            These clear all three bars: at least {STATUS_THRESHOLDS.WASTED_PATTERN_MIN_URLS} cached
            URLs, at least {STATUS_THRESHOLDS.WASTED_PATTERN_MIN_SINGLE_PCT}% of them accessed only
            once, and under {STATUS_THRESHOLDS.WASTED_PATTERN_MAX_REUSE} accesses per URL. Caching
            them buys nothing while occupying heap that working entries could use.
          </p>
          <div className="space-y-1.5">
            {flagged.slice(0, 8).map((p) => (
              <div key={p.pattern} className="flex items-baseline justify-between gap-4">
                <span className="font-mono text-[11px] text-slate-300 truncate" title={p.pattern}>
                  {displayPattern(p.pattern)}
                </span>
                <span className="text-amber-400 text-xs shrink-0 tabular-nums">
                  {p.singleAccessCount.toLocaleString()} wasted
                  <span className="text-slate-500 ml-2">{p.reuseRatio.toFixed(2)}× reuse</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-white/8">
              <th className="pb-2 pr-4 font-semibold">Pattern</th>
              <th className="pb-2 pr-4 font-semibold w-32">Accessed Once</th>
              <th className="pb-2 pr-4 font-semibold text-right">URLs</th>
              <th className="pb-2 pr-4 font-semibold text-right">Share</th>
              <th className="pb-2 pr-4 font-semibold text-right">Accesses</th>
              <th className="pb-2 font-semibold text-right">Reuse</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => (
              <tr key={p.pattern} className="border-b border-white/5 last:border-0">
                <td className="py-2.5 pr-4 max-w-md">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-slate-300 truncate" title={p.pattern}>
                      {displayPattern(p.pattern)}
                    </span>
                    {p.flagged && (
                      <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
                        no-cache
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-2.5 pr-4">
                  <div className="space-y-1">
                    <span className="text-slate-200 text-xs tabular-nums">
                      {p.singleAccessCount.toLocaleString()}
                    </span>
                    <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${p.flagged ? "bg-amber-400/60" : "bg-blue-400/50"}`}
                        style={{ width: `${(p.singleAccessCount / maxSingle) * 100}%` }}
                      />
                    </div>
                  </div>
                </td>
                <td className="py-2.5 pr-4 text-right text-slate-400 text-xs tabular-nums">
                  {p.urlCount.toLocaleString()}
                </td>
                <td
                  className={`py-2.5 pr-4 text-right text-xs tabular-nums ${
                    p.singleAccessPct >= STATUS_THRESHOLDS.WASTED_PATTERN_MIN_SINGLE_PCT
                      ? "text-amber-400"
                      : "text-slate-500"
                  }`}
                >
                  {p.singleAccessPct.toFixed(0)}%
                </td>
                <td className="py-2.5 pr-4 text-right text-slate-400 text-xs tabular-nums">
                  {p.totalAccesses.toLocaleString()}
                </td>
                <td
                  className={`py-2.5 text-right text-xs font-medium tabular-nums ${
                    p.reuseRatio >= 2 ? "text-green-400" : "text-slate-500"
                  }`}
                >
                  {p.reuseRatio.toFixed(2)}×
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {patterns.length > INITIAL_ROWS && (
        <button
          type="button"
          onClick={() => setShowAll(!showAll)}
          className="mt-4 text-xs text-blue-400 hover:text-blue-300"
        >
          {showAll
            ? `Show top ${INITIAL_ROWS}`
            : `Show all ${patterns.length} ranked patterns${
                totals.patternCount > patterns.length ? ` (of ${totals.patternCount.toLocaleString()} total)` : ""
              }`}
        </button>
      )}

      <p className="mt-4 text-slate-600 text-[11px] leading-relaxed">
        A high accessed-once share is not on its own a reason to stop caching a pattern — read it
        against the reuse column. A pattern can be almost entirely single-access and still be the
        hardest-working thing in the cache if a few of its URLs carry heavy traffic, which is why
        reuse is part of the flag and not just the share.{" "}
        <span className="text-slate-500">
          Note also that each dump is a moment in time, so an entry cached shortly before the snapshot
          has had no chance to be reused yet — treat the accessed-once figure as an upper bound on
          true waste.
        </span>
      </p>
    </div>
  );
}
