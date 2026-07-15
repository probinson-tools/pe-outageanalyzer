import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { searchConfluence } from "@/lib/confluence";

export const runtime = "edge";
export const maxDuration = 60;

function errorResponse(message: string, status = 500) {
  return new Response(JSON.stringify({ __error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return errorResponse("Invalid request body.", 400);

    const { logContent, outageTime, fileName } = body as {
      logContent: string;
      outageTime: string;
      fileName: string;
    };

    if (!logContent || !outageTime) {
      return errorResponse("logContent and outageTime are required.", 400);
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return errorResponse("ANTHROPIC_API_KEY is not configured.", 500);

    const client = new Anthropic({ apiKey });

    // Keep log content tight to ensure fast, complete responses
    const trimmedLog =
      logContent.length > 80000
        ? logContent.slice(0, 80000) + "\n\n[...log truncated...]"
        : logContent;

    let confluenceContext = "";
    try {
      confluenceContext = await searchConfluence(trimmedLog);
      console.log(
        confluenceContext
          ? `[analyze] Confluence context included: ${confluenceContext.length} chars`
          : "[analyze] Confluence context empty (no matches or not configured)"
      );
    } catch (err) {
      console.error("[analyze] Confluence lookup failed:", err);
    }

    const roleInstruction =
      "You are an expert server reliability engineer and security analyst. Analyze the following server log data and produce a comprehensive structured JSON report. When Confluence reference material about the Translation Server (TServer) is provided below, ground your root-cause analysis and recommendations in that documented configuration/runbook knowledge rather than speculating generically.";
    const system = [roleInstruction, confluenceContext].filter(Boolean).join("\n\n---\n\n");

    const prompt = `OUTAGE TIME: ${outageTime}
FILE: ${fileName}

LOG DATA:
${trimmedLog}

Return ONLY a single valid JSON object — no markdown, no text before or after. Use this exact structure:

{
  "summary": {
    "totalErrors": 0,
    "totalWarnings": 0,
    "criticalEvents": 0,
    "timespan": "start to end",
    "outageTime": "${outageTime}",
    "fileName": "${fileName}",
    "topErrorType": "string",
    "estimatedCause": "one sentence"
  },
  "errors": [
    { "type": "string", "count": 0, "severity": "critical", "firstSeen": "string", "lastSeen": "string", "sample": "string" }
  ],
  "bots": [
    { "ip": "string", "requests": 0, "userAgent": "string", "classification": "scanner", "threat": "high" }
  ],
  "timeline": [
    { "time": "HH:MM", "errors": 0, "warnings": 0, "requests": 0, "memoryPressure": 0 }
  ],
  "patterns": [
    { "name": "string", "description": "string", "occurrences": 0, "impact": "critical" }
  ],
  "synopsis": "3-5 paragraph narrative of root cause and event sequence",
  "recommendations": [
    { "title": "string", "description": "string", "priority": "immediate", "category": "memory" }
  ],
  "severityDistribution": [
    { "name": "Critical", "value": 0, "color": "#ef4444" },
    { "name": "High",     "value": 0, "color": "#f97316" },
    { "name": "Medium",   "value": 0, "color": "#eab308" },
    { "name": "Low",      "value": 0, "color": "#22c55e" }
  ],
  "categoryBreakdown": [
    { "name": "string", "count": 0 }
  ]
}

Constraints:
- timeline: 8-16 entries with memoryPressure escalating toward the outage time
- errors: 1-15 most significant types
- bots: 0-10 entries; [] if none found
- patterns: 3-8 entries
- recommendations: 5-8 entries
- synopsis: detailed, technical, referencing specific patterns in these logs
- All numbers must be real integers derived from the log content`;

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
