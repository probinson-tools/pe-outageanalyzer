/** Shared recharts styling, so every chart in the app reads the same. */

export const TOOLTIP_STYLE = {
  backgroundColor: "#1A1D2E",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "8px",
  color: "#e2e8f0",
  fontSize: "12px",
};

export const AXIS_STROKE = "#ffffff30";
export const AXIS_TICK = { fontSize: 11, fill: "#ffffff50" };
export const GRID_STROKE = "rgba(255,255,255,0.05)";
export const LEGEND_STYLE = { fontSize: "12px", color: "#ffffff80" };

/** X-axis tick label for an epoch-ms timestamp. */
export function formatTick(time: number) {
  const d = new Date(time);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Tooltip heading for an epoch-ms timestamp. */
export function formatTimestamp(value: unknown) {
  return new Date(value as number).toLocaleString();
}

/**
 * Line colours for per-instance charts, where the series count is data-driven.
 * Chosen to stay distinguishable against the dark panel background.
 */
export const SERIES_COLORS = [
  "#60a5fa",
  "#a855f7",
  "#34d399",
  "#fbbf24",
  "#f472b6",
  "#22d3ee",
  "#fb923c",
  "#a3e635",
];

export function seriesColor(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length];
}
