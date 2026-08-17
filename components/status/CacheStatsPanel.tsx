"use client";

import { STATUS_THRESHOLDS } from "@/lib/statusParser";
import type { CacheRollup, EhCacheRollup, FleetStat, StaticCacheStat, Stat3 } from "@/lib/types";

interface Props {
  caches: CacheRollup[];
  ehCaches: EhCacheRollup[];
  staticCaches: StaticCacheStat[];
  multiSnapshot: boolean;
}

function pct(v: number | null): string {
  return v === null ? "—" : `${v.toFixed(2)}%`;
}

function mb(bytes: number): string {
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function count(v: number): string {
  return Math.round(v).toLocaleString();
}

/**
 * Average with the observed range beside it. The range is dropped when there is only one
 * sample, or when every snapshot agreed — repeating the same number three times is noise.
 */
function Ranged({ stat, format }: { stat: Stat3 | null; format: (n: number) => string }) {
  if (!stat) return <span className="text-slate-500">—</span>;
  const lo = format(stat.min);
  const hi = format(stat.max);
  // Compared after formatting: values that differ only below the displayed precision
  // would otherwise render a pointless "(100.00–100.00)".
  return (
    <span className="whitespace-nowrap">
      {format(stat.avg)}
      {lo !== hi && (
        <span className="text-slate-600 ml-1">
          ({lo}–{hi})
        </span>
      )}
    </span>
  );
}

/**
 * A fleet total with the per-instance contribution range beneath it. The range is what
 * shows whether the work is spread evenly across the pool or concentrated on one backend.
 *
 * Stacked rather than inline because these totals run to nine digits and the range adds
 * another two of them — side by side they force the table into horizontal scroll and
 * squeeze the narrower columns until their headers wrap.
 */
function Fleet({ stat, format }: { stat: FleetStat | null; format: (n: number) => string }) {
  if (!stat || !stat.instances) return <span className="text-slate-500">n/a</span>;
  const lo = format(stat.min);
  const hi = format(stat.max);
  return (
    <div className="whitespace-nowrap">
      <div>{format(stat.total)}</div>
      {stat.instances > 1 && lo !== hi && (
        <div className="text-slate-600 text-[11px]">
          {lo}–{hi} ea
        </div>
      )}
    </div>
  );
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
              ? "Every figure is the average across snapshots, with the observed range in parentheses. Because the polled URL is load balanced, a single reading would be whichever backend answered last — a wide range means the instances genuinely disagree."
              : "Point-in-time reading from a single snapshot."}{" "}
            A cache below {STATUS_THRESHOLDS.LOW_HIT_RATIO_PCT}% is holding memory without saving many origin fetches.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-white/8">
                  <th className="pb-2 pr-4 font-semibold whitespace-nowrap">Cache</th>
                  <th className="pb-2 pr-4 font-semibold w-40">Hit Ratio</th>
                  {multiSnapshot && <th className="pb-2 pr-4 font-semibold whitespace-nowrap">Min / Max</th>}
                  <th className="pb-2 pr-4 font-semibold whitespace-nowrap">Entries</th>
                  <th className="pb-2 pr-4 font-semibold whitespace-nowrap">Size</th>
                  <th className="pb-2 font-semibold whitespace-nowrap">LRU Evictions</th>
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
                            c.hitRatio && c.hitRatio.avg < STATUS_THRESHOLDS.LOW_HIT_RATIO_PCT
                              ? "text-amber-400"
                              : "text-slate-200"
                          }`}
                        >
                          {pct(c.hitRatio?.avg ?? null)}
                        </span>
                        <RatioBar value={c.hitRatio?.avg ?? null} />
                      </div>
                    </td>
                    {multiSnapshot && (
                      <td className="py-2.5 pr-4 text-slate-500 text-xs whitespace-nowrap">
                        {pct(c.hitRatio?.min ?? null)} / {pct(c.hitRatio?.max ?? null)}
                      </td>
                    )}
                    <td className="py-2.5 pr-4 text-slate-300 text-xs">
                      <Ranged stat={c.entries} format={count} />
                    </td>
                    <td className="py-2.5 pr-4 text-slate-300 text-xs">
                      <Ranged stat={c.dataSizeMb} format={(n) => `${n.toFixed(1)} MB`} />
                    </td>
                    <td className="py-2.5 text-slate-400 text-xs">
                      <Ranged stat={c.evictions} format={count} />
                    </td>
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
            Counters are cumulative since each instance started, so no single snapshot describes the
            pool. Gets, misses, evictions and on-heap size are <span className="text-slate-400">fleet
            totals</span>: each instance&rsquo;s readings are averaged, then those averages summed.
            The smaller figure beneath each total is the per-instance range, so a wide spread means
            the work is landing unevenly across the backends. The hit rate is volume-weighted and derived from
            the same totals, not an average of the per-instance percentages. Evictions mean the cache
            is sized below its working set.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-white/8">
                  <th className="pb-2 pr-4 font-semibold whitespace-nowrap">Cache</th>
                  <th className="pb-2 pr-4 font-semibold whitespace-nowrap">Hit Rate</th>
                  <th className="pb-2 pr-4 font-semibold whitespace-nowrap">Gets</th>
                  <th className="pb-2 pr-4 font-semibold whitespace-nowrap">Misses</th>
                  <th className="pb-2 pr-4 font-semibold whitespace-nowrap">Evictions</th>
                  <th className="pb-2 pr-4 font-semibold whitespace-nowrap">On Heap</th>
                  <th className="pb-2 font-semibold whitespace-nowrap">TTL</th>
                </tr>
              </thead>
              <tbody>
                {ehCaches.map((e) => (
                  <tr key={e.name} className="border-b border-white/5 last:border-0">
                    <td className="py-2.5 pr-4 font-mono text-xs text-slate-300">{e.name}</td>
                    <td className="py-2.5 pr-4">
                      <div className="space-y-1 whitespace-nowrap">
                        <span
                          className={`text-xs font-medium ${
                            e.hitPercentage.pooled < STATUS_THRESHOLDS.LOW_HIT_RATIO_PCT
                              ? "text-amber-400"
                              : "text-slate-200"
                          }`}
                        >
                          {e.hitPercentage.pooled.toFixed(2)}%
                          {e.hitPercentage.min.toFixed(2) !== e.hitPercentage.max.toFixed(2) && (
                            <span className="text-slate-600 ml-1 font-normal">
                              ({e.hitPercentage.min.toFixed(2)}–{e.hitPercentage.max.toFixed(2)})
                            </span>
                          )}
                        </span>
                        <RatioBar value={e.hitPercentage.pooled} />
                      </div>
                    </td>
                    <td className="py-2.5 pr-4 text-slate-300 text-xs">
                      <Fleet stat={e.gets} format={count} />
                    </td>
                    <td className="py-2.5 pr-4 text-slate-400 text-xs">
                      <Fleet stat={e.misses} format={count} />
                    </td>
                    <td className={`py-2.5 pr-4 text-xs ${e.evictions.total > 0 ? "text-amber-400" : "text-slate-400"}`}>
                      <Fleet stat={e.evictions} format={count} />
                    </td>
                    <td className="py-2.5 pr-4 text-slate-300 text-xs">
                      <Fleet stat={e.onHeapBytes} format={mb} />
                    </td>
                    <td className="py-2.5 text-slate-500 text-xs">{e.creationExpiry ?? "—"}</td>
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
