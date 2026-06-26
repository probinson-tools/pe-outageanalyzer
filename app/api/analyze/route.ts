import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return new Response(JSON.stringify({ error: "Invalid request body." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { logContent, outageTime, fileName } = body;
    if (!logContent || !outageTime) {
      return new Response(JSON.stringify({ error: "logContent and outageTime are required." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY is not configured on the server." }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const client = new Anthropic({ apiKey });

    const trimmedLog = logContent.length > 100000
      ? logContent.slice(0, 100000) + "\n\n[...log truncated for analysis...]"
      : logContent;

    const prompt = `You are an expert server reliability engineer and security analyst. Analyze the following server log data and produce a comprehensive structured JSON report.

OUTAGE TIME PROVIDED BY USER: ${outageTime}
LOG FILE NAME: ${fileName}

LOG DATA:
${trimmedLog}

Return ONLY valid JSON (no markdown fences, no text outside the JSON object) matching exactly this structure:

{
  "summary": {
    "totalErrors": <integer>,
    "totalWarnings": <integer>,
    "criticalEvents": <integer>,
    "timespan": "<earliest timestamp> to <latest timestamp>",
    "outageTime": "${outageTime}",
    "fileName": "${fileName}",
    "topErrorType": "<most frequent error type>",
    "estimatedCause": "<one sentence root cause>"
  },
  "errors": [
    {
      "type": "<error class/type>",
      "count": <integer>,
      "severity": "critical|high|medium|low",
      "firstSeen": "<timestamp or unknown>",
      "lastSeen": "<timestamp or unknown>",
      "sample": "<representative log line, max 200 chars>"
    }
  ],
  "bots": [
    {
      "ip": "<IP or unknown>",
      "requests": <integer>,
      "userAgent": "<UA string or unknown>",
      "classification": "scanner|crawler|ddos|brute-force|suspicious|normal",
      "threat": "high|medium|low"
    }
  ],
  "timeline": [
    {
      "time": "<HH:MM label>",
      "errors": <integer>,
      "warnings": <integer>,
      "requests": <integer>,
      "memoryPressure": <0-100 integer>
    }
  ],
  "patterns": [
    {
      "name": "<pattern name>",
      "description": "<what this pattern indicates>",
      "occurrences": <integer>,
      "impact": "critical|high|medium|low"
    }
  ],
  "synopsis": "<3-5 paragraph detailed narrative of what happened, focusing on memory exhaustion cause, event sequence, and contributing factors>",
  "recommendations": [
    {
      "title": "<action title>",
      "description": "<detailed description of the fix>",
      "priority": "immediate|short-term|long-term",
      "category": "memory|security|performance|monitoring|configuration"
    }
  ],
  "severityDistribution": [
    { "name": "Critical", "value": <integer>, "color": "#ef4444" },
    { "name": "High",     "value": <integer>, "color": "#f97316" },
    { "name": "Medium",   "value": <integer>, "color": "#eab308" },
    { "name": "Low",      "value": <integer>, "color": "#22c55e" }
  ],
  "categoryBreakdown": [
    { "name": "<category>", "count": <integer> }
  ]
}

Rules:
- timeline: 8-24 entries; memoryPressure must escalate toward the outage time
- errors: 1-20 most significant distinct types
- bots: 0-15 entries; empty array [] if no suspicious traffic found
- patterns: 3-10 entries
- recommendations: 5-10 entries
- synopsis: technical, multi-paragraph, reference specific patterns found in the logs
- All numeric values must be realistic integers derived from actual log content`;

    // Stream the response so the connection stays alive past Vercel's idle timeout
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const anthropicStream = client.messages.stream({
            model: "claude-sonnet-4-6",
            max_tokens: 8000,
            messages: [{ role: "user", content: prompt }],
          });

          for await (const chunk of anthropicStream) {
            if (
              chunk.type === "content_block_delta" &&
              chunk.delta.type === "text_delta"
            ) {
              controller.enqueue(encoder.encode(chunk.delta.text));
            }
          }
          controller.close();
        } catch (err) {
          const message = err instanceof Error ? err.message : "Analysis failed";
          // Send a JSON error object so the client can detect it
          controller.enqueue(encoder.encode(`{"__error":"${message.replace(/"/g, "'")}"}`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analysis failed";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
