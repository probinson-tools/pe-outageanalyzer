import { briefFileName, codeTerms, KB_VM_STATE_PAGES, knowledgeSection } from "./claudeBrief";
import { toPromptPayload } from "./statusParser";
import { STATUS_ANALYST_GUIDANCE, summarizeStatusForPrompt } from "./statusPrompt";
import type { PendingRequestOccurrence, StatusAnalysis, StatusSeriesPoint } from "./types";

const MAX_SEARCHES = 10;
/** Above this the timeline is thinned evenly per instance; a brief should stay readable. */
const MAX_TIMELINE_ROWS = 300;
/** Slowest in-flight requests given their full stack; the summary already has 12 at 15 frames. */
const FULL_STACKS = 5;
/** Transforms listed in total, matching the Transformation Rules panel's own limit. */
const MAX_TRANSFORMS = 60;
/** Distinct in-flight requests listed. */
const MAX_IN_FLIGHT = 60;

/** Snapshot times come from the dump's own UTC Time field, so they are shown in UTC. */
function utc(ms: number): string {
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 19).replace("T", " ") : "—";
}

const num = (v: number | null, digits = 0) => (v === null || !Number.isFinite(v) ? "—" : v.toFixed(digits));

/** Markdown table cells can't contain a raw pipe or line break. */
const cell = (t: string) => t.replace(/\|/g, "\\|").replace(/\s+/g, " ");

const cleanFrame = (f: string) => f.replace(/^(?:app\/\/|java\.base@[\d.]+\/)/, "");

/**
 * A stack down to its last application frame. Below that sit the Tomcat and thread-pool
 * dispatch frames, identical on every request and roughly half of each stack's length —
 * the guidance already tells the reader to ignore them.
 */
function appStack(stack: string[]): { frames: string[]; omitted: number } {
  const last = stack.reduce((idx, f, i) => (f.includes("com.motionpoint") ? i : idx), -1);
  const keep = last >= 0 ? last + 1 : Math.min(stack.length, 25);
  return { frames: stack.slice(0, keep).map(cleanFrame), omitted: stack.length - keep };
}

/**
 * Searches verified against the KB to return pages. Long phrases — what the in-app route
 * sends, e.g. "properties hash mismatch server configuration drift replication" — match
 * nothing; these short forms do. "properties hash" was rejected (it matches the two words
 * separately) and "Xmx" (release notes only). Class names come from the application frames
 * the in-flight threads were caught in.
 */
function confluenceSearches(a: StatusAnalysis): string[] {
  const f = a.flags;
  const terms = ["1073741829"]; // the status page itself — finds MP Action IDs
  if (f.configDriftDetected) terms.push("replication");
  if (f.heapPressure || f.oomDetected) terms.push("heap");
  if (f.gcPressure) terms.push("garbage collection");
  if (f.connPoolSaturation) terms.push("connection pool");
  const topFrame = a.hotStacks[0]?.frames[0] ?? "";
  if (f.stuckRequests || /socket(Read|Connect)/i.test(topFrame)) terms.push("read timeout");
  if (f.lowHitRatioCaches.length || a.httpCacheTotals.withQuery > 0) terms.push("cache key");
  const appFrames = [...a.hotStacks.flatMap((s) => s.frames), ...a.hotFrames.map((h) => h.frame)].filter((x) =>
    x.includes("com.motionpoint")
  );
  terms.push(...codeTerms(appFrames).classes);
  return [...new Set(terms)].slice(0, MAX_SEARCHES);
}

/**
 * In-flight requests, one entry per request rather than per sighting.
 *
 * A request that stays stuck is caught again by every later snapshot, each time with a
 * larger elapsed time, so ranking sightings by elapsed fills the list with one request: on a
 * 269-dump upload all 60 of the slowest sightings were the same GET, stuck 6.7 hours. Built
 * from every snapshot (not the analysis's top-60 sightings, which is already that one
 * request) and keyed by instance, request id and URL, keeping the longest sighting.
 */
function distinctInFlight(a: StatusAnalysis): { list: { r: PendingRequestOccurrence; seen: number }[]; sightings: number } {
  const byKey = new Map<string, { r: PendingRequestOccurrence; seen: number }>();
  let sightings = 0;
  for (const snap of a.snapshots) {
    for (const p of snap.pendingRequests) {
      if (p.stack.some((f) => f.includes("ServerAdminHandler"))) continue;
      sightings++;
      const key = `${snap.instanceId}|${p.requestId}|${p.url}`;
      const occ: PendingRequestOccurrence = { ...p, time: snap.time, instanceId: snap.instanceId, fileName: snap.fileName };
      const prev = byKey.get(key);
      if (!prev) byKey.set(key, { r: occ, seen: 1 });
      else {
        prev.seen++;
        if (occ.elapsedMs > prev.r.elapsedMs) prev.r = occ;
      }
    }
  }
  return { list: [...byKey.values()].sort((x, y) => y.r.elapsedMs - x.r.elapsedMs), sightings };
}

