"use client";

import type { AnalysisResult } from "@/lib/types";

const THREAT_STYLES: Record<string, string> = {
  high: "bg-red-500/15 text-red-400 border-red-500/30",
  medium: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  low: "bg-blue-500/15 text-blue-400 border-blue-500/30",
};

const CLASS_ICONS: Record<string, string> = {
  scanner: "🔍",
  crawler: "🕷️",
  ddos: "💥",
  "brute-force": "🔐",
  suspicious: "⚠️",
  normal: "✓",
};

interface Props { bots: AnalysisResult["bots"] }

export default function BotTable({ bots }: Props) {
  return (
    <div className="glass rounded-2xl p-6">
      <h3 className="text-white font-semibold mb-1">Suspicious Traffic &amp; Bots</h3>
      <p className="text-white/40 text-xs mb-4">
        {bots.length === 0 ? "No malicious traffic detected" : `${bots.length} suspicious sources identified`}
      </p>
      {bots.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-white/20">
          <svg className="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <span className="text-sm">Traffic looks clean</span>
        </div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto scrollbar-thin pr-1">
          {bots.map((bot, i) => (
            <div key={i} className="rounded-lg bg-white/3 border border-white/6 p-3 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm">{CLASS_ICONS[bot.classification] ?? "⚠️"}</span>
                  <span className="text-white text-sm font-mono">{bot.ip}</span>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${THREAT_STYLES[bot.threat]}`}>
                  {bot.threat} threat
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-white/40">
                <span>{bot.requests.toLocaleString()} req</span>
                <span className="capitalize">{bot.classification}</span>
              </div>
              <p className="text-white/25 text-xs font-mono truncate">{bot.userAgent}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
