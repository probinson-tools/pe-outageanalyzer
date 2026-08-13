"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { AnalysisResult, StatusAnalysis } from "@/lib/types";
import type { Metric, ViewMode } from "./status/StatusChart";
import StatusSummaryCards from "./status/StatusSummaryCards";
import FleetOverview from "./status/FleetOverview";
import PendingRequestsTable from "./status/PendingRequestsTable";
import ThreadStateBreakdown from "./status/ThreadStateBreakdown";
import CacheStatsPanel from "./status/CacheStatsPanel";
import HttpCachePanel from "./status/HttpCachePanel";
import TransformStats from "./status/TransformStats";
import Synopsis from "./results/Synopsis";
import Recommendations from "./results/Recommendations";

// recharts v3 is ESM-only; every chart must be client-loaded or the build breaks.
const StatusChart = dynamic(() => import("./status/StatusChart"), { ssr: false });

interface Props {
  analysis: StatusAnalysis;
  incidentTime?: string;
  aiResult: AnalysisResult | null;
  aiLoading: boolean;
}

const HEAP_METRICS: Metric[] = [{ key: "heapUsedPct", name: "Heap Used %", color: "#a855f7" }];
const GC_METRICS: Metric[] = [{ key: "gcMsPerMin", name: "GC ms per minute", color: "#ef4444" }];
const THROUGHPUT_METRICS: Metric[] = [
  { key: "rps", name: "Requests / sec", color: "#60a5fa" },
  { key: "avgRespPage", name: "Avg page response (s)", color: "#34d399" },
];
const THREAD_METRICS: Metric[] = [{ key: "threadCount", name: "Threads", color: "#60a5fa" }];
const POOL_METRICS: Metric[] = [
  { key: "connLeased", name: "Leased", color: "#fbbf24" },
  { key: "connAvailable", name: "Available", color: "#34d399" },
  { key: "connPending", name: "Pending", color: "#ef4444" },
];
const ERROR_METRICS: Metric[] = [
  { key: "intervalConnErrors", name: "Connection", color: "#ef4444" },
  { key: "intervalDbErrors", name: "Database", color: "#fbbf24" },
  { key: "intervalOom", name: "Out of memory", color: "#f472b6" },
  { key: "intervalOther", name: "Other", color: "#60a5fa" },
];
const CACHE_METRICS: Metric[] = [
  { key: "mainSegmentHitRatio", name: "Main segment cache %", color: "#34d399" },
  { key: "httpPageHitRatio", name: "HTTP page cache %", color: "#22d3ee" },
];

export default function StatusResults({ analysis, incidentTime, aiResult, aiLoading }: Props) {
  const [mode, setMode] = useState<ViewMode>("perInstance");

  const { instances, aggregate, flags } = analysis;
  const multiSnapshot = analysis.snapshotCount > 1;
  const chartProps = { mode, instances, aggregate };

  return (
    <div className="space-y-8">
      {/* Section header */}
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-white/8"></div>
        <span className="text-slate-500 text-xs font-semibold uppercase tracking-widest px-2">Server Status Report</span>
        <div className="h-px flex-1 bg-white/8"></div>
      </div>

      <StatusSummaryCards analysis={analysis} />

      <FleetOverview analysis={analysis} />

      {flags.singleSnapshot && (
        <div className="rounded-xl p-4 border border-blue-500/20 bg-blue-500/10 text-blue-300 text-sm flex items-start gap-3">
          <svg className="w-5 h-5 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>
            One snapshot uploaded — the charts below show a single point each and rate-based figures
            (GC per minute, requests per interval) need at least two. The tables are the useful read
            here; upload a ZIP of dumps to get trends.
          </span>
        </div>
      )}

      {/* View toggle — controls whether counters stay grouped by the JVM that
          reported them, or collapse onto one timeline. */}
      {multiSnapshot && (
        <div className="glass rounded-2xl px-5 py-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Chart view</p>
            <p className="text-slate-500 text-xs mt-1 max-w-xl leading-relaxed">
              {mode === "perInstance"
                ? "One line per server instance. Cumulative counters are only comparable within a line."
                : "All snapshots on one timeline. Counters jump where consecutive polls hit different backends."}
            </p>
          </div>
          <div className="flex rounded-lg border border-white/10 overflow-hidden shrink-0">
            {(
              [
                ["perInstance", "Per instance"],
                ["aggregate", "Aggregate"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                className={`px-4 py-2 text-xs font-medium transition-colors ${
                  mode === value ? "bg-blue-500/15 text-blue-400" : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      <StatusChart
        {...chartProps}
        title="Heap Usage"
        subtitle="JVM heap used as a percentage of max, per snapshot"
        metrics={HEAP_METRICS}
      />

      <StatusChart
        {...chartProps}
        title="GC Pressure"
        subtitle="Milliseconds spent collecting per wall-clock minute, from the change in cumulative GC time between consecutive snapshots of the same instance"
        metrics={GC_METRICS}
        emptyNote="Needs at least two snapshots from the same instance to compute a rate."
      />

      <StatusChart
        {...chartProps}
        title="Throughput & Response Time"
        subtitle="Requests per second and average page response time as reported by each instance"
        metrics={THROUGHPUT_METRICS}
      />

      <StatusChart
        {...chartProps}
        title="Threads"
        subtitle="Live thread count at each snapshot"
        metrics={THREAD_METRICS}
      />

      <StatusChart
        {...chartProps}
        title="Outbound Connection Pool"
        subtitle="ApacheHttpClientNg2 pool — connections leased to in-flight origin requests, idle and available, and queued waiting for a slot"
        metrics={POOL_METRICS}
      />

      <StatusChart
        {...chartProps}
        title="Interval Errors"
        subtitle="Errors counted in each instance's rolling window (capped at 60 minutes since start)"
        metrics={ERROR_METRICS}
      />

      <PendingRequestsTable requests={analysis.topPendingRequests} hotFrames={analysis.hotFrames} />

      <StatusChart
        {...chartProps}
        title="Cache Hit Ratio Trend"
        subtitle="Main segment cache and HTTP page cache hit ratios over the snapshot window"
        metrics={CACHE_METRICS}
      />

      <CacheStatsPanel
        caches={analysis.cacheRollup}
        ehCaches={analysis.ehCacheRollup}
        staticCaches={analysis.staticCaches}
        multiSnapshot={multiSnapshot}
      />

      <HttpCachePanel urls={analysis.httpCacheUrls} totals={analysis.httpCacheTotals} />

      <TransformStats transforms={analysis.transforms} neverMatchedIds={analysis.neverMatchedTransformIds} />

      <ThreadStateBreakdown threadStates={analysis.threadStates} sslErrorHosts={analysis.sslErrorHosts} />

      {/* AI synopsis + recommendations — streams in after everything above is visible */}
      {aiResult ? (
        <>
          <Synopsis synopsis={aiResult.synopsis} outageTime={incidentTime} />
          <Recommendations recommendations={aiResult.recommendations} />
        </>
      ) : aiLoading ? (
        <div className="glass rounded-2xl p-6 flex items-center gap-3">
          <svg className="w-4 h-4 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-slate-500 text-sm">Claude is writing a root-cause synopsis and recommendations…</span>
        </div>
      ) : null}
    </div>
  );
}
