import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;

function jsonError(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return jsonError("Invalid request body.", 400);

    const { logContent, outageTime, fileName } = body;
    if (!logContent || !outageTime) return jsonError("logContent and outageTime are required.", 400);

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return jsonError("ANTHROPIC_API_KEY is not configured on the server.", 500);

    const client = new Anthropic({ apiKey });

    // Trim log content to keep prompt within a safe token budget (~120k chars ≈ ~30k tokens)
    const trimmedLog = logContent.length > 120000
      ? logContent.slice(0, 120000) + "\n\n[...log truncated for analysis...]"
      : logContent;

    const prompt = `You are an expert server reliability engineer and security analyst. Analyze the following server log data and produce a comprehensive structured JSON report.

OUTAGE TIME PROVIDED BY USER: ${outageTime}
LOG FILE NAME: ${fileName}

LOG DATA:
${trimmedLog}

Return ONLY valid JSON (no markdown fences, no explanation outside the JSON) matching exactly this structure:

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
- timeline: 8-24 entries showing time progression; memoryPressure must escalate toward outage time
- errors: 1-20 most significant distinct types
- bots: 0-15 entries; empty array [] if no suspicious traffic found
- patterns: 3-10 entries
- recommendations: 5-10 entries
- synopsis: technical, multi-paragraph, reference specific patterns from the logs
- All numeric values must be realistic integers derived from actual log content`;

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8000,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = message.content[0]?.type === "text" ? message.content[0].text : "";

    // Strip any accidental markdown code fences
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("Claude raw response:", raw.slice(0, 500));
      return jsonError("Claude returned an unexpected response format. Please try again.");
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return NextResponse.json(parsed);
  } catch (err) {
    console.error("Analysis error:", err);
    const message = err instanceof Error ? err.message : "Analysis failed";
    return jsonError(message);
  }
}
