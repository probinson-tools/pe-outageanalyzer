"use client";

import { useState } from "react";
import type { ParsedLogSummary } from "@/lib/types";

interface Props {
  topIps: ParsedLogSummary["topIps"];
  topUserAgents: ParsedLogSummary["topUserAgents"];
}

function CopyListButton({ getText }: { getText: () => string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(getText());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable/denied — nothing sensible to do but leave the button as-is.
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? "Copied!" : "Copy full list to clipboard"}
      className="shrink-0 text-slate-500 hover:text-slate-200 transition-colors"
    >
      {copied ? (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
      )}
    </button>
  );
}

export default function TrafficSources({ topIps, topUserAgents }: Props) {
  return (
    <div className="glass rounded-2xl p-6">
      <h3 className="text-slate-100 font-semibold mb-1">Top Traffic Sources</h3>
      <p className="text-slate-500 text-xs mb-4">
        From failed/rejected requests only (translation errors, malformed requests) — not total traffic volume
      </p>
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">By IP</p>
          {topIps.length === 0 ? (
            <p className="text-slate-600 text-xs">No IPs found in failed requests.</p>
          ) : (
            <div className="space-y-1.5 max-h-72 overflow-y-auto scrollbar-thin pr-1">
              {topIps.map((ip, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg bg-white/3 border border-white/8 px-3 py-2">
                  <span className="text-slate-200 text-sm font-mono truncate">{ip.ip}</span>
                  <span className="shrink-0 text-xs px-2 py-0.5 rounded-full border font-medium bg-blue-500/15 text-blue-400 border-blue-500/30">
                    {ip.count.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">By User-Agent</p>
            {topUserAgents.length > 0 && (
              <CopyListButton getText={() => topUserAgents.map((ua) => `${ua.userAgent}\t${ua.count}`).join("\n")} />
            )}
          </div>
          {topUserAgents.length === 0 ? (
            <p className="text-slate-600 text-xs">No User-Agents found in failed requests.</p>
          ) : (
            <div className="space-y-1.5 max-h-72 overflow-y-auto scrollbar-thin pr-1">
              {topUserAgents.map((ua, i) => (
                <div key={i} className="flex items-center justify-between gap-2 rounded-lg bg-white/3 border border-white/8 px-3 py-2">
                  <span className="text-slate-200 text-xs font-mono truncate">{ua.userAgent}</span>
                  <span className="shrink-0 text-xs px-2 py-0.5 rounded-full border font-medium bg-blue-500/15 text-blue-400 border-blue-500/30">
                    {ua.count.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
