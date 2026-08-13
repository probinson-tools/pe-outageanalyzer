import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { searchConfluence } from "@/lib/confluence";
import type { StatusPromptPayload } from "@/lib/types";

export const runtime = "edge";
export const maxDuration = 60;

function errorResponse(message: string, status = 500) {
  return new Response(JSON.stringify({ __error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function summarizeStatusForPrompt(p: StatusPromptPayload, incidentTime: string): string {
  const lines: string[] = [];
  const f = p.flags;

  lines.push(`Source: ${p.fileNames.length} file(s), ${p.snapshotCount} status snapshot(s)`);
  if (p.timespan) lines.push(`Snapshot window: ${p.timespan.start} to ${p.timespan.end}`);
  if (incidentTime) lines.push(`Reported incident time: ${incidentTime}`);

  lines.push("");
  lines.push(`SERVER FLEET (${p.fleet.instanceCount} distinct instance Id(s) observed):`);
  for (const i of p.instances) {
    lines.push(
      `- Instance ${i.instanceId} — started ${i.startTime ?? "unknown"}, version ${i.version ?? "unknown"}, ` +
        `properties hash ${i.propertiesHash ?? "unknown"} (properties version ${i.propertiesVersion ?? "unknown"}), ` +
        `${i.snapshotCount} snapshot(s)`
    );
    lines.push(
      `    peak heap ${i.peakHeapUsedPct !== null ? i.peakHeapUsedPct.toFixed(1) + "%" : "n/a"}, ` +
        `min heap free ${i.minHeapAvailableMb !== null ? i.minHeapAvailableMb.toLocaleString() + " MB" : "n/a"}, ` +
        `peak threads ${i.peakThreadCount ?? "n/a"}, ` +
        `avg ${i.avgRps !== null ? i.avgRps.toFixed(2) + " req/s" : "n/a"}, ` +
        `avg page response ${i.avgRespPage !== null ? i.avgRespPage.toFixed(3) + "s" : "n/a"}, ` +
        `peak GC ${i.peakGcMsPerMin !== null ? Math.round(i.peakGcMsPerMin) + " ms/min" : "n/a"}, ` +
        `requests observed over the window ${i.requestsObserved !== null ? i.requestsObserved.toLocaleString() : "n/a"}`
    );
  }

  lines.push("");
  lines.push("CONFIGURATION CONSISTENCY:");
  lines.push(`- Distinct properties hashes across the pool: ${p.fleet.propertiesHashes.length}`);
  for (const g of p.fleet.propertiesHashes) {
    lines.push(`    hash ${g.value} → instance(s) ${g.instanceIds.join(", ")}`);
  }
  lines.push(
    `- Distinct properties versions: ${p.fleet.propertiesVersions.length} (${p.fleet.propertiesVersions
      .map((g) => g.value)
      .join(", ")})`
  );
  lines.push(`- Distinct software versions: ${p.fleet.versions.map((g) => g.value).join(", ") || "unknown"}`);
  lines.push(`- Config drift detected: ${f.configDriftDetected}`);
  lines.push(`- Restart detected: ${f.restartDetected}${f.restartedInstanceIds.length ? ` (instance ${f.restartedInstanceIds.join(", ")})` : ""}`);

  lines.push("");
  lines.push("MEMORY & GC:");
  lines.push(`- Peak heap used: ${f.peakHeapUsedPct !== null ? f.peakHeapUsedPct.toFixed(1) + "%" : "n/a"} (pressure flag: ${f.heapPressure})`);
  lines.push(`- Minimum heap available observed: ${f.minHeapAvailableMb !== null ? f.minHeapAvailableMb.toLocaleString() + " MB" : "n/a"}`);
  lines.push(`- Peak GC time: ${f.peakGcMsPerMin !== null ? Math.round(f.peakGcMsPerMin) + " ms per wall-clock minute" : "n/a"} (pressure flag: ${f.gcPressure})`);
  lines.push(`- OutOfMemory errors: ${f.oomTotal}`);

  lines.push("");
  lines.push("CONCURRENCY & OUTBOUND POOL:");
  lines.push(`- Peak thread count: ${f.peakThreadCount}`);
  lines.push(
    `- ApacheHttpClientNg2 pool: peak leased ${f.peakConnLeased ?? "n/a"} of max ${f.connPoolMax ?? "n/a"} (saturation flag: ${f.connPoolSaturation})`
  );
  lines.push(`- Total connection errors (fleet, cumulative): ${f.totalConnectionErrors}`);

  if (p.sslErrorHosts.length) {
    lines.push("");
    lines.push("SSL CONNECTION ERRORS BY ORIGIN HOST:");
    for (const h of p.sslErrorHosts) lines.push(`- ${h.host}: ${h.count}${h.pct !== null ? ` (${h.pct}%)` : ""}`);
  }

  if (p.intervalErrorSamples.length) {
    lines.push("");
    lines.push("INTERVAL ERROR COUNTERS (each instance's own rolling window, capped at 60 min):");
    for (const s of p.intervalErrorSamples) {
      lines.push(
        `- ${s.time} instance ${s.instanceId}: ${s.totalRequests?.toLocaleString() ?? "?"} requests in ${s.windowMin ?? "?"} min — ` +
          `connection ${s.connection ?? 0}, database ${s.database ?? 0}, OOM ${s.oom ?? 0}, other ${s.other ?? 0}`
      );
    }
  }

  lines.push("");
  lines.push(
    `IN-FLIGHT REQUESTS AT SNAPSHOT TIME (${f.totalPendingRequests} total, longest ${f.longestPendingMs} ms, stuck flag: ${f.stuckRequests}).`
  );
  lines.push(
    "Each entry is a request the server had not finished, joined to its thread's stack. These stacks name the exact code path the request was in:"
  );
  for (const r of p.topPendingRequests) {
    lines.push(
      `- ${r.elapsedMs} ms, ${r.state ?? "state unknown"}, instance ${r.instanceId} at ${r.time}: ${r.method} ${r.url} (TransformID=${r.transformId})`
    );
    if (r.stack.length) lines.push(`    stack: ${r.stack.join(" <- ")}`);
  }

  if (p.hotFrames.length) {
    lines.push("");
    lines.push("MOST FREQUENT APPLICATION FRAMES ACROSS IN-FLIGHT THREADS:");
    for (const h of p.hotFrames) lines.push(`- ${h.count}x ${h.frame}`);
  }

  lines.push("");
  lines.push("CACHE HIT RATIOS (averaged across snapshots; entries/size are the latest reading):");
  for (const c of p.cacheRollup) {
    lines.push(
      `- ${c.name}: avg ${c.avgHitRatio !== null ? c.avgHitRatio.toFixed(2) + "%" : "n/a"}` +
        (c.samples > 1 && c.minHitRatio !== null && c.maxHitRatio !== null
          ? ` (range ${c.minHitRatio.toFixed(2)}–${c.maxHitRatio.toFixed(2)}%)`
          : "") +
        `, ${c.latestEntries.toLocaleString()} entries, ${c.latestDataSizeMb} MB, ${c.totalEvictions.toLocaleString()} LRU evictions`
    );
  }
  if (f.lowHitRatioCaches.length) {
    lines.push(`- Caches flagged as low hit ratio: ${f.lowHitRatioCaches.join(", ")}`);
  }

  if (p.ehCacheRollup.length) {
    lines.push("");
    lines.push("EHCACHE (latest reading; counters are cumulative per instance):");
    for (const e of p.ehCacheRollup) {
      lines.push(
        `- ${e.name}: ${e.hitPercentage.toFixed(2)}% hit over ${e.gets.toLocaleString()} gets, ` +
          `${e.misses.toLocaleString()} misses, ${e.evictions.toLocaleString()} evictions, ` +
          `${(e.onHeapBytes / 1048576).toFixed(1)} MB on heap, TTL ${e.creationExpiry ?? "unknown"}`
      );
    }
  }

  lines.push("");
  lines.push(
    `HTTP PAGE CACHE CONTENTS: ${p.httpCache.distinctUrls.toLocaleString()} distinct URLs cached, ` +
      `${p.httpCache.withQuery.toLocaleString()} of them carrying a query string. Most-accessed:`
  );
  for (const u of p.httpCache.topUrls) {
    lines.push(`- ${u.accessCount.toLocaleString()}x ${u.url}`);
  }

  if (p.transforms.length) {
    lines.push("");
    lines.push("SLOWEST TRANSFORMATION RULES (peak observed per Id):");
    for (const t of p.transforms) {
      lines.push(`- Id=${t.id}: max ${t.maxMs}ms, avg ${t.avgMs}ms, ${t.matches.toLocaleString()} matches, ${t.executions.toLocaleString()} executions`);
    }
  }
  lines.push(`- Transforms whose condition never matched in any snapshot: ${p.deadTransformCount}`);

  return lines.join("\n");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return errorResponse("Invalid request body.", 400);

    const { payload, incidentTime } = body as {
      payload: StatusPromptPayload;
      incidentTime?: string;
    };

    if (!payload) {
      return errorResponse("payload is required.", 400);
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return errorResponse("ANTHROPIC_API_KEY is not configured.", 500);

    const client = new Anthropic({ apiKey });

    const f = payload.flags;
    const confluenceQuery = [
      f.configDriftDetected ? "properties hash mismatch server configuration drift replication" : "",
      f.heapPressure || f.oomDetected ? "heap size Xmx out of memory tuning" : "",
      f.gcPressure ? "garbage collection G1 tuning pause" : "",
      f.connPoolSaturation ? "ApacheHttpClient connection pool max total timeout" : "",
      f.lowHitRatioCaches.length ? `page cache hit ratio caching configuration ${f.lowHitRatioCaches.slice(0, 2).join(" ")}` : "",
      f.stuckRequests ? "slow request timeout javascript configuration transformation performance" : "",
      payload.httpCache.withQuery > 0 ? "cache key query parameter passthrough" : "",
      // The frames name the actual code path — the most specific search term available.
      ...payload.hotFrames.slice(0, 2).map((h) => h.frame.split("(")[0].split(".").slice(-2).join(" ")),
    ]
      .filter(Boolean)
      .join(" ");

    let confluenceContext = "";
    try {
      confluenceContext = await searchConfluence(confluenceQuery);
      console.log(
        confluenceContext
          ? `[analyze-status] Confluence context included: ${confluenceContext.length} chars`
          : "[analyze-status] Confluence context empty (no matches or not configured)"
      );
    } catch (err) {
      console.error("[analyze-status] Confluence lookup failed:", err);
    }

    const roleInstruction =
      "You are an expert server reliability engineer reviewing parsed status dumps from TServer, a Java-based website-translation proxy server. Each dump is a point-in-time snapshot of one JVM, taken from the server's own status page; a set of dumps is a time series of such snapshots. You are given deterministically parsed metrics below (not raw dumps) — ground your synopsis strictly in these numbers. " +
      "Four things about this data determine whether your reading is correct. " +
      "First, every cumulative counter (Completed Requests, total GCs, total collection time, LRU evictions, EhCache gets/hits, HTTP cache AccessCount, transform matches) is counted per instance since that instance's own start time. Never compare or subtract them across instances. " +
      "Second, the polled URL is load balanced, so consecutive snapshots routinely come from different backends: a different instance Id is a different JVM, not the same server regressing. A counter that appears to drop between snapshots of different instances is an artifact of that routing, not an incident — do not report it as one. Per-instance figures above are already computed correctly; use them. " +
      "Third, the Properties Hash is a hash of the instance's effective configuration that already excludes host-specific keys (host.server.id, host.name.internal, local.server.id, replication.mode). Identical configurations therefore hash identically. If more than one hash appears across the pool — especially while every instance reports the same properties version — that is genuine configuration drift between backends serving the same site, and it means identical traffic can get different behaviour depending on which backend answers. Treat that as a first-class finding, explain the operational consequence, and recommend how to reconcile it. " +
      "Fourth, the IN-FLIGHT REQUESTS section pairs each unfinished request with the stack its thread was executing. Read the application frames (com.motionpoint.* classes and methods) rather than the generic Tomcat/servlet dispatch frames or JDK frames at the bottom — those application frames name the specific operation the request was spending its time in. When a request has been running a long time, name that method or operation explicitly in the synopsis and let it drive at least one recommendation. The MOST FREQUENT APPLICATION FRAMES list shows which code paths recur across in-flight threads; a frame appearing repeatedly is a systemic hot spot, not a coincidence. " +
      "Also weigh: caches with low hit ratios that still consume heap; EhCache evictions, which mean a cache is sized below its working set; high-cardinality query strings among cached URLs, which fragment the page cache because each distinct query string becomes its own cache key (recommend stripping or normalising those parameters out of the cache key); transformation rules with high max durations, which add a latency tail to the pages they touch; and rules whose condition never matched, which are dead weight. " +
      "When Confluence reference material (Master Properties, Release Notes, Site Down runbooks) is provided, use it to recommend specific configuration changes grounded in that documentation rather than generic advice. " +
      "Be honest about what the data supports: if the snapshots show a healthy server, say so plainly and keep recommendations proportionate rather than inventing an incident.";

    const system = [roleInstruction, confluenceContext].filter(Boolean).join("\n\n---\n\n");

    const prompt = `${summarizeStatusForPrompt(payload, incidentTime ?? "")}

Return ONLY a single valid JSON object — no markdown, no text before or after. Use this exact structure:

{
  "synopsis": "3-5 paragraph narrative of what these snapshots show, referencing the actual stats above",
  "recommendations": [
    { "title": "string", "description": "string", "priority": "immediate", "category": "configuration", "configReference": "optional: a specific Master Properties key or release-note item this recommendation is grounded in" }
  ]
}

Constraints:
- priority must be one of: immediate, short-term, long-term
- category must be one of: memory, database, caching, passthrough, blocking, monitoring, configuration
- recommendations: 5-8 entries, at least one referencing a specific Confluence config item if any Confluence material was provided above
- synopsis: detailed and technical, referencing the specific numbers given above (heap %, GC ms/min, hit ratios, pending request durations and their stack frames, properties hashes) — do not invent numbers not present above, and do not describe cross-instance counter differences as regressions`;

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const anthropicStream = client.messages.stream({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 8000,
            system,
            messages: [{ role: "user", content: prompt }],
          });

          for await (const chunk of anthropicStream) {
            if (
              chunk.type === "content_block_delta" &&
              chunk.delta.type === "text_delta" &&
              chunk.delta.text
            ) {
              controller.enqueue(encoder.encode(chunk.delta.text));
            }
          }
          controller.close();
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Analysis failed";
          controller.enqueue(
            encoder.encode(JSON.stringify({ __error: msg }))
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Analysis failed";
    return errorResponse(msg);
  }
}
