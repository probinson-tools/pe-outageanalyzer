import { briefFileName, codeTerms, knowledgeSection, pad } from "./claudeBrief";
import { LOG_ANALYST_GUIDANCE, summarizeForPrompt } from "./logPrompt";
import type { ParsedLogSummary } from "./types";

const MAX_SEARCHES = 10;

/**
 * Confluence searches that actually return pages: the exception and class names inside the
 * error messages (whole messages match nothing), plus short phrases verified against the KB
 * for each flag.
 */
function confluenceSearches(s: ParsedLogSummary): string[] {
  const { exceptions, classes } = codeTerms(s.topErrors.map((e) => e.type));
  const flags: string[] = [];
  if (s.flags.oomDetected) flags.push("OutOfMemoryError");
  if (s.flags.dbPoolLeakSuspected || s.flags.connPoolLeakSuspected) flags.push("connection pool");
  if (s.flags.cacheFragmentationSuspected) flags.push("cache key");
  return [...new Set([...exceptions, ...flags, ...classes])].slice(0, MAX_SEARCHES);
}

/**
 * Bucket times back in the log's own format. Log timestamps are parsed with the local-time
 * Date constructor, so local getters reproduce the original wall-clock time exactly —
 * converting to UTC or ISO would shift every row by the browser's offset.
 */
function logTime(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function buildClaudeBrief(s: ParsedLogSummary, outageTime: string): string {
  const out: string[] = [];
  const push = (...l: string[]) => out.push(...l);

  push(
    "# TServer outage analysis brief",
    "",
    "Analyze this TServer (MotionPoint's Java website-translation proxy) log for the root cause of an outage or degradation, and recommend specific configuration changes. Everything under **Parsed data** was extracted deterministically from the log by the PE Outage Analyzer — treat those numbers as facts, ground every claim in them, and do not invent figures that are not there.",
    ""
  );

  push(...knowledgeSection([], confluenceSearches(s), "this log"));

  push("## How to read the data", "", LOG_ANALYST_GUIDANCE, "");

  push("## Parsed data", "", "```text", summarizeForPrompt(s, outageTime), "```", "");

  if (s.chartPoints.length) {
    push(
      "### Timeline",
      "",
      `The log divided into ${s.chartPoints.length} time buckets. Threads is the number of distinct threads active in the bucket; pool sizes and memory carry the last reading forward; OOM is occurrences within the bucket.` +
        (s.dbPoolServerName ? ` DB pool server: ${s.dbPoolServerName}.` : "") +
        (s.connPoolServerName ? ` Proxy pool server: ${s.connPoolServerName}.` : ""),
      "",
      "| Bucket start | Threads | DB pool | Proxy pool | Memory used % | OOM |",
      "|---|---|---|---|---|---|"
    );
    for (const p of s.chartPoints) {
      push(
        `| ${logTime(p.time)} | ${p.threadCount} | ${p.dbPoolSize} | ${p.connPoolSize} | ${
          p.memoryUsedPct === null ? "—" : p.memoryUsedPct.toFixed(1)
        } | ${p.oomCount} |`
      );
    }
    push("");
  }

  if (s.topErrors.length) {
    push(
      "### Error samples",
      "",
      `The ${s.topErrors.length} most frequent error types` +
        (s.flags.distinctErrorTypes > s.topErrors.length ? ` (of ${s.flags.distinctErrorTypes} distinct in the log)` : "") +
        ", each with its full sample — the summary above truncates samples to 200 characters.",
      ""
    );
    for (const e of s.topErrors) {
      push(`**${e.type}** — ${e.count}× (first ${e.firstSeen}, last ${e.lastSeen})`, "", "```text", e.sample, "```", "");
    }
  }

  push(
    "## What to return",
    "",
    "1. **Root-cause synopsis** — what happened, when, and why, referencing the specific numbers and the timeline above. If the data points to more than one plausible cause, rank them and say what distinguishes them.",
    "2. **Recommendations** — for each: priority (immediate, short-term, long-term), the specific TServer / Master Properties key or setting to change and to what, and the Confluence page it is grounded in.",
    "3. **Gaps** — what this data cannot establish, and what to collect next (other logs, a VM state dump, origin response times, a config section) to confirm the diagnosis.",
    ""
  );

  return out.join("\n");
}

/** outage-brief-<log-file-stem>-<YYYYMMDD-HHmm>.md */
export function claudeBriefFileName(s: ParsedLogSummary, now = new Date()): string {
  return briefFileName("outage-brief", s.fileName, "log", now);
}
