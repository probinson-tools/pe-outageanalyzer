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
  dbPoolServerName: string | null;
  connPoolServerName: string | null;
}

export default function ConnectionPoolsChart({ chartPoints, dbPoolServerName, connPoolServerName }: Props) {
  if (!chartPoints?.length) return null;

  const subtitleParts = [
    dbPoolServerName ? `database pool (server: ${dbPoolServerName})` : null,
    connPoolServerName ? `connection pool (server: ${connPoolServerName})` : null,
  ].filter(Boolean);

  return (
    <div className="glass rounded-2xl p-6">
      <h3 className="text-slate-100 font-semibold mb-1">Connection Pool Sizes</h3>
      <p className="text-slate-500 text-xs mb-6">
        {subtitleParts.length ? `${subtitleParts.join(" and ")} size over time` : "Pool size over time"}
      </p>
      <ResponsiveContainer width="100%" height={280}>
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
          <YAxis stroke={AXIS_STROKE} tick={AXIS_TICK} />
          <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={formatTimestamp} />
          <Legend wrapperStyle={LEGEND_STYLE} />
          <Line type="monotone" dataKey="dbPoolSize" name="Database Pool Size" stroke="#ef4444" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="connPoolSize" name="Connection Pool Size" stroke="#fbbf24" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
