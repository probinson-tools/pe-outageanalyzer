"use client";

interface Props { synopsis: string; outageTime: string }

export default function Synopsis({ synopsis, outageTime }: Props) {
  const paragraphs = synopsis.split(/\n+/).filter(Boolean);

  return (
    <div className="glass rounded-2xl p-6 glow-red">
      <div className="flex items-start gap-4 mb-6">
        <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center shrink-0">
          <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <div>
          <h3 className="text-white font-semibold text-lg">Root Cause Synopsis</h3>
          <p className="text-white/40 text-xs mt-0.5">AI analysis of what likely caused this outage · Outage time: {outageTime}</p>
        </div>
      </div>
      <div className="space-y-4 border-l-2 border-red-500/20 pl-5">
        {paragraphs.map((p, i) => (
          <p key={i} className="text-white/70 text-sm leading-relaxed">{p}</p>
        ))}
      </div>
    </div>
  );
}
