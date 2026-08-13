"use client";

import { useState } from "react";
import { STATUS_THRESHOLDS } from "@/lib/statusParser";
import type { PendingRequestOccurrence, StatusAnalysis } from "@/lib/types";

interface Props {
  requests: PendingRequestOccurrence[];
  hotFrames: StatusAnalysis["hotFrames"];
}

function fmtElapsed(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`;
}

function fmtTime(time: number): string {
  return Number.isFinite(time) ? new Date(time).toLocaleTimeString() : "—";
}

const STATE_TONE: Record<string, string> = {
  RUNNABLE: "bg-green-500/15 text-green-400 border-green-500/30",
  BLOCKED: "bg-red-500/15 text-red-400 border-red-500/30",
  WAITING: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  TIMED_WAITING: "bg-slate-500/15 text-slate-400 border-slate-500/30",
};

/** Strip the module/classloader prefix so frames line up when read as a column. */
function cleanFrame(frame: string): string {
  return frame.replace(/^(?:app\/\/|java\.base@[\d.]+\/)/, "");
}

export default function PendingRequestsTable({ requests, hotFrames }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!requests.length) {
    return (
      <div className="glass rounded-2xl p-6">
        <h3 className="text-slate-100 font-semibold mb-1">In-Flight Requests</h3>
        <p className="text-slate-500 text-xs mb-4">
          Requests still being processed when each snapshot was taken, joined to their thread stacks
        </p>
        <div className="flex flex-col items-center justify-center h-32 text-slate-600">
          <svg className="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm">No requests were pending in these snapshots</span>
        </div>
      </div>
    );
  }

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h3 className="text-slate-100 font-semibold">In-Flight Requests</h3>
        <span className="shrink-0 text-xs px-2 py-0.5 rounded-full border font-medium bg-white/5 text-slate-400 border-white/10">
          {requests.length} across all snapshots
        </span>
      </div>
      <p className="text-slate-500 text-xs mb-5">
        Requests still being processed when each snapshot was taken, joined by thread number to the
        thread dump. Sorted by elapsed time — anything past{" "}
        {(STATUS_THRESHOLDS.STUCK_REQUEST_MS / 1000).toFixed(0)}s is highlighted.
      </p>

      {hotFrames.length > 0 && (
        <div className="mb-5 rounded-xl bg-white/3 border border-white/8 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-3">
            Hottest application frames across in-flight threads
          </p>
          <div className="space-y-1.5">
            {hotFrames.slice(0, 8).map((f) => (
              <div key={f.frame} className="flex items-center gap-3">
                <span className="text-slate-500 text-xs w-8 shrink-0 text-right">{f.count}×</span>
                <span className="font-mono text-[11px] text-slate-300 truncate" title={f.frame}>
                  {f.frame}
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
              <th className="pb-2 pr-3 font-semibold">Time</th>
              <th className="pb-2 pr-3 font-semibold">Instance</th>
              <th className="pb-2 pr-3 font-semibold text-right">Elapsed</th>
              <th className="pb-2 pr-3 font-semibold">State</th>
              <th className="pb-2 pr-3 font-semibold">Request</th>
              <th className="pb-2 pr-3 font-semibold text-right">Transform</th>
              <th className="pb-2 font-semibold text-right">Stack</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => {
              const id = `${r.fileName}:${r.requestId}`;
              const slow = r.elapsedMs >= STATUS_THRESHOLDS.STUCK_REQUEST_MS;
              const isOpen = expanded === id;
              return (
                <tr key={id} className="border-b border-white/5 last:border-0 align-top">
                  <td className="py-2.5 pr-3 text-slate-400 text-xs whitespace-nowrap">{fmtTime(r.time)}</td>
                  <td className="py-2.5 pr-3 font-mono text-xs text-slate-400">{r.instanceId}</td>
                  <td className={`py-2.5 pr-3 text-right font-medium whitespace-nowrap ${slow ? "text-amber-400" : "text-slate-300"}`}>
                    {fmtElapsed(r.elapsedMs)}
                  </td>
                  <td className="py-2.5 pr-3">
                    {r.state ? (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${STATE_TONE[r.state] ?? "bg-white/5 text-slate-400 border-white/10"}`}>
                        {r.state}
                      </span>
                    ) : (
                      <span className="text-slate-600 text-xs">—</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 max-w-md">
                    <div className="flex items-baseline gap-2">
                      <span className="text-slate-500 text-[11px] shrink-0">{r.method}</span>
                      <span className="text-slate-300 text-xs truncate" title={r.url}>{r.url}</span>
                    </div>
                    {isOpen && (
                      <pre className="mt-2 max-h-72 overflow-auto scrollbar-thin rounded-lg bg-[#0F1117] border border-white/8 p-3 text-[11px] leading-relaxed text-slate-400 font-mono whitespace-pre">
                        {r.stack.length
                          ? r.stack.map(cleanFrame).join("\n")
                          : "No stack captured for this thread."}
                      </pre>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-mono text-xs text-slate-500">{r.transformId}</td>
                  <td className="py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : id)}
                      disabled={!r.stack.length}
                      className="text-xs text-blue-400 hover:text-blue-300 disabled:text-slate-600 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      {r.stack.length ? (isOpen ? "Hide" : `${r.stack.length} frames`) : "—"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
