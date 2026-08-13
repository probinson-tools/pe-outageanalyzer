"use client";

import type { StatusAnalysis } from "@/lib/types";

interface Props { analysis: StatusAnalysis }

const Card = ({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) => (
  <div className="glass rounded-xl p-5 space-y-1">
    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    <p className={`text-2xl font-bold ${accent ?? "text-slate-100"}`}>{value}</p>
    {sub && <p className="text-slate-500 text-xs truncate">{sub}</p>}
  </div>
);

const Badge = ({ tone, children }: { tone: "red" | "amber" | "green"; children: React.ReactNode }) => {
  const tones = {
    red: "bg-red-500/15 text-red-400 border-red-500/30",
    amber: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    green: "bg-green-500/15 text-green-400 border-green-500/30",
  };
  return <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${tones[tone]}`}>{children}</span>;
};

function fmtElapsed(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

export default function StatusSummaryCards({ analysis }: Props) {
  const { flags, fleet, timespan, snapshotCount } = analysis;

  const badges: React.ReactNode[] = [];
  if (flags.configDriftDetected) {
    badges.push(
      <Badge key="drift" tone="red">
        Config drift — {fleet.propertiesHashes.length} distinct properties hashes
      </Badge>
    );
  }
  if (flags.versionDriftDetected) badges.push(<Badge key="ver" tone="red">Version drift across pool</Badge>);
  if (flags.propertiesVersionDriftDetected) badges.push(<Badge key="pver" tone="amber">Properties version mismatch</Badge>);
  if (flags.restartDetected) {
    badges.push(<Badge key="restart" tone="amber">Restart detected — instance {flags.restartedInstanceIds.join(", ")}</Badge>);
  }
  if (flags.heapPressure) badges.push(<Badge key="heap" tone="red">Heap pressure</Badge>);
  if (flags.gcPressure) badges.push(<Badge key="gc" tone="red">GC pressure</Badge>);
  if (flags.stuckRequests) badges.push(<Badge key="stuck" tone="amber">Long-running request {fmtElapsed(flags.longestPendingMs)}</Badge>);
  if (flags.connPoolSaturation) badges.push(<Badge key="pool" tone="amber">Connection pool squeezed</Badge>);
  if (flags.oomDetected) badges.push(<Badge key="oom" tone="red">OutOfMemory errors: {flags.oomTotal}</Badge>);
  if (flags.lowHitRatioCaches.length) {
    badges.push(<Badge key="cache" tone="amber">Low hit ratio: {flags.lowHitRatioCaches.length} cache(s)</Badge>);
  }
  if (badges.length === 0) badges.push(<Badge key="ok" tone="green">No threshold breaches detected</Badge>);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card
          label="Snapshots"
          value={snapshotCount.toLocaleString()}
          sub={flags.singleSnapshot ? "Point-in-time only" : `across ${fleet.instanceCount} instance(s)`}
        />
        <Card
          label="Server Instances"
          value={fleet.instanceCount}
          sub={flags.configDriftDetected ? "Config drift detected" : "Configs consistent"}
          accent={flags.configDriftDetected ? "text-red-400" : undefined}
        />
        <Card
          label="Peak Heap Used"
          value={flags.peakHeapUsedPct !== null ? `${flags.peakHeapUsedPct.toFixed(1)}%` : "—"}
          sub={flags.minHeapAvailableMb !== null ? `min ${flags.minHeapAvailableMb.toLocaleString()} MB free` : undefined}
          accent={flags.heapPressure ? "text-red-400" : undefined}
        />
        <Card
          label="Peak GC / min"
          value={flags.peakGcMsPerMin !== null ? `${Math.round(flags.peakGcMsPerMin).toLocaleString()} ms` : "—"}
          sub={flags.singleSnapshot ? "needs 2+ snapshots" : undefined}
          accent={flags.gcPressure ? "text-red-400" : undefined}
        />
        <Card label="Peak Threads" value={flags.peakThreadCount.toLocaleString()} />
        <Card
          label="Pending Requests"
          value={flags.totalPendingRequests.toLocaleString()}
          sub={flags.longestPendingMs > 0 ? `longest ${fmtElapsed(flags.longestPendingMs)}` : undefined}
          accent={flags.stuckRequests ? "text-amber-400" : undefined}
        />
        <Card
          label="Connection Errors"
          value={flags.totalConnectionErrors.toLocaleString()}
          sub="fleet total, cumulative"
          accent={flags.totalConnectionErrors > 0 ? "text-amber-400" : undefined}
        />
        <Card
          label="Peak Pool Leased"
          value={flags.peakConnLeased !== null ? flags.peakConnLeased.toLocaleString() : "—"}
          sub={flags.connPoolMax ? `of ${flags.connPoolMax.toLocaleString()} max` : undefined}
        />
        <Card
          label="Slowest Transform"
          value={flags.slowestTransformMs ? `${flags.slowestTransformMs} ms` : "—"}
        />
        <Card
          label="Dead Transforms"
          value={flags.deadTransformCount.toLocaleString()}
          sub="never matched in any snapshot"
        />
        <Card
          label="Cached URLs"
          value={analysis.httpCacheTotals.distinctUrls.toLocaleString()}
          sub={`${analysis.httpCacheTotals.withQuery.toLocaleString()} with query strings`}
        />
        <Card
          label="Files Parsed"
          value={analysis.fileNames.length}
          sub={analysis.parseErrors.length ? `${analysis.parseErrors.length} failed` : undefined}
          accent={analysis.parseErrors.length ? "text-amber-400" : undefined}
        />
      </div>

      <div className="glass rounded-xl px-5 py-4 flex flex-wrap items-center gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mr-2">Findings</p>
        {badges}
      </div>

      <div className="glass rounded-xl px-5 py-4 flex items-center justify-between gap-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Snapshot Timespan</p>
        <p className="text-sm font-medium text-slate-100">
          {timespan ? (
            <>
              {timespan.start} <span className="text-slate-500">–</span> {timespan.end}
            </>
          ) : (
            "—"
          )}
        </p>
      </div>

      {analysis.parseErrors.length > 0 && (
        <div className="rounded-xl p-4 border border-amber-500/20 bg-amber-500/10 text-amber-400 text-xs space-y-1">
          <p className="font-semibold">{analysis.parseErrors.length} file(s) could not be parsed:</p>
          {analysis.parseErrors.map((e) => (
            <p key={e.fileName} className="font-mono">{e.fileName} — {e.message}</p>
          ))}
        </div>
      )}
    </div>
  );
}
