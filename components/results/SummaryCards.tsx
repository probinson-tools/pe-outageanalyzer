"use client";

import type { AnalysisResult } from "@/lib/types";

interface Props { summary: AnalysisResult["summary"] }

const Card = ({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) => (
  <div className="glass rounded-xl p-5 space-y-1">
    <p className="text-white/40 text-xs font-medium uppercase tracking-wider">{label}</p>
    <p className={`text-2xl font-bold ${accent ?? "text-white"}`}>{value}</p>
    {sub && <p className="text-white/35 text-xs truncate">{sub}</p>}
  </div>
);

export default function SummaryCards({ summary }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      <Card label="Total Errors" value={summary.totalErrors.toLocaleString()} accent="text-red-400" />
      <Card label="Warnings" value={summary.totalWarnings.toLocaleString()} accent="text-yellow-400" />
      <Card label="Critical Events" value={summary.criticalEvents.toLocaleString()} accent="text-orange-400" />
      <Card label="Top Error" value={summary.topErrorType} />
      <Card label="Log Timespan" value={summary.timespan} />
      <Card label="Estimated Cause" value={summary.estimatedCause} />
    </div>
  );
}
