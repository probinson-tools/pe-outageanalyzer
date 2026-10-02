import { LOG_ANALYST_GUIDANCE, summarizeForPrompt } from "./logPrompt";
import type { ParsedLogSummary } from "./types";

/**
 * Where the MotionPoint knowledge base lives in Confluence. These are page IDs in the
 * Operations space and will need updating if the pages are moved or rebuilt.
 */
export const CONFLUENCE_KB = {
  site: "motionpoint.atlassian.net",
  peHq: { id: "838238213", title: "Platform Engineering HQ (Operations space)" },
  pages: [
    { id: "1885011969", title: "Pager Duty Incident Patterns & Known Fixes — resolved incidents classified by alert signal and fix" },
    { id: "888274973", title: "PE KnowledgeBase (folder) — Log Error Messages, Read Timeout properties, MP Action IDs" },
    { id: "1789558789", title: "Master Properties Cheat Sheet" },
    { id: "1789952026", title: "Master Properties - Full" },
    { id: "1789984781", title: "TServer Bug Patterns — Additional Cases" },
    { id: "1789689862", title: "Client Troubleshooting Cases" },
    { id: "1788444701", title: "CDN Issues & Bug Fixes / Workarounds" },
  ],
};

const MAX_SEARCHES = 10;
const EXCEPTION_RE = /\b[A-Z][A-Za-z0-9]*(?:Exception|Error)\b/g;
const CLASS_RE = /\b([A-Z][A-Za-z0-9]+)\.[a-z]\w*\(/g;
/**
 * Short simple class names (Manager, Util, Handler) are too generic to search on —
 * "Manager" matched GSM and machine-translation pages unrelated to the error it came from.
 * The distinctive ones (ApacheHttpClientNg2, BOConManager, HTMLTranslatorTS) are longer.
 */
const MIN_CLASS_TERM_LENGTH = 10;

/**
 * Confluence searches that actually return pages.
 *
 * Error "types" here are whole log messages — "ApacheHttpClientNg2.getFromURL():
 * SocketTimeoutException. Connecting from <host>/<ip> Retry: 0" — and searching on a whole
 * message finds nothing, because no wiki page contains that host or retry count. Long
 * phrases fail the same way. The exception and class names inside them, and short phrases,
 * do match: checked against the KB, "ApacheHttpClientNg2" finds the connection-client and
 * Master Properties pages, while the full message and "proxy connection pool BOConManager
 * leak" find nothing.
 */
function confluenceSearches(s: ParsedLogSummary): string[] {
  const exceptions: string[] = [];
  const classes: string[] = [];
  for (const e of s.topErrors) {
    for (const m of e.type.matchAll(EXCEPTION_RE)) exceptions.push(m[0]);
    for (const m of e.type.matchAll(CLASS_RE)) if (m[1].length >= MIN_CLASS_TERM_LENGTH) classes.push(m[1]);
  }
  const flags: string[] = [];
  if (s.flags.oomDetected) flags.push("OutOfMemoryError");
  if (s.flags.dbPoolLeakSuspected || s.flags.connPoolLeakSuspected) flags.push("connection pool");
  if (s.flags.cacheFragmentationSuspected) flags.push("cache key");
  return [...new Set([...exceptions, ...flags, ...classes])].slice(0, MAX_SEARCHES);
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/**
 * Bucket times back in the log's own format. Log timestamps are parsed with the local-time
 * Date constructor, so local getters reproduce the original wall-clock time exactly —
 * converting to UTC or ISO would shift every row by the browser's offset.
 */
function logTime(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** CQL can't contain an unescaped double quote inside a text ~ "…" term. */
function cqlTerm(term: string): string {
  return term.replace(/["\\]/g, " ").replace(/\s+/g, " ").trim();
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

  push(
    "## Knowledge to use",
    "",
    "- **Your memory and project knowledge** of MotionPoint, TServer, and this customer, if you have any.",
    `- **MotionPoint Confluence**, through the Atlassian connector (\`${CONFLUENCE_KB.site}\`). Start with:`,
    `  - ${CONFLUENCE_KB.peHq.title} — page ${CONFLUENCE_KB.peHq.id}`,
    ...CONFLUENCE_KB.pages.map((p) => `  - ${p.title} — page ${p.id}`),
    "- Search beyond those pages wherever the findings lead. Search on short keywords — an exception or class name, a property name, a two-word phrase — not whole log lines, which match nothing. Read the pages you rely on rather than working from search snippets, and **cite the page title and ID behind each recommendation**.",
    ""
  );

  const terms = confluenceSearches(s).map(cqlTerm).filter(Boolean);
  if (terms.length) {
    push("Suggested starting searches, generated from what this log shows:", "", "```");
    for (const t of terms) push(`ancestor = ${CONFLUENCE_KB.peHq.id} AND text ~ "${t}"`);
    push("```", "");
  }

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
  const stem =
    s.fileName
      .replace(/\.[^.]+$/, "")
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "log";
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `outage-brief-${stem}-${stamp}.md`;
}
