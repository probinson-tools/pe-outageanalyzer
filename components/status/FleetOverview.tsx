"use client";

import { seriesColor } from "@/lib/chartTheme";
import type { StatusAnalysis } from "@/lib/types";

interface Props { analysis: StatusAnalysis }

function maxOf(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v !== null);
  return nums.length ? Math.max(...nums) : null;
}

function avgOf(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v !== null);
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

export default function FleetOverview({ analysis }: Props) {
  const { instances, fleet, flags } = analysis;
  if (!instances.length) return null;

  // Colour each distinct properties hash so drift is visible at a glance rather than
  // needing the reader to diff long signed integers by eye.
  const hashRank = new Map(fleet.propertiesHashes.map((g, i) => [g.value, i]));

  return (
    <div className="glass rounded-2xl p-6">
      <h3 className="text-slate-100 font-semibold mb-1">Server Fleet</h3>
      <p className="text-slate-500 text-xs mb-5">
        One row per JVM run. The polled URL is load balanced, so each snapshot lands on whichever
        backend answered — cumulative counters only line up within a row.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-white/8">
              <th className="pb-2 pr-4 font-semibold">Instance</th>
              <th className="pb-2 pr-4 font-semibold">Started</th>
              <th className="pb-2 pr-4 font-semibold">Version</th>
              <th className="pb-2 pr-4 font-semibold">Properties Hash</th>
              <th className="pb-2 pr-4 font-semibold text-right">Snapshots</th>
              <th className="pb-2 pr-4 font-semibold text-right">Avg req/s</th>
              <th className="pb-2 pr-4 font-semibold text-right">Peak Heap</th>
              <th className="pb-2 font-semibold text-right">Peak Threads</th>
            </tr>
          </thead>
          <tbody>
            {instances.map((inst, i) => {
              const peakHeap = maxOf(inst.points.map((p) => p.heapUsedPct));
              const avgRps = avgOf(inst.points.map((p) => p.rps));
              const peakThreads = maxOf(inst.points.map((p) => p.threadCount));
              const rank = inst.propertiesHash ? hashRank.get(inst.propertiesHash) ?? 0 : 0;
              const restarted = flags.restartedInstanceIds.includes(inst.instanceId);

              return (
                <tr key={inst.key} className="border-b border-white/5 last:border-0">
                  <td className="py-2.5 pr-4">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: seriesColor(i) }} />
                      <span className="font-mono text-slate-100">{inst.instanceId}</span>
                      {restarted && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
                          restarted
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 pr-4 text-slate-400 text-xs whitespace-nowrap">{inst.startTime ?? "—"}</td>
                  <td className="py-2.5 pr-4 text-slate-400 text-xs whitespace-nowrap">{inst.version ?? "—"}</td>
                  <td className="py-2.5 pr-4">
                    <span
                      className={`font-mono text-xs px-2 py-0.5 rounded border ${
                        flags.configDriftDetected
                          ? "bg-red-500/10 text-red-300 border-red-500/25"
                          : "bg-white/5 text-slate-400 border-white/10"
                      }`}
                      title={flags.configDriftDetected ? `Config group ${rank + 1} of ${fleet.propertiesHashes.length}` : undefined}
                    >
                      {inst.propertiesHash ?? "—"}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-right text-slate-300">{inst.snapshotCount}</td>
                  <td className="py-2.5 pr-4 text-right text-slate-300">{avgRps !== null ? avgRps.toFixed(2) : "—"}</td>
                  <td className="py-2.5 pr-4 text-right text-slate-300">{peakHeap !== null ? `${peakHeap.toFixed(1)}%` : "—"}</td>
                  <td className="py-2.5 text-right text-slate-300">{peakThreads ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {flags.configDriftDetected && (
        <div className="mt-5 rounded-xl p-4 border border-red-500/20 bg-red-500/10 text-xs space-y-2">
          <p className="text-red-400 font-semibold">
            Config drift: {fleet.propertiesHashes.length} distinct properties hashes across the pool
          </p>
          <p className="text-slate-400 leading-relaxed">
            The hash already excludes host-specific keys
            {analysis.snapshots[0]?.excludes.length
              ? ` (${analysis.snapshots[0].excludes.join(", ")})`
              : ""}
            , so identical configurations should hash identically. Backends serving the same site
            with different effective properties will behave differently under the same traffic.
          </p>
          <div className="space-y-1 pt-1">
            {fleet.propertiesHashes.map((g) => (
              <p key={g.value} className="font-mono text-slate-400">
                <span className="text-slate-200">{g.value}</span> → instance {g.instanceIds.join(", ")}
              </p>
            ))}
          </div>
          {fleet.propertiesVersions.length === 1 && (
            <p className="text-slate-500 pt-1">
              All instances report properties version {fleet.propertiesVersions[0].value} — same version, different
              effective config.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
