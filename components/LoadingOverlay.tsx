"use client";

import { useEffect, useState } from "react";

const STEPS = [
  "Parsing log structure…",
  "Identifying error patterns…",
  "Detecting anomalous traffic…",
  "Reconstructing event timeline…",
  "Analyzing memory pressure…",
  "Cross-referencing bot signatures…",
  "Generating root cause analysis…",
  "Compiling recommendations…",
];

export default function LoadingOverlay() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const iv = setInterval(() => setStep((s) => (s + 1) % STEPS.length), 2200);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-[#0F1117]/90 backdrop-blur-sm flex items-center justify-center">
      <div className="glass rounded-2xl p-10 max-w-sm w-full mx-4 text-center space-y-6">
        <div className="relative w-16 h-16 mx-auto">
          <div className="absolute inset-0 rounded-full border-2 border-blue-500/20 animate-ping"></div>
          <div className="absolute inset-2 rounded-full border-2 border-t-blue-400 border-white/10 animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
        </div>
        <div>
          <p className="text-slate-100 font-semibold">Claude is analyzing your logs</p>
          <p className="text-slate-500 text-sm mt-1 h-5 transition-all">{STEPS[step]}</p>
        </div>
        <div className="flex gap-1 justify-center">
          {STEPS.map((_, i) => (
            <div key={i} className={`h-1 rounded-full transition-all duration-500 ${i === step ? "w-6 bg-blue-400" : "w-1.5 bg-white/15"}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
