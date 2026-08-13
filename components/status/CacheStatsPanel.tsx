"use client";

import { STATUS_THRESHOLDS } from "@/lib/statusParser";
import type { CacheRollup, EhCacheStat, StaticCacheStat } from "@/lib/types";

interface Props {
  caches: CacheRollup[];
  ehCaches: EhCacheStat[];
  staticCaches: StaticCacheStat[];
  multiSnapshot: boolean;
}

function pct(v: number | null): string {
  return v === null ? "—" : `${v.toFixed(2)}%`;
}

function mb(bytes: number): string {
  // EhCache reports -1 when on-heap sizing is disabled for that cache.
  if (bytes < 0) return "n/a";
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

/** Proportional bar; colour tracks whether the cache is actually earning its memory. */
function RatioBar({ value }: { value: number | null }) {
  if (value === null) return null;
  const low = value < STATUS_THRESHOLDS.LOW_HIT_RATIO_PCT;
  return (
    <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
      <div
        className={`h-full rounded-full ${low ? "bg-amber-400/70" : "bg-blue-400/70"}`}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

export default function CacheStatsPanel({ caches, ehCaches, staticCaches, multiSnapshot }: Props) {
  if (!caches.length && !ehCaches.length && !staticCaches.length) return null;

  return (
    <div className="space-y-8">
      {caches.length > 0 && (
        <div className="glass rounded-2xl p-6">
          <h3 className="text-slate-100 font-semibold mb-1">Cache Hit Ratios</h3>
          <p className="text-slate-500 text-xs mb-5">
            Page, segment and file caches.{" "}
            {multiSnapshot
              ? "Hit ratios are averaged across snapshots; entries and size are the latest reading."
              : "Point-in-time reading from a single snapshot."}{" "}
            A cache below {STATUS_THRESHOLDS.LOW_HIT_RATIO_PCT}% is holding memory without saving many origin fetches.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-white/8">
                  <th className="pb-2 pr-4 font-semibold">Cache</th>
                  <th className="pb-2 pr-4 font-semibold w-40">Hit Ratio</th>
                  {multiSnapshot && <th className="pb-2 pr-4 font-semibold text-right">Min / Max</th>}
                  <th className="pb-2 pr-4 font-semibold text-right">Entries</th>
                  <th className="pb-2 pr-4 font-semibold text-right">Size</th>
                  <th className="pb-2 font-semibold text-right">LRU Evictions</th>
                </tr>
              </thead>
              <tbody>
                {caches.map((c) => (
                  <tr key={c.name} className="border-b border-white/5 last:border-0">
                    <td className="py-2.5 pr-4 text-slate-300 text-xs">{c.name}</td>
                    <td className="py-2.5 pr-4">
                      <div className="space-y-1">
                        <span
                          className={`text-xs font-medium ${
                            c.avgHitRatio !== null && c.avgHitRatio < STATUS_THRESHOLDS.LOW_HIT_RATIO_PCT
                              ? "text-amber-400"
                              : "text-slate-200"
                          }`}
                        >
                          {pct(c.avgHitRatio)}
                        </span>
                        <RatioBar value={c.avgHitRatio} />
                      </div>
                    </td>
                    {multiSnapshot && (
                      <td className="py-2.5 pr-4 text-right text-slate-500 text-xs whitespace-nowrap">
                        {pct(c.minHitRatio)} / {pct(c.maxHitRatio)}
                      </td>
                    )}
                    <td className="py-2.5 pr-4 text-right text-slate-300 text-xs">{c.latestEntries.toLocaleString()}</td>
                    <td className="py-2.5 pr-4 text-right text-slate-300 text-xs">{c.latestDataSizeMb.toLocaleString()} MB</td>
                    <td className="py-2.5 text-right text-slate-400 text-xs">{c.totalEvictions.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {staticCaches.length > 0 && (
            <div className="mt-5 pt-4 border-t border-white/8 flex flex-wrap gap-x-8 gap-y-2">
              {staticCaches.map((s) => (
                <div key={s.name} className="text-xs">
                  <span className="text-slate-500">{s.name}: </span>
                  <span className="text-slate-300">{s.entries.toLocaleString()} entries</span>
                  <span className="text-slate-600"> · {s.dataSizeMb} MB</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {ehCaches.length > 0 && (
        <div className="glass rounded-2xl p-6">
          <h3 className="text-slate-100 font-semibold mb-1">EhCache</h3>
          <p className="text-slate-500 text-xs mb-5">
            Counters are cumulative since instance start, so these show the latest reading rather than
            a sum across snapshots. Evictions mean the cache is sized below its working set.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-white/8">
                  <th className="pb-2 pr-4 font-semibold">Cache</th>
                  <th className="pb-2 pr-4 font-semibold w-40">Hit Rate</th>
                  <th className="pb-2 pr-4 font-semibold text-right">Gets</th>
                  <th className="pb-2 pr-4 font-semibold text-right">Misses</th>
                  <th className="pb-2 pr-4 font-semibold text-right">Evictions</th>
                  <th className="pb-2 pr-4 font-semibold text-right">On Heap</th>
                  <th className="pb-2 font-semibold text-right">TTL</th>
                </tr>
              </thead>
              <tbody>
                {ehCaches.map((e) => (
                  <tr key={e.name} className="border-b border-white/5 last:border-0">
                    <td className="py-2.5 pr-4 font-mono text-xs text-slate-300">{e.name}</td>
                    <td className="py-2.5 pr-4">
                      <div className="space-y-1">
                        <span
                          className={`text-xs font-medium ${
                            e.hitPercentage < STATUS_THRESHOLDS.LOW_HIT_RATIO_PCT ? "text-amber-400" : "text-slate-200"
                          }`}
                        >
                          {e.hitPercentage.toFixed(2)}%
                        </span>
                        <RatioBar value={e.hitPercentage} />
                      </div>
                    </td>
                    <td className="py-2.5 pr-4 text-right text-slate-300 text-xs">{e.gets.toLocaleString()}</td>
                    <td className="py-2.5 pr-4 text-right text-slate-400 text-xs">{e.misses.toLocaleString()}</td>
                    <td className={`py-2.5 pr-4 text-right text-xs ${e.evictions > 0 ? "text-amber-400" : "text-slate-400"}`}>
                      {e.evictions.toLocaleString()}
                    </td>
                    <td className="py-2.5 pr-4 text-right text-slate-300 text-xs">{mb(e.onHeapBytes)}</td>
                    <td className="py-2.5 text-right text-slate-500 text-xs">{e.creationExpiry ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
