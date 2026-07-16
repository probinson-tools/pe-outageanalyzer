"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { ParsedLogSummary } from "@/lib/types";

interface Props {
  chartPoints: ParsedLogSummary["chartPoints"];
  dbPoolServerName: string | null;
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

export default function Charts({ chartPoints, dbPoolServerName }: Props) {
  if (!chartPoints?.length) return null;

  return (
    <div className="glass rounded-2xl p-6">
      <h3 className="text-slate-100 font-semibold mb-1">Thread Count, Memory &amp; DB Pool Size</h3>
      <p className="text-slate-500 text-xs mb-6">
        Concurrency, memory usage %, and DB pool size{dbPoolServerName ? ` (server: ${dbPoolServerName})` : ""} over time
      </p>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={chartPoints} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis
            dataKey="time"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={formatTick}
            stroke="#ffffff30"
            tick={{ fontSize: 11, fill: "#ffffff50" }}
          />
          <YAxis yAxisId="left" stroke="#ffffff30" tick={{ fontSize: 11, fill: "#ffffff50" }} />
          <YAxis yAxisId="right" orientation="right" domain={[0, 100]} stroke="#ffffff30" tick={{ fontSize: 11, fill: "#ffffff50" }} />
          <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(v) => new Date(v as number).toLocaleString()} />
          <Legend wrapperStyle={{ fontSize: "12px", color: "#ffffff80" }} />
          <Line yAxisId="left" type="monotone" dataKey="threadCount" name="Thread Count" stroke="#60a5fa" strokeWidth={2} dot={false} />
          <Line yAxisId="left" type="monotone" dataKey="dbPoolSize" name="DB Pool Size" stroke="#ef4444" strokeWidth={2} dot={false} />
          <Line yAxisId="right" type="monotone" dataKey="memoryUsedPct" name="Memory Used %" stroke="#a855f7" strokeWidth={2} dot={false} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
