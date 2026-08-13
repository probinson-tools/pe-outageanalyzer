"use client";

import { useState, useRef, useCallback } from "react";
import { mergeSnapshots, parseStatusDump } from "@/lib/statusParser";
import { extractZipEntries } from "@/lib/zip";
import type { StatusAnalysis } from "@/lib/types";

interface Props {
  onAnalyze: (analysis: StatusAnalysis, incidentTime: string, fileName: string) => void;
  loading: boolean;
}

const ACCEPTED_RE = /\.(zip|html?)$/i;

// Only the dump bodies. The poller writes .meta.json sidecars and a results.csv next
// to them, so zipping a whole output folder is the obvious thing to do — those files
// are skipped rather than treated as a failed parse.
const DUMP_ENTRY_RE = /\.html?$/i;

const ANALYZED = [
  "Heap, GC pressure &amp; thread trends per instance",
  "Request throughput, response times &amp; error counters",
  "Config drift and restarts across the server pool",
  "Stuck requests joined to their thread stacks",
  "Cache hit ratios, EhCache &amp; HTTP cache entries",
  "Transformation timings &amp; dead transform rules",
];

export default function StatusUploadPanel({ onAnalyze, loading }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [incidentTime, setIncidentTime] = useState("");
  const [dragging, setDragging] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    if (!ACCEPTED_RE.test(f.name)) {
      setExtractError("Please upload a .zip, .html, or .htm status dump.");
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

  const buildAnalysis = async (f: File): Promise<StatusAnalysis> => {
    const isZip = f.name.toLowerCase().endsWith(".zip");

    if (!isZip) {
      return mergeSnapshots([parseStatusDump(await f.text(), f.name)]);
    }

    const entries = await extractZipEntries(f, DUMP_ENTRY_RE);
    if (entries.length === 0) {
      throw new Error("No status dumps found in the ZIP. Expected .html or .htm files.");
    }

    // One dump that fails to parse shouldn't cost the whole upload — record it and
    // carry on, the same way a partially readable log still produces a report.
    const snapshots = [];
    const parseErrors: StatusAnalysis["parseErrors"] = [];
    for (const entry of entries) {
      try {
        snapshots.push(parseStatusDump(entry.text, entry.name));
      } catch (err) {
        parseErrors.push({
          fileName: entry.name,
          message: err instanceof Error ? err.message : "Unknown parse error",
        });
      }
    }
    if (snapshots.length === 0) {
      throw new Error("None of the files in the ZIP could be parsed as status dumps.");
    }

    return { ...mergeSnapshots(snapshots), parseErrors };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setExtracting(true);
    setExtractError(null);
    try {
      const analysis = await buildAnalysis(file);
      onAnalyze(analysis, incidentTime, file.name);
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
            Status Dump (.zip, .html)
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
            <input ref={inputRef} type="file" accept=".zip,.html,.htm" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
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
                <p className="text-slate-600 text-xs mt-1">One dump, or a .zip of many to merge</p>
              </>
            )}
          </div>
          {extractError && <p className="mt-2 text-red-400 text-xs">{extractError}</p>}
        </div>

        {/* Time & info */}
        <div className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
              Incident Date &amp; Time <span className="normal-case text-slate-600">(optional)</span>
            </label>
            <input
              type="datetime-local"
              value={incidentTime}
              onChange={(e) => setIncidentTime(e.target.value)}
              disabled={busy}
              className="w-full bg-[#0F1117] border border-white/10 rounded-lg px-4 py-3 text-slate-200 text-sm placeholder:text-slate-600 transition-all disabled:opacity-50"
            />
          </div>
          <div className="rounded-xl bg-white/3 border border-white/8 p-4 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">What gets analyzed</p>
            {ANALYZED.map((item) => (
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
            {extracting ? "Parsing status dumps…" : "Analyzing with Claude…"}
          </span>
        ) : "Analyze Status Dumps"}
      </button>
    </form>
  );
}
