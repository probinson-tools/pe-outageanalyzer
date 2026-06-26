"use client";

import dynamic from "next/dynamic";
import type { AnalysisResult } from "@/lib/types";
import SummaryCards from "./results/SummaryCards";
import ErrorTable from "./results/ErrorTable";
import BotTable from "./results/BotTable";
import PatternList from "./results/PatternList";
import Synopsis from "./results/Synopsis";
import Recommendations from "./results/Recommendations";

const Charts = dynamic(() => import("./results/Charts"), { ssr: false });

interface Props { result: AnalysisResult }

export default function AnalysisResults({ result }: Props) {
  return (
    <div className="space-y-8">
      {/* Section header */}
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-white/8"></div>
        <span className="text-white/40 text-xs font-medium uppercase tracking-widest px-2">Analysis Report</span>
        <div className="h-px flex-1 bg-white/8"></div>
      </div>

      {/* Summary cards */}
      <SummaryCards summary={result.summary} />

      {/* Charts */}
      <Charts
        timeline={result.timeline}
        severityDistribution={result.severityDistribution}
        categoryBreakdown={result.categoryBreakdown}
      />

      {/* Errors & Bots side by side on large screens */}
      <div className="grid lg:grid-cols-2 gap-6">
        <ErrorTable errors={result.errors} />
        <BotTable bots={result.bots} />
      </div>

      {/* Patterns */}
      <PatternList patterns={result.patterns} />

      {/* Synopsis */}
      <Synopsis synopsis={result.synopsis} outageTime={result.summary.outageTime} />

      {/* Recommendations */}
      <Recommendations recommendations={result.recommendations} />
    </div>
  );
}
