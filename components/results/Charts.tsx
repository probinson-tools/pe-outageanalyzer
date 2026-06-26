"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import type { AnalysisResult } from "@/lib/types";

interface Props {
  timeline: AnalysisResult["timeline"];
  severityDistribution: AnalysisResult["severityDistribution"];
  categoryBreakdown: AnalysisResult["categoryBreakdown"];
}

const TOOLTIP_STYLE = {
  backgroundColor: "#1a1d26",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "8px",
  color: "#e2e8f0",
  fontSize: "12px",
};

const BAR_COLORS = [
  "#60a5fa", "#f472b6", "#34d399", "#fb923c",
  "#a78bfa", "#facc15", "#38bdf8", "#4ade80",
];

export default function Charts({ timeline, severityDistribution, categoryBreakdown }: Props) {
  if (!timeline?.length || !severityDistribution?.length || !categoryBreakdown?.length) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Timeline area chart */}
      <div className="glass rounded-2xl p-6">
        <h3 className="text-white font-semibold mb-1">Event Timeline</h3>
        <p className="text-white/40 text-xs mb-6">Error rate, warnings, and estimated memory pressure over time</p>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={timeline} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="errGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="warnGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#eab308" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#eab308" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="time" stroke="#ffffff30" tick={{ fontSize: 11, fill: "#ffffff50" }} />
            <YAxis stroke="#ffffff30" tick={{ fontSize: 11, fill: "#ffffff50" }} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ fontSize: "12px", color: "#ffffff80" }} />
            <Area type="monotone" dataKey="errors" name="Errors" stroke="#ef4444" fill="url(#errGrad)" strokeWidth={2} dot={false} />
            <Area type="monotone" dataKey="warnings" name="Warnings" stroke="#eab308" fill="url(#warnGrad)" strokeWidth={1.5} dot={false} />
            <Area type="monotone" dataKey="memoryPressure" name="Memory %" stroke="#a855f7" fill="url(#memGrad)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Pie + Bar side by side */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Severity donut */}
        <div className="glass rounded-2xl p-6">
          <h3 className="text-white font-semibold mb-1">Severity Distribution</h3>
          <p className="text-white/40 text-xs mb-4">Breakdown of events by severity level</p>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={severityDistribution}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={3}
                dataKey="value"
                nameKey="name"
              >
                {severityDistribution.map((entry, i) => (
                  <Cell key={`cell-${i}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "12px", color: "#ffffff80" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Category bar */}
        <div className="glass rounded-2xl p-6">
          <h3 className="text-white font-semibold mb-1">Error Categories</h3>
          <p className="text-white/40 text-xs mb-4">Event count by category</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={categoryBreakdown} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="name" stroke="#ffffff30" tick={{ fontSize: 11, fill: "#ffffff50" }} />
              <YAxis stroke="#ffffff30" tick={{ fontSize: 11, fill: "#ffffff50" }} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="count" name="Events" radius={[4, 4, 0, 0]}>
                {categoryBreakdown.map((_, i) => (
                  <Cell key={`bar-cell-${i}`} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
