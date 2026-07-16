import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { searchConfluence } from "@/lib/confluence";
import type { ParsedLogSummary } from "@/lib/types";

export const runtime = "edge";
export const maxDuration = 60;

function errorResponse(message: string, status = 500) {
  return new Response(JSON.stringify({ __error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function summarizeForPrompt(s: ParsedLogSummary, outageTime: string): string {
  const lines: string[] = [];
  lines.push(`File: ${s.fileName} (${s.lineCount.toLocaleString()} lines)`);
  if (s.timespan) lines.push(`Log timespan: ${s.timespan.start} to ${s.timespan.end}`);
  if (outageTime) lines.push(`Reported outage time: ${outageTime}`);

  lines.push("");
  lines.push("DB POOL:");
  lines.push(
    `- Server: ${s.dbPoolServerName ?? "none detected"}, peak size ${s.flags.peakDbPoolSize}, leak suspected: ${s.flags.dbPoolLeakSuspected}`
  );

  lines.push("");
  lines.push("MEMORY:");
  lines.push(
    `- Minimum observed free memory: ${s.flags.minFreeMemoryPct !== null ? s.flags.minFreeMemoryPct.toFixed(1) + "%" : "no samples"}`
  );

  lines.push("");
  lines.push("CONCURRENCY:");
  lines.push(`- Peak concurrent threads (per bucket): ${s.flags.peakThreadCount}`);

  lines.push("");
  lines.push(`TOP ERRORS/EXCEPTIONS (${s.flags.totalExceptions} total occurrences, OOM detected: ${s.flags.oomDetected}):`);
  for (const e of s.topErrors.slice(0, 10)) {
    lines.push(`- ${e.type}: ${e.count}x (first ${e.firstSeen}, last ${e.lastSeen}) — sample: ${e.sample.slice(0, 200)}`);
  }

  lines.push("");
  lines.push("TOP TRAFFIC SOURCES BY IP (from failed/rejected requests):");
  for (const ip of s.topIps.slice(0, 10)) lines.push(`- ${ip.ip}: ${ip.count}x`);

  lines.push("");
  lines.push("TOP TRAFFIC SOURCES BY USER-AGENT (from failed/rejected requests):");
  for (const ua of s.topUserAgents.slice(0, 10)) lines.push(`- ${ua.userAgent}: ${ua.count}x`);

  lines.push("");
  lines.push("TOP URL PATTERNS (from failed/rejected requests):");
  for (const u of s.topUrlPatterns.slice(0, 15)) lines.push(`- ${u.pattern}: ${u.count}x`);

  return lines.join("\n");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return errorResponse("Invalid request body.", 400);

    const { parsedSummary, outageTime } = body as {
      parsedSummary: ParsedLogSummary;
      outageTime?: string;
    };

    if (!parsedSummary) {
      return errorResponse("parsedSummary is required.", 400);
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return errorResponse("ANTHROPIC_API_KEY is not configured.", 500);

    const client = new Anthropic({ apiKey });

    const confluenceQuery = [
      ...parsedSummary.topErrors.slice(0, 5).map((e) => e.type),
      parsedSummary.flags.dbPoolLeakSuspected ? "database connection pool leak" : "",
      parsedSummary.flags.oomDetected ? "out of memory heap" : "",
    ]
      .filter(Boolean)
      .join(" ");

    let confluenceContext = "";
    try {
      confluenceContext = await searchConfluence(confluenceQuery);
      console.log(
        confluenceContext
          ? `[analyze] Confluence context included: ${confluenceContext.length} chars`
          : "[analyze] Confluence context empty (no matches or not configured)"
      );
    } catch (err) {
      console.error("[analyze] Confluence lookup failed:", err);
    }

    const roleInstruction =
      "You are an expert server reliability engineer reviewing parsed diagnostic data from TServer, a Java-based website-translation proxy server. You are given real, deterministically parsed metrics and counts below (not raw logs) — ground your root-cause synopsis strictly in these numbers. When Confluence reference material (Master Properties, Release Notes, Site Down runbooks) is provided, use it to recommend specific configuration changes — e.g. passthrough rules, caching settings, request blocking — grounded in that documentation rather than generic advice.";
    const system = [roleInstruction, confluenceContext].filter(Boolean).join("\n\n---\n\n");

    const prompt = `${summarizeForPrompt(parsedSummary, outageTime ?? "")}

Return ONLY a single valid JSON object — no markdown, no text before or after. Use this exact structure:

{
  "synopsis": "3-5 paragraph root-cause narrative referencing the actual stats above",
  "recommendations": [
    { "title": "string", "description": "string", "priority": "immediate", "category": "memory", "configReference": "optional: a specific Master Properties key or release-note item this recommendation is grounded in" }
  ]
}

Constraints:
- priority must be one of: immediate, short-term, long-term
- category must be one of: memory, database, caching, passthrough, blocking, monitoring, configuration
- recommendations: 5-8 entries, at least one referencing a specific Confluence config item if any Confluence material was provided above
- synopsis: detailed, technical, referencing the specific numbers given above (peak DB pool size, memory %, top errors, etc.) — do not invent numbers not present above`;

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
