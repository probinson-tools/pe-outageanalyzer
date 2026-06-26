import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const { logContent, outageTime, fileName } = await req.json();

  if (!logContent || !outageTime) {
    return NextResponse.json({ error: "logContent and outageTime are required." }, { status: 400 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured." }, { status: 500 });
  }

  const prompt = `You are an expert server reliability engineer and security analyst. Analyze the following server log data and produce a comprehensive structured JSON report.

OUTAGE TIME PROVIDED BY USER: ${outageTime}
LOG FILE NAME: ${fileName}

LOG DATA:
${logContent}

Return ONLY valid JSON (no markdown, no explanation outside the JSON) matching exactly this structure:

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
      "firstSeen": "<timestamp or 'unknown'>",
      "lastSeen": "<timestamp or 'unknown'>",
      "sample": "<representative log line, max 200 chars>"
    }
  ],
  "bots": [
    {
      "ip": "<IP or 'unknown'>",
      "requests": <integer>,
      "userAgent": "<UA string or 'unknown'>",
      "classification": "<scanner|crawler|ddos|brute-force|normal|suspicious>",
      "threat": "high|medium|low"
    }
  ],
  "timeline": [
    {
      "time": "<HH:MM label>",
      "errors": <integer>,
      "warnings": <integer>,
      "requests": <integer>,
      "memoryPressure": <0-100 integer representing estimated memory pressure at that time>
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
    { "name": "High", "value": <integer>, "color": "#f97316" },
    { "name": "Medium", "value": <integer>, "color": "#eab308" },
    { "name": "Low", "value": <integer>, "color": "#22c55e" }
  ],
  "categoryBreakdown": [
    { "name": "<category>", "count": <integer> }
  ]
}

Rules:
- timeline must have 8-24 entries representing time progression through the logs
- errors must have at least 1 entry, up to 20 most significant
- bots must have 0-15 entries (only include if suspicious traffic is detected)
- patterns must have 3-10 entries
- recommendations must have 5-10 entries
- synopsis must be detailed, technical, and reference specific patterns found in the logs
- If logs show no clear bots, return empty bots array []
- memoryPressure values must tell a story — they should escalate toward the outage time
- All counts must be realistic integers based on actual log analysis`;

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = message.content[0].type === "text" ? message.content[0].text : "";

    // Extract JSON from the response (handle any accidental markdown wrapping)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Claude returned an unexpected response format." }, { status: 500 });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return NextResponse.json(parsed);
  } catch (err) {
    console.error("Analysis error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Analysis failed" },
      { status: 500 }
    );
  }
}
