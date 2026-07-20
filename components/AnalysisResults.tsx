"use client";

import dynamic from "next/dynamic";
import type { AnalysisResult, ParsedLogSummary } from "@/lib/types";
import SummaryCards from "./results/SummaryCards";
import ErrorTable from "./results/ErrorTable";
import TrafficSources from "./results/TrafficSources";
import TopUrlPatterns from "./results/TopUrlPatterns";
import CacheParams from "./results/CacheParams";
import Synopsis from "./results/Synopsis";
import Recommendations from "./results/Recommendations";

const Charts = dynamic(() => import("./results/Charts"), { ssr: false });
const ConnectionPoolsChart = dynamic(() => import("./results/ConnectionPoolsChart"), { ssr: false });
const OomChart = dynamic(() => import("./results/OomChart"), { ssr: false });

interface Props {
  summary: ParsedLogSummary;
  outageTime?: string;
  aiResult: AnalysisResult | null;
  aiLoading: boolean;
}

export default function AnalysisResults({ summary, outageTime, aiResult, aiLoading }: Props) {
  return (
    <div className="space-y-8">
      {/* Section header */}
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-white/8"></div>
        <span className="text-slate-500 text-xs font-semibold uppercase tracking-widest px-2">Analysis Report</span>
        <div className="h-px flex-1 bg-white/8"></div>
      </div>

      {/* Summary cards — real, parsed stats */}
      <SummaryCards summary={summary} />

      {/* Chart 1: thread count & memory usage */}
      <Charts chartPoints={summary.chartPoints} />

      {/* Connection pool sizes — database pool + proxy connection pool */}
      <ConnectionPoolsChart
        chartPoints={summary.chartPoints}
        dbPoolServerName={summary.dbPoolServerName}
        connPoolServerName={summary.connPoolServerName}
      />

      {/* OOM errors over time */}
      <OomChart chartPoints={summary.chartPoints} oomTotal={summary.flags.oomTotal} />

      {/* Chart 2: top errors */}
      <ErrorTable errors={summary.topErrors} />

      {/* Charts 3+4: top IPs / top User-Agents */}
      <TrafficSources topIps={summary.topIps} topUserAgents={summary.topUserAgents} />

      {/* Chart 5: top URL patterns */}
      <TopUrlPatterns patterns={summary.topUrlPatterns} />

      {/* Cache optimization — query-param cardinality */}
      <CacheParams params={summary.queryParams} />

      {/* AI synopsis + recommendations — streams in after the charts above are already visible */}
      {aiResult ? (
        <>
          <Synopsis synopsis={aiResult.synopsis} outageTime={outageTime} />
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
