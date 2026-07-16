"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import UploadPanel from "@/components/UploadPanel";
import AnalysisResults from "@/components/AnalysisResults";
import type { AnalysisResult, ParsedLogSummary } from "@/lib/types";
import { repairJson } from "@/lib/repairJson";

export default function Home() {
  const [parsedSummary, setParsedSummary] = useState<ParsedLogSummary | null>(null);
  const [outageTime, setOutageTime] = useState<string>("");
  const [aiResult, setAiResult] = useState<AnalysisResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const handleAnalyze = async (summary: ParsedLogSummary, outageTime: string, fileName: string) => {
    // Charts render immediately from the deterministic parse — only the AI
    // synopsis/recommendations wait on the network call below.
    setParsedSummary(summary);
    setOutageTime(outageTime);
    setAiResult(null);
    setError(null);
    setAiLoading(true);
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth" }), 100);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parsedSummary: summary, outageTime, fileName }),
      });

      if (!res.body) {
        const text = await res.text().catch(() => "");
        let msg = `Server error (${res.status})`;
        try { msg = JSON.parse(text).__error || JSON.parse(text).error || msg; } catch { /* plain text */ }
        throw new Error(msg);
      }

      // Read streaming chunks until done, then parse the accumulated JSON
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
      }

      let data: AnalysisResult;
      try {
        // Repair any truncated JSON (unclosed brackets from a mid-stream stop)
        const repaired = repairJson(fullText);
        const jsonMatch = repaired.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No JSON found in response.");
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.__error) throw new Error(parsed.__error as string);
        data = parsed as AnalysisResult;
      } catch (parseErr) {
        console.error("Parse error. First 500 chars:", fullText.slice(0, 500));
        throw new Error(
          parseErr instanceof Error ? parseErr.message : "Server returned an unexpected response. Please try again."
        );
      }
      setAiResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#0F1117]">
      {/* Header */}
      <header className="border-b border-white/8 bg-[#1A1D2E] sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-3 relative flex items-center justify-between">
          <span className="text-base font-bold text-slate-100 tracking-tight">PE Outage Analyzer</span>
          <a
            href="https://pe-commandcenter.vercel.app"
            title="PE Command Center"
            className="hidden md:block absolute left-1/2 -translate-x-1/2"
          >
            <Image src="/logo-marketfully-dark.svg" alt="Marketfully" width={119} height={28} priority />
          </a>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse-slow"></span>
            <span className="text-slate-500 text-xs">Powered by Claude</span>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-10 space-y-10">
        {/* Hero */}
        <div className="text-center space-y-3">
          <h2 className="text-3xl font-bold text-slate-100">
            Diagnose Server Outages <span className="text-blue-400">Instantly</span>
          </h2>
          <p className="text-slate-500 max-w-xl mx-auto text-sm leading-relaxed">
            Upload a TServer log (.zip, .log, or .txt) with an optional outage timestamp. Thread, memory, DB pool,
            and traffic metrics are parsed instantly — Claude adds a root-cause synopsis and config recommendations.
          </p>
        </div>

        {/* Upload panel */}
        <UploadPanel onAnalyze={handleAnalyze} loading={aiLoading} />

        {/* Error */}
        {error && (
          <div className="rounded-xl p-4 border border-red-500/20 bg-red-500/10 text-red-400 text-sm flex items-start gap-3">
            <svg className="w-5 h-5 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* Results */}
        {parsedSummary && (
          <div ref={resultsRef}>
            <AnalysisResults summary={parsedSummary} outageTime={outageTime} aiResult={aiResult} aiLoading={aiLoading} />
          </div>
        )}
      </div>

      <footer className="border-t border-white/8 mt-20 py-6 text-center text-slate-600 text-xs">
        PE Outage Analyzer · Built with Next.js &amp; Claude AI
      </footer>
    </main>
  );
}
