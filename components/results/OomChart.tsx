"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { ParsedLogSummary } from "@/lib/types";

interface Props {
  chartPoints: ParsedLogSummary["chartPoints"];
  oomTotal: number;
}

const TOOLTIP_STYLE = {
  backgroundColor: "#1A1D2E",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "8px",
  color: "#e2e8f0",
  fontSize: "12px",
};

function formatTick(time: number) {
  const d = new Date(time);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function OomChart({ chartPoints, oomTotal }: Props) {
  if (!chartPoints?.length) return null;

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h3 className="text-slate-100 font-semibold">Out of Memory Errors</h3>
        <span
          className={`shrink-0 text-xs px-2 py-0.5 rounded-full border font-medium ${
            oomTotal > 0
              ? "bg-red-500/15 text-red-400 border-red-500/30"
              : "bg-green-500/15 text-green-400 border-green-500/30"
          }`}
        >
          {oomTotal.toLocaleString()} total
        </span>
      </div>
      <p className="text-slate-500 text-xs mb-6">
        Occurrences of <span className="font-mono">java.lang.OutOfMemoryError: Java heap space</span> over time
      </p>
      {oomTotal === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-slate-600">
          <svg className="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm">No OutOfMemoryErrors detected</span>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartPoints} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="time"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={formatTick}
              stroke="#ffffff30"
              tick={{ fontSize: 11, fill: "#ffffff50" }}
            />
            <YAxis allowDecimals={false} stroke="#ffffff30" tick={{ fontSize: 11, fill: "#ffffff50" }} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelFormatter={(v) => new Date(v as number).toLocaleString()}
              formatter={(value) => [value, "OOM errors"]}
            />
            <Bar dataKey="oomCount" name="OOM Errors" fill="#ef4444" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
