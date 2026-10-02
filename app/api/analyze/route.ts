import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { searchConfluence } from "@/lib/confluence";
import { LOG_ANALYST_GUIDANCE, logConfluenceTerms, summarizeForPrompt } from "@/lib/logPrompt";
import type { ParsedLogSummary } from "@/lib/types";

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

    const confluenceQuery = logConfluenceTerms(parsedSummary).join(" ");

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

    const roleInstruction = LOG_ANALYST_GUIDANCE;
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
- synopsis: detailed, technical, referencing the specific numbers given above (peak database/connection pool sizes, memory %, top errors, etc.) — do not invent numbers not present above`;

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
