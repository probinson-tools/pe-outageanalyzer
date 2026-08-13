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
import { AXIS_STROKE, AXIS_TICK, GRID_STROKE, LEGEND_STYLE, TOOLTIP_STYLE, formatTick, formatTimestamp } from "@/lib/chartTheme";

interface Props {
  chartPoints: ParsedLogSummary["chartPoints"];
}

export default function Charts({ chartPoints }: Props) {
  if (!chartPoints?.length) return null;

  return (
    <div className="glass rounded-2xl p-6">
      <h3 className="text-slate-100 font-semibold mb-1">Thread Count &amp; Memory Usage</h3>
      <p className="text-slate-500 text-xs mb-6">Concurrency and memory usage % over time</p>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={chartPoints} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
          <XAxis
            dataKey="time"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={formatTick}
            stroke={AXIS_STROKE}
            tick={AXIS_TICK}
          />
          <YAxis yAxisId="left" stroke={AXIS_STROKE} tick={AXIS_TICK} />
          <YAxis yAxisId="right" orientation="right" domain={[0, 100]} stroke={AXIS_STROKE} tick={AXIS_TICK} />
          <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={formatTimestamp} />
          <Legend wrapperStyle={LEGEND_STYLE} />
          <Line yAxisId="left" type="monotone" dataKey="threadCount" name="Thread Count" stroke="#60a5fa" strokeWidth={2} dot={false} />
          <Line yAxisId="right" type="monotone" dataKey="memoryUsedPct" name="Memory Used %" stroke="#a855f7" strokeWidth={2} dot={false} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
