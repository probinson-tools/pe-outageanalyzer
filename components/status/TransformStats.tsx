"use client";

import { useState } from "react";
import { STATUS_THRESHOLDS } from "@/lib/statusParser";
import type { TransformStat } from "@/lib/types";

interface Props {
  transforms: TransformStat[];
  neverMatchedIds: string[];
}

const TOP_ROWS = 15;

export default function TransformStats({ transforms, neverMatchedIds }: Props) {
  const [showDead, setShowDead] = useState(false);
  if (!transforms.length && !neverMatchedIds.length) return null;

  const slowest = transforms.slice(0, TOP_ROWS);
  const slowestAvg = [...transforms].sort((a, b) => b.avgMs - a.avgMs).slice(0, TOP_ROWS);
  const hottest = [...transforms].sort((a, b) => b.matches - a.matches).slice(0, TOP_ROWS);
  const maxMax = slowest[0]?.maxMs || 1;
  const maxAvg = slowestAvg[0]?.avgMs || 1;
  const maxMatches = hottest[0]?.matches || 1;

  const Row = ({
    t,
    value,
    max,
    unit,
  }: {
    t: TransformStat;
    value: number;
    max: number;
    unit: string;
  }) => (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-mono text-xs text-slate-300">Id={t.id}</span>
        <span className="text-slate-400 text-xs tabular-nums shrink-0">
          {value.toLocaleString()} {unit}
          <span className="text-slate-600"> · {t.executions.toLocaleString()} exec</span>
        </span>
      </div>
      <div className="h-1 rounded-full bg-white/5 overflow-hidden">
        <div
          className={`h-full rounded-full ${
            unit === "ms" && value >= STATUS_THRESHOLDS.SLOW_TRANSFORM_MS ? "bg-amber-400/60" : "bg-blue-400/50"
          }`}
          style={{ width: `${(value / max) * 100}%` }}
        />
      </div>
    </div>
  );

  return (
    <div className="glass rounded-2xl p-6">
      <h3 className="text-slate-100 font-semibold mb-1">Transformation Rules</h3>
      <p className="text-slate-500 text-xs mb-5">
        Peak values observed per transform Id across all snapshots. A rule that matches often but
        rarely executes is cheap; one with a high max is a latency tail on the pages it touches, while
        a high average means it is slow on every page it touches, not just an occasional outlier.
      </p>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-3">
            Slowest by max duration
          </p>
          <div className="space-y-2.5">
            {slowest.map((t) => (
              <Row key={t.id} t={t} value={t.maxMs} max={maxMax} unit="ms" />
            ))}
          </div>
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-3">
            Slowest by average duration
          </p>
          <div className="space-y-2.5">
            {slowestAvg.map((t) => (
              <Row key={t.id} t={t} value={t.avgMs} max={maxAvg} unit="ms" />
            ))}
          </div>
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-3">
            Most matched
          </p>
          <div className="space-y-2.5">
            {hottest.map((t) => (
              <Row key={t.id} t={t} value={t.matches} max={maxMatches} unit="matches" />
            ))}
          </div>
        </div>
      </div>

      {neverMatchedIds.length > 0 && (
        <div className="mt-6 pt-5 border-t border-white/8">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-slate-300 text-sm font-medium">
                {neverMatchedIds.length.toLocaleString()} transforms never matched
              </p>
              <p className="text-slate-500 text-xs mt-0.5">
                Their condition did not fire in any snapshot — dead rules that still cost evaluation time.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowDead(!showDead)}
              className="text-xs text-blue-400 hover:text-blue-300 shrink-0"
            >
              {showDead ? "Hide" : "Show ids"}
            </button>
          </div>
          {showDead && (
            <p className="mt-3 max-h-40 overflow-auto scrollbar-thin rounded-lg bg-[#0F1117] border border-white/8 p-3 font-mono text-[11px] leading-relaxed text-slate-500">
              {neverMatchedIds.join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
