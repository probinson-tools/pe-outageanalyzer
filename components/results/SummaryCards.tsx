"use client";

import type { ParsedLogSummary } from "@/lib/types";

interface Props { summary: ParsedLogSummary }

const Card = ({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) => (
  <div className="glass rounded-xl p-5 space-y-1">
    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    <p className={`text-2xl font-bold ${accent ?? "text-slate-100"}`}>{value}</p>
    {sub && <p className="text-slate-500 text-xs truncate">{sub}</p>}
  </div>
);

export default function SummaryCards({ summary }: Props) {
  const { flags, timespan } = summary;
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      <Card
        label="Peak DB Pool Size"
        value={flags.peakDbPoolSize.toLocaleString()}
        sub={flags.dbPoolLeakSuspected ? "Leak suspected" : undefined}
        accent={flags.dbPoolLeakSuspected ? "text-red-400" : undefined}
      />
      <Card
        label="Min Free Memory"
        value={flags.minFreeMemoryPct !== null ? `${flags.minFreeMemoryPct.toFixed(1)}%` : "—"}
        accent={flags.minFreeMemoryPct !== null && flags.minFreeMemoryPct < 15 ? "text-red-400" : undefined}
      />
      <Card label="Peak Concurrent Threads" value={flags.peakThreadCount.toLocaleString()} />
      <Card
        label="Total Exceptions"
        value={flags.totalExceptions.toLocaleString()}
        accent={flags.oomDetected ? "text-red-400" : undefined}
        sub={flags.oomDetected ? "OutOfMemoryError detected" : undefined}
      />
      <Card label="Distinct Error Types" value={flags.distinctErrorTypes.toLocaleString()} />
      <Card
        label="Log Timespan"
        value={timespan ? `${timespan.start.split(" ")[1]} – ${timespan.end.split(" ")[1]}` : "—"}
        sub={timespan ? timespan.start.split(" ")[0] : undefined}
      />
    </div>
  );
}
