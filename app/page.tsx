"use client";

import { useState, useRef } from "react";
import dynamic from "next/dynamic";
import UploadPanel from "@/components/UploadPanel";
import AnalysisResults from "@/components/AnalysisResults";
import type { AnalysisResult } from "@/lib/types";
import { repairJson } from "@/lib/repairJson";

const LoadingOverlay = dynamic(() => import("@/components/LoadingOverlay"), { ssr: false });

export default function Home() {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const handleAnalyze = async (logContent: string, outageTime: string, fileName: string) => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logContent, outageTime, fileName }),
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
      setResult(data);
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#0F1117]">
      {loading && <LoadingOverlay />}

      {/* Header */}
      <header className="border-b border-white/8 bg-[#1A1D2E] sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <span className="text-base font-bold text-slate-100 tracking-tight">PE Outage Analyzer</span>
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
            Upload your log ZIP archive and outage timestamp. Claude AI will analyze errors, detect malicious patterns,
            generate visual timelines, and deliver actionable recommendations.
          </p>
        </div>

        {/* Upload panel */}
        <UploadPanel onAnalyze={handleAnalyze} loading={loading} />

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
        {result && (
          <div ref={resultsRef}>
            <AnalysisResults result={result} />
          </div>
        )}
      </div>

      <footer className="border-t border-white/8 mt-20 py-6 text-center text-slate-600 text-xs">
        PE Outage Analyzer · Built with Next.js &amp; Claude AI
      </footer>
    </main>
  );
}
