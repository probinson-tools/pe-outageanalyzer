"use client";

import type { StatusAnalysis } from "@/lib/types";

interface Props {
  threadStates: StatusAnalysis["threadStates"];
  sslErrorHosts: StatusAnalysis["sslErrorHosts"];
}

// Ordered worst-first: a BLOCKED thread is contending on a monitor, a RUNNABLE one is
// doing work, and the waiting states are usually idle pool threads.
const STATE_ORDER = ["BLOCKED", "RUNNABLE", "WAITING", "TIMED_WAITING", "NEW", "TERMINATED"];

const STATE_COLOR: Record<string, string> = {
  BLOCKED: "bg-red-400/70",
  RUNNABLE: "bg-green-400/70",
  WAITING: "bg-slate-400/50",
  TIMED_WAITING: "bg-slate-500/50",
  NEW: "bg-blue-400/60",
  TERMINATED: "bg-amber-400/60",
};

function fmtTime(time: number): string {
  return Number.isFinite(time) ? new Date(time).toLocaleTimeString() : "—";
}

export default function ThreadStateBreakdown({ threadStates, sslErrorHosts }: Props) {
  const populated = threadStates.filter((s) => Object.keys(s.byState).length > 0);
  if (!populated.length && !sslErrorHosts.length) return null;

  const seenStates = STATE_ORDER.filter((s) => populated.some((p) => p.byState[s] > 0));

  return (
    <div className="space-y-8">
      {populated.length > 0 && (
        <div className="glass rounded-2xl p-6">
          <h3 className="text-slate-100 font-semibold mb-1">Thread States</h3>
          <p className="text-slate-500 text-xs mb-5">
            Every dumped thread per snapshot, by state. Full stacks are retained only for threads tied
            to in-flight requests, shown above.
          </p>

          <div className="flex flex-wrap gap-x-5 gap-y-2 mb-5">
            {seenStates.map((s) => (
              <div key={s} className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-sm ${STATE_COLOR[s]}`} />
                <span className="text-slate-400 text-xs">{s}</span>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            {populated.map((snap, i) => {
              const total = Object.values(snap.byState).reduce((a, b) => a + b, 0);
              return (
                <div key={`${snap.time}-${snap.instanceId}-${i}`} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-4 text-xs">
                    <span className="text-slate-400">
                      {fmtTime(snap.time)}
                      <span className="text-slate-600 font-mono ml-2">instance {snap.instanceId}</span>
                    </span>
                    <span className="text-slate-500 shrink-0">{total} threads</span>
                  </div>
                  <div className="flex h-2.5 rounded-full overflow-hidden bg-white/5">
                    {seenStates.map((s) => {
                      const count = snap.byState[s] ?? 0;
                      if (!count) return null;
                      return (
                        <div
                          key={s}
                          className={STATE_COLOR[s]}
                          style={{ width: `${(count / total) * 100}%` }}
                          title={`${s}: ${count}`}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {sslErrorHosts.length > 0 && (
        <div className="glass rounded-2xl p-6">
          <h3 className="text-slate-100 font-semibold mb-1">SSL Connection Errors by Host</h3>
          <p className="text-slate-500 text-xs mb-5">
            Outbound origin hosts the server failed to reach over TLS. Peak cumulative count per host.
          </p>
          <div className="space-y-2">
            {sslErrorHosts.map((h) => (
              <div key={h.host} className="flex items-baseline justify-between gap-4 text-xs">
                <span className="font-mono text-slate-300 truncate">{h.host}</span>
                <span className="text-amber-400 shrink-0 tabular-nums">
                  {h.count.toLocaleString()}
                  {h.pct !== null && <span className="text-slate-600 ml-2">{h.pct}%</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
