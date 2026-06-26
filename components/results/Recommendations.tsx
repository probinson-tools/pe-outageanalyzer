"use client";

import type { AnalysisResult } from "@/lib/types";

const PRIORITY_STYLES: Record<string, { badge: string; dot: string; order: number }> = {
  immediate: { badge: "bg-red-500/15 text-red-400 border-red-500/30", dot: "bg-red-400", order: 0 },
  "short-term": { badge: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30", dot: "bg-yellow-400", order: 1 },
  "long-term": { badge: "bg-blue-500/15 text-blue-400 border-blue-500/30", dot: "bg-blue-400", order: 2 },
};

const CATEGORY_ICONS: Record<string, string> = {
  memory: "💾",
  security: "🔒",
  performance: "⚡",
  monitoring: "📊",
  configuration: "⚙️",
};

interface Props { recommendations: AnalysisResult["recommendations"] }

export default function Recommendations({ recommendations }: Props) {
  const sorted = [...recommendations].sort(
    (a, b) => (PRIORITY_STYLES[a.priority]?.order ?? 99) - (PRIORITY_STYLES[b.priority]?.order ?? 99)
  );

  return (
    <div className="glass rounded-2xl p-6 glow-blue">
      <div className="flex items-start gap-4 mb-6">
        <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center shrink-0">
          <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
        <div>
          <h3 className="text-white font-semibold text-lg">Recommendations</h3>
          <p className="text-white/40 text-xs mt-0.5">
            {sorted.filter(r => r.priority === "immediate").length} immediate ·{" "}
            {sorted.filter(r => r.priority === "short-term").length} short-term ·{" "}
            {sorted.filter(r => r.priority === "long-term").length} long-term actions
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {sorted.map((rec, i) => {
          const styles = PRIORITY_STYLES[rec.priority];
          return (
            <div key={i} className="rounded-xl bg-white/3 border border-white/6 p-4 flex gap-4">
              <div className="flex flex-col items-center pt-1 gap-2">
                <div className={`w-2 h-2 rounded-full shrink-0 ${styles.dot}`} />
                {i < sorted.length - 1 && <div className="w-px flex-1 bg-white/8" />}
              </div>
              <div className="space-y-2 flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-lg">{CATEGORY_ICONS[rec.category] ?? "🔧"}</span>
                  <span className="text-white text-sm font-semibold">{rec.title}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${styles.badge}`}>
                    {rec.priority}
                  </span>
                  <span className="text-white/25 text-xs capitalize">{rec.category}</span>
                </div>
                <p className="text-white/55 text-sm leading-relaxed">{rec.description}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
