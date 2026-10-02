import type { ParsedLogSummary } from "./types";

// Shared by the in-app analysis (app/api/analyze/route.ts) and the "Export for Claude"
// brief (lib/claudeExport.ts), so the two always describe a log the same way.

/** How to read a parsed TServer log summary — the analyst guidance both consumers use. */
export const LOG_ANALYST_GUIDANCE =
  "You are an expert server reliability engineer reviewing parsed diagnostic data from TServer, a Java-based website-translation proxy server. You are given real, deterministically parsed metrics and counts below (not raw logs) — ground your root-cause synopsis strictly in these numbers. The CONNECTION POOLS section covers two distinct pools that must not be conflated: the database pool (SQL Server connections, backing the translation database) and the proxy connection pool (BOConManager, backing outbound requests to the origin/proxy target) — a leak in one does not imply a leak in the other, and recommendations should name which pool they address. When Confluence reference material (Master Properties, Release Notes, Site Down runbooks) is provided, use it to recommend specific configuration changes — e.g. passthrough rules, caching settings, request blocking, pool size/timeout settings for whichever pool is implicated — grounded in that documentation rather than generic advice. Pay particular attention to the QUERY PARAMETERS section: query parameters with high distinct-value counts (e.g. click/tracking IDs like ttclid, gclid, cmp) fragment the page cache because each unique value becomes a separate cache key, forcing origin fetches. When such high-cardinality parameters are present, recommend stripping or normalizing them out of the cache key (via the relevant Master Properties cache-key / passthrough configuration) so those URL patterns can be served from cache. When an OUT OF MEMORY STACK TRACES section is present, use the actual application-level frames (com.motionpoint.* classes/methods, not the generic servlet/Tomcat dispatch frames at the bottom) to identify the specific code path/operation that was allocating memory when the heap ran out — name that method/operation explicitly in the synopsis and let it drive at least one recommendation (e.g. a config change that avoids that code path, or a heap-size/GC tuning change), rather than treating the OOM count as just a number.";

/**
 * Confluence search terms for the in-app analysis, derived from what the log shows. These
 * feed lib/confluence.ts, which extracts its own title keywords from them; the export
 * builds separate, search-ready terms (see confluenceSearches in lib/claudeExport.ts).
 */
export function logConfluenceTerms(s: ParsedLogSummary): string[] {
  return [
    ...s.topErrors.slice(0, 5).map((e) => e.type),
    s.flags.dbPoolLeakSuspected ? "database connection pool leak" : "",
    s.flags.connPoolLeakSuspected ? "proxy connection pool BOConManager leak" : "",
    s.flags.oomDetected ? "out of memory heap" : "",
    s.flags.cacheFragmentationSuspected
      ? `cache key query parameter passthrough ${s.queryParams.slice(0, 3).map((p) => p.name).join(" ")}`
      : "",
  ].filter(Boolean);
}

export function summarizeForPrompt(s: ParsedLogSummary, outageTime: string): string {
  const lines: string[] = [];
  lines.push(`File: ${s.fileName} (${s.lineCount.toLocaleString()} lines)`);
  if (s.timespan) lines.push(`Log timespan: ${s.timespan.start} to ${s.timespan.end}`);
  if (outageTime) lines.push(`Reported outage time: ${outageTime}`);

  lines.push("");
  lines.push("CONNECTION POOLS (two distinct pools — do not conflate them):");
  lines.push(
    `- Database pool — server: ${s.dbPoolServerName ?? "none detected"}, peak size ${s.flags.peakDbPoolSize}, leak suspected: ${s.flags.dbPoolLeakSuspected}`
  );
  lines.push(
    `- Proxy connection pool — server: ${s.connPoolServerName ?? "none detected"}, peak size ${s.flags.peakConnPoolSize}, leak suspected: ${s.flags.connPoolLeakSuspected}`
  );

  lines.push("");
  lines.push("MEMORY:");
  lines.push(
    `- Assigned heap (JVM Memory setting at startup): ${s.flags.assignedMemoryMb !== null ? s.flags.assignedMemoryMb.toLocaleString() + " MB" : "not detected"}`
  );
  lines.push(
    `- Minimum observed free memory: ${s.flags.minFreeMemoryPct !== null ? s.flags.minFreeMemoryPct.toFixed(1) + "%" : "no samples"}`
  );

  lines.push("");
  lines.push("CONCURRENCY:");
  lines.push(`- Peak concurrent threads (per bucket): ${s.flags.peakThreadCount}`);

  lines.push("");
  lines.push(`TOP ERRORS/EXCEPTIONS (${s.flags.totalExceptions} total occurrences, OutOfMemoryError count: ${s.flags.oomTotal}):`);
  for (const e of s.topErrors.slice(0, 10)) {
    lines.push(`- ${e.type}: ${e.count}x (first ${e.firstSeen}, last ${e.lastSeen}) — sample: ${e.sample.slice(0, 200)}`);
  }

  if (s.oomStackTraces.length > 0) {
    lines.push("");
    lines.push(
      `OUT OF MEMORY STACK TRACES (distinct code paths, most-frequent first — use these to identify the actual allocation site/leak source):`
    );
    for (const t of s.oomStackTraces) {
      lines.push(`- Occurred ${t.count}x, first at ${t.firstSeen}:`);
      lines.push(t.trace);
    }
  }

  lines.push("");
  lines.push("TOP TRAFFIC SOURCES BY IP (from failed/rejected requests):");
  for (const ip of s.topIps.slice(0, 10)) lines.push(`- ${ip.ip}: ${ip.count}x`);

  lines.push("");
  lines.push("TOP TRAFFIC SOURCES BY USER-AGENT (from failed/rejected requests):");
  for (const ua of s.topUserAgents.slice(0, 10)) lines.push(`- ${ua.userAgent}: ${ua.count}x`);

  lines.push("");
  lines.push("TOP URL PATTERNS (host + path, across proxied translation requests, retries, and errors):");
  for (const u of s.topUrlPatterns.slice(0, 15)) lines.push(`- ${u.pattern}: ${u.count}x`);

  lines.push("");
  lines.push(
    `QUERY PARAMETERS (cache-key cardinality — high distinct-value counts fragment the cache; fragmentation suspected: ${s.flags.cacheFragmentationSuspected}):`
  );
  for (const p of s.queryParams.slice(0, 15)) {
    lines.push(`- ${p.name}: ${p.occurrences} requests, ${p.distinctValues} distinct values`);
  }

  return lines.join("\n");
}
