"use client";

import { useState } from "react";
import { buildClaudeBrief, claudeBriefFileName } from "@/lib/claudeExport";
import type { ParsedLogSummary } from "@/lib/types";

interface Props {
  summary: ParsedLogSummary;
  outageTime?: string;
}

export default function ExportForClaude({ summary, outageTime }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildClaudeBrief(summary, outageTime ?? ""));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied (permissions, insecure context); the download still works.
    }
  };

  const handleDownload = () => {
    const blob = new Blob([buildClaudeBrief(summary, outageTime ?? "")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = claudeBriefFileName(summary);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const btn =
    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-xs font-medium text-slate-300 hover:text-slate-100 hover:bg-white/5 transition-colors";

  return (
    <div className="flex items-center gap-2" title="A self-contained brief to paste into Claude with the Atlassian connector enabled">
      <button type="button" onClick={handleCopy} className={btn}>
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {copied ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          )}
        </svg>
        {copied ? "Copied" : "Copy for Claude"}
      </button>
      <button type="button" onClick={handleDownload} className={btn}>
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        Download .md
      </button>
    </div>
  );
}
