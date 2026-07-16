"use client";

import { useState, useRef, useCallback } from "react";
import { parseLog } from "@/lib/logParser";
import type { ParsedLogSummary } from "@/lib/types";

interface Props {
  onAnalyze: (summary: ParsedLogSummary, outageTime: string, fileName: string) => void;
  loading: boolean;
}

const ACCEPTED_RE = /\.(zip|log|txt)$/i;

export default function UploadPanel({ onAnalyze, loading }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [outageTime, setOutageTime] = useState("");
  const [dragging, setDragging] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    if (!ACCEPTED_RE.test(f.name)) {
      setExtractError("Please upload a .zip, .log, or .txt file.");
      return;
    }
    setExtractError(null);
    setFile(f);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, []);

  const extractZipText = async (f: File): Promise<string> => {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(f);
    const logParts: string[] = [];

    const entries = Object.entries(zip.files).sort(([a], [b]) => a.localeCompare(b));
    for (const [name, entry] of entries) {
      if (entry.dir) continue;
      const lower = name.toLowerCase();
      if (!lower.match(/\.(log|txt|out|err|access|error|debug|info|json|csv)$/) && !lower.includes("log")) continue;
      const text = await entry.async("string");
      logParts.push(`\n===== FILE: ${name} =====\n${text}`);
    }

    if (logParts.length === 0) {
      throw new Error("No log files found in the ZIP. Expected .log, .txt, .out, .err, or similar files.");
    }
    return logParts.join("\n");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setExtracting(true);
    setExtractError(null);
    try {
      const isZip = file.name.toLowerCase().endsWith(".zip");
      const fullText = isZip ? await extractZipText(file) : await file.text();
      const summary = parseLog(fullText, file.name);
      onAnalyze(summary, outageTime, file.name);
    } catch (err) {
      setExtractError("Failed to read file: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setExtracting(false);
    }
  };

  const busy = loading || extracting;

  return (
    <form onSubmit={handleSubmit} className="glass rounded-2xl p-6 space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        {/* File drop zone */}
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
            Log File (.zip, .log, .txt)
          </label>
          <div
            onClick={() => !busy && inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`
              relative rounded-xl border-2 border-dashed h-36 flex flex-col items-center justify-center cursor-pointer transition-all
              ${dragging ? "border-blue-400 bg-blue-500/10" : file ? "border-green-400/50 bg-green-500/5" : "border-white/15 hover:border-white/30 hover:bg-white/3"}
              ${busy ? "pointer-events-none opacity-50" : ""}
            `}
          >
            <input ref={inputRef} type="file" accept=".zip,.log,.txt" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
            {file ? (
              <>
                <svg className="w-8 h-8 text-green-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-green-400 text-sm font-medium">{file.name}</p>
                <p className="text-slate-600 text-xs mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </>
            ) : (
              <>
                <svg className="w-8 h-8 text-slate-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-slate-500 text-sm">Drop a file here or <span className="text-blue-400">browse</span></p>
                <p className="text-slate-600 text-xs mt-1">.zip, .log, or .txt files</p>
              </>
            )}
          </div>
          {extractError && <p className="mt-2 text-red-400 text-xs">{extractError}</p>}
        </div>

        {/* Time & info */}
        <div className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
              Outage Date &amp; Time <span className="normal-case text-slate-600">(optional)</span>
            </label>
            <input
              type="datetime-local"
              value={outageTime}
              onChange={(e) => setOutageTime(e.target.value)}
              disabled={busy}
              className="w-full bg-[#0F1117] border border-white/10 rounded-lg px-4 py-3 text-slate-200 text-sm placeholder:text-slate-600 transition-all disabled:opacity-50"
            />
          </div>
          <div className="rounded-xl bg-white/3 border border-white/8 p-4 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">What gets analyzed</p>
            {["Thread count, memory &amp; DB pool trends", "Top errors &amp; exceptions", "Top traffic sources (IP &amp; User-Agent)", "Top URL patterns", "Root cause synopsis", "Config-change recommendations"].map((item) => (
              <div key={item} className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400/60"></div>
                <span className="text-slate-500 text-xs" dangerouslySetInnerHTML={{ __html: item }} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={!file || busy}
        className="w-full py-3.5 rounded-lg bg-blue-600 text-white font-medium text-sm hover:bg-blue-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {busy ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            {extracting ? "Parsing logs…" : "Analyzing with Claude…"}
          </span>
        ) : "Analyze Logs"}
      </button>
    </form>
  );
}
