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
import {
  AXIS_STROKE,
  AXIS_TICK,
  GRID_STROKE,
  LEGEND_STYLE,
  TOOLTIP_STYLE,
  formatTick,
  formatTimestamp,
  seriesColor,
} from "@/lib/chartTheme";
import type { InstanceSeries, StatusSeriesPoint } from "@/lib/types";

export type ViewMode = "perInstance" | "aggregate";

export interface Metric {
  key: keyof StatusSeriesPoint;
  name: string;
  color: string;
}

interface Props {
  title: string;
  subtitle: string;
  metrics: Metric[];
  mode: ViewMode;
  instances: InstanceSeries[];
  aggregate: StatusSeriesPoint[];
  height?: number;
  /** Rendered when no point in the data carries a value for any metric. */
  emptyNote?: string;
}

/**
 * Legend label. One series per instance Id, so the Id alone identifies it — a restart
 * stays on the same line rather than splitting into a second series.
 */
function instanceLabel(inst: InstanceSeries): string {
  const suffix = inst.restartCount > 0 ? ` (${inst.restartCount}× restarted)` : "";
  return `Instance ${inst.instanceId}${suffix}`;
}

/**
 * Pivot the per-instance series into rows keyed by time, one column per instance.
 *
 * Instances are sampled at different moments (each poll hits one backend), so most
 * cells are empty — the lines use connectNulls to bridge their own gaps rather than
 * pretending the other instances were flat.
 */
function pivotByInstance(
  instances: InstanceSeries[],
  metricKey: keyof StatusSeriesPoint
): Record<string, number | null>[] {
  const rows = new Map<number, Record<string, number | null>>();

  instances.forEach((inst, i) => {
    // Synthetic column ids: recharts treats a dataKey containing "." as a nested path.
    const column = `s${i}`;
    for (const p of inst.points) {
      let row = rows.get(p.time);
      if (!row) {
        row = { time: p.time };
        rows.set(p.time, row);
      }
      const value = p[metricKey];
      row[column] = typeof value === "number" ? value : null;
    }
  });

  return [...rows.values()].sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
}

function hasAnyValue(points: StatusSeriesPoint[], metrics: Metric[]): boolean {
  return points.some((p) => metrics.some((m) => typeof p[m.key] === "number"));
}

export default function StatusChart({
  title,
  subtitle,
  metrics,
  mode,
  instances,
  aggregate,
  height = 260,
  emptyNote,
}: Props) {
  if (!aggregate.length) return null;

  const populated = metrics.filter((m) => aggregate.some((p) => typeof p[m.key] === "number"));

  if (!hasAnyValue(aggregate, metrics)) {
    return (
      <div className="glass rounded-2xl p-6">
        <h3 className="text-slate-100 font-semibold mb-1">{title}</h3>
        <p className="text-slate-500 text-xs mb-4">{subtitle}</p>
        <p className="text-slate-600 text-sm">{emptyNote ?? "No data in these snapshots."}</p>
      </div>
    );
  }

  const singlePoint = aggregate.length === 1;

  return (
    <div className="glass rounded-2xl p-6">
      <h3 className="text-slate-100 font-semibold mb-1">{title}</h3>
      <p className="text-slate-500 text-xs mb-5">{subtitle}</p>

      {mode === "aggregate" ? (
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={aggregate} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
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
            {populated.map((m) => (
              <Line
                key={String(m.key)}
                type="monotone"
                dataKey={String(m.key)}
                name={m.name}
                stroke={m.color}
                strokeWidth={2}
                dot={singlePoint ? { r: 3 } : false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      ) : (
        // Per-instance mode draws one small multiple per metric so that N instances ×
        // M metrics never collapses into an unreadable tangle on a single axis.
        <div className="space-y-6">
          {populated.map((m) => {
            const data = pivotByInstance(instances, m.key);
            return (
              <div key={String(m.key)}>
                {populated.length > 1 && (
                  <p className="text-slate-400 text-xs font-medium mb-2">{m.name}</p>
                )}
                <ResponsiveContainer width="100%" height={height}>
                  <LineChart data={data} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
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
                    {instances.map((inst, i) => (
                      <Line
                        key={inst.key}
                        type="monotone"
                        dataKey={`s${i}`}
                        name={instanceLabel(inst)}
                        stroke={seriesColor(i)}
                        strokeWidth={2}
                        dot={{ r: 2.5 }}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
