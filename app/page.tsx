"use client";

import { useState, useRef } from "react";
import dynamic from "next/dynamic";
import UploadPanel from "@/components/UploadPanel";
import AnalysisResults from "@/components/AnalysisResults";
import type { AnalysisResult } from "@/lib/types";

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

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        let msg = `Server error (${res.status})`;
        try { msg = JSON.parse(text).error || msg; } catch { /* plain text */ }
        throw new Error(msg);
      }

      // Accumulate the streamed response, then parse JSON once complete
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
        const jsonMatch = fullText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No JSON found in response.");
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.__error) throw new Error(parsed.__error as string);
        data = parsed as AnalysisResult;
      } catch (parseErr) {
        console.error("Parse error. Raw response (first 500 chars):", fullText.slice(0, 500));
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
    <main className="min-h-screen bg-[#0f1117]">
      {loading && <LoadingOverlay />}

      {/* Header */}
      <header className="border-b border-white/8 bg-[#0f1117]/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-red-500/20 border border-red-500/40 flex items-center justify-center">
            <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <h1 className="text-white font-semibold text-lg leading-none">Outage Analyzer</h1>
            <p className="text-white/40 text-xs mt-0.5">AI-Powered Log Diagnosis</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse-slow"></span>
            <span className="text-white/40 text-xs">Powered by Claude</span>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-10 space-y-10">
        {/* Hero */}
        <div className="text-center space-y-3">
          <h2 className="text-3xl font-bold text-white">
            Diagnose Server Outages <span className="text-red-400">Instantly</span>
          </h2>
          <p className="text-white/50 max-w-xl mx-auto text-sm leading-relaxed">
            Upload your log ZIP archive and outage timestamp. Claude AI will analyze errors, detect malicious patterns,
            generate visual timelines, and deliver actionable recommendations.
          </p>
        </div>

        {/* Upload panel */}
        <UploadPanel onAnalyze={handleAnalyze} loading={loading} />

        {/* Error */}
        {error && (
          <div className="glass rounded-xl p-4 border-red-500/30 bg-red-500/5 text-red-400 text-sm flex items-start gap-3">
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

      <footer className="border-t border-white/8 mt-20 py-6 text-center text-white/25 text-xs">
        PE Outage Analyzer · Built with Next.js &amp; Claude AI
      </footer>
    </main>
  );
}