/**
 * Every snapshot when there are few enough; otherwise every Nth per instance, always keeping
 * each instance's last snapshot and any snapshot taken just after a restart.
 */
function timelinePoints(a: StatusAnalysis): { points: StatusSeriesPoint[]; step: number } {
  const total = a.instances.reduce((n, i) => n + i.points.length, 0);
  const step = Math.max(1, Math.ceil(total / MAX_TIMELINE_ROWS));
  const kept = a.instances.flatMap((inst) =>
    inst.points.filter((p, i) => i % step === 0 || i === inst.points.length - 1 || p.restartedSincePrevious)
  );
  return { points: kept.sort((x, y) => x.time - y.time), step };
}

export function buildStatusClaudeBrief(a: StatusAnalysis, incidentTime: string): string {
  const payload = toPromptPayload(a);
  const out: string[] = [];
  const push = (...l: string[]) => out.push(...l);

  push(
    "# TServer VM state analysis brief",
    "",
    `Analyze these ${a.snapshotCount} TServer (MotionPoint's Java website-translation proxy) VM state snapshots — the server's own status page, mpactionid 1073741829, captured repeatedly across ${a.fleet.instanceCount} server instance${a.fleet.instanceCount === 1 ? "" : "s"} — for the cause of an outage or degradation, and recommend specific configuration changes. Everything under **Parsed data** was extracted deterministically from the dumps by the PE Outage Analyzer — treat those numbers as facts, ground every claim in them, and do not invent figures that are not there.`,
    ""
  );

  push(...knowledgeSection(KB_VM_STATE_PAGES, confluenceSearches(a), "these snapshots"));

  push("## How to read the data", "", STATUS_ANALYST_GUIDANCE, "");

  push("## Parsed data", "", "```text", summarizeStatusForPrompt(payload, incidentTime), "```", "");

  // ── Appendix: only what the summary above does not already carry ──

  const { points, step } = timelinePoints(a);
  if (points.length) {
    push(
      "### Timeline by snapshot",
      "",
      (step > 1
        ? `${points.length} of ${a.snapshotCount} snapshots — every ${step}th per instance, plus each instance's last and any taken just after a restart. `
        : `All ${points.length} snapshots. `) +
        "Times are UTC from each dump. Req/s since start is the lifetime average; interval req/s is the rolling window. GC ms/min is computed between consecutive snapshots of the same instance and is blank at a series start or across a restart. Interval error counts are in the summary above.",
      "",
      "| Time (UTC) | Instance | Heap % | Threads | Req/s since start | Interval req/s | Avg page (s) | GC ms/min | Pool leased / avail / pending | In-flight | Note |",
      "|---|---|---|---|---|---|---|---|---|---|---|"
    );
    for (const p of points) {
      push(
        `| ${utc(p.time)} | ${p.instanceId} | ${num(p.heapUsedPct, 1)} | ${num(p.threadCount)} | ${num(p.rps, 2)} | ${num(
          p.intervalRps,
          2
        )} | ${num(p.avgRespPage, 3)} | ${num(p.gcMsPerMin)} | ${num(p.connLeased)} / ${num(p.connAvailable)} / ${num(
          p.connPending
        )} | ${p.pendingCount} | ${p.restartedSincePrevious ? "restarted" : ""} |`
      );
    }
    push("");
  }

  const { list: distinct, sightings } = distinctInFlight(a);
  if (distinct.length) {
    const shown = distinct.slice(0, MAX_IN_FLIGHT);
    push(
      "### In-flight requests",
      "",
      `The ${shown.length} slowest distinct requests still running when a snapshot was taken (of ${distinct.length.toLocaleString()} distinct, ${sightings.toLocaleString()} sightings across all snapshots). A request still running across several snapshots is listed once, at its longest elapsed time, with how many snapshots caught it — a high count is a request stuck for that long, not that many requests. The poller's own status request is left out.`,
      "",
      "| Last seen (UTC) | Instance | Elapsed (ms) | Snapshots | State | Request | TransformID |",
      "|---|---|---|---|---|---|---|"
    );
    for (const { r, seen } of shown) {
      push(
        `| ${utc(r.time)} | ${r.instanceId} | ${r.elapsedMs.toLocaleString()} | ${seen} | ${r.state ?? "—"} | ${cell(`${r.method} ${r.url}`)} | ${cell(
          r.transformId
        )} |`
      );
    }
    push("");
    const withStacks = shown.filter(({ r }) => r.stack.length).slice(0, FULL_STACKS);
    if (withStacks.length) {
      push(
        `Stacks for the ${withStacks.length} slowest, top of stack first, down to the last application frame:`,
        ""
      );
      for (const { r, seen } of withStacks) {
        const st = appStack(r.stack);
        push(
          `**${r.elapsedMs.toLocaleString()} ms** — instance ${r.instanceId}, last seen ${utc(r.time)} (${seen} snapshot${seen === 1 ? "" : "s"}), ${r.state ?? "state unknown"}: ${r.method} ${r.url}`,
          "",
          "```text",
          ...st.frames,
          ...(st.omitted ? [`… ${st.omitted} generic dispatch frames below omitted`] : []),
          "```",
          ""
        );
      }
    }
  }

  const moreStacks = a.hotStacks.slice(payload.hotStacks.length);
  if (moreStacks.length) {
    const from = payload.hotStacks.length + 1;
    push(
      `### Top-of-stack sequences ${from}–${a.hotStacks.length}`,
      "",
      `Continuing the list in the summary, over the same ${a.hotStackSampleSize.toLocaleString()} in-flight threads:`,
      ""
    );
    moreStacks.forEach((st, i) => {
      push(`${from + i}. ${st.count}× (${st.pct.toFixed(1)}%)`, "", "```text", ...st.frames, "```", "");
    });
  }

  const morePatterns = a.cacheUrlPatterns.slice(payload.cacheUrlPatterns.length);
  if (morePatterns.length) {
    push(
      `### Cached URL patterns ${payload.cacheUrlPatterns.length + 1}–${a.cacheUrlPatterns.length}`,
      "",
      "| Pattern | Accessed once | URLs | Share | Accesses | Reuse | Flagged |",
      "|---|---|---|---|---|---|---|"
    );
    for (const c of morePatterns) {
      push(
        `| ${cell(c.pattern)} | ${c.singleAccessCount} | ${c.urlCount} | ${c.singleAccessPct.toFixed(0)}% | ${c.totalAccesses} | ${c.reuseRatio.toFixed(2)}× | ${
          c.flagged ? "no-cache candidate" : ""
        } |`
      );
    }
    push("");
  }

  const moreParams = a.cacheKeyParams.slice(payload.cacheKeyParams.length);
  if (moreParams.length) {
    push(
      `### Cache key parameters ${payload.cacheKeyParams.length + 1}–${a.cacheKeyParams.length}`,
      "",
      "| Parameter | Cached URLs | Accesses | Distinct values | Unique | Merges if excluded | Tracking |",
      "|---|---|---|---|---|---|---|"
    );
    for (const k of moreParams) {
      push(
        `| ${cell(k.name)} | ${k.urlCount} | ${k.accessCount} | ${k.distinctValues} | ${k.uniquenessPct.toFixed(0)}% | ${k.collapsesTo} | ${
          k.likelyTracking ? "yes" : ""
        } |`
      );
    }
    push("");
  }

  const moreTransforms = a.transforms.slice(payload.transforms.length, MAX_TRANSFORMS);
  const restTransforms = a.transforms.slice(Math.max(MAX_TRANSFORMS, payload.transforms.length));
  if (moreTransforms.length) {
    push(
      `### Transformation rules ${payload.transforms.length + 1}–${payload.transforms.length + moreTransforms.length}`,
      "",
      "Continuing the slowest-first list (peak observed per Id) past the ones in the summary.",
      "",
      "| Id | Max (ms) | Avg (ms) | Matches | Executions |",
      "|---|---|---|---|---|"
    );
    for (const t of moreTransforms) push(`| ${t.id} | ${t.maxMs} | ${t.avgMs} | ${t.matches} | ${t.executions} |`);
    if (restTransforms.length) {
      push(
        "",
        `${restTransforms.length} more transforms omitted, none slower than ${Math.max(...restTransforms.map((t) => t.maxMs))} ms at peak.`
      );
    }
    push("");
  }

  push(
    "## What to return",
    "",
    "1. **Root-cause synopsis** — what happened, when, on which instances, and why, referencing the specific numbers and the timeline above. If the data points to more than one plausible cause, rank them and say what distinguishes them.",
    "2. **Recommendations** — for each: priority (immediate, short-term, long-term), the specific TServer / Master Properties key or setting to change and to what, and the Confluence page it is grounded in.",
    "3. **Gaps** — what these snapshots cannot establish, and what to collect next to confirm the diagnosis: a TServer log for the same window (the PE Outage Analyzer's log page exports the same kind of brief), origin response times, or a config section.",
    ""
  );

  return out.join("\n");
}

/** vm-state-brief-<first-dump-stem>-<YYYYMMDD-HHmm>.md */
export function statusBriefFileName(a: StatusAnalysis, now = new Date()): string {
  return briefFileName("vm-state-brief", a.fileNames[0] ?? "", "dumps", now);
}
