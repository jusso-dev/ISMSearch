import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasRelease } from "@/lib/ism/repository";
import { keywordQuery, searchControls } from "@/lib/meili";
import { ollamaNdjsonResponse, textFallbackResponse } from "@/lib/ndjson";
import { buildAskPrompt, createOllamaStream } from "@/lib/ollama";
import { clientIp, checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import {
  ApplicabilityCode,
  ChapterFilter,
  EssentialEightLevel,
  IsmVersion,
  parseJson,
  requestErrorResponse,
} from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AskBody = z.object({
  question: z.string().min(3).max(500),
  version: IsmVersion.optional(),
  applicability: z.array(ApplicabilityCode).max(5).optional(),
  chapter: ChapterFilter.nullish(),
  essentialEight: z.array(EssentialEightLevel).max(3).nullish(),
});

/**
 * Streams NDJSON events: meta, token*, optional error, done (exactly once).
 * Validation / rate-limit failures are plain JSON with 400/404/413/429.
 */
export async function POST(request: NextRequest) {
  const rateLimit = checkRateLimit(`ask:${clientIp(request)}`, 20, 60_000);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.resetAt);

  let parsed: z.infer<typeof AskBody>;
  try {
    parsed = await parseJson(request, AskBody);
  } catch (error) {
    return requestErrorResponse(error);
  }

  if (parsed.version && !(await hasRelease(parsed.version))) {
    return NextResponse.json({ error: "Unknown ISM version" }, { status: 404 });
  }

  let retrieval;
  try {
    retrieval = await searchControls({
      query: keywordQuery(parsed.question),
      version: parsed.version,
      applicability: parsed.applicability,
      chapter: parsed.chapter ?? null,
      essentialEight: parsed.essentialEight ?? null,
      limit: 8,
    });
  } catch (error) {
    console.error("[api/ask] retrieval failed", error);
    return NextResponse.json({ error: "Retrieval failed" }, { status: 500 });
  }

  try {
    const ollama = await createOllamaStream(buildAskPrompt(parsed.question, retrieval.hits), 0.2, request.signal);
    return ollamaNdjsonResponse(
      ollama.body,
      {
        type: "meta",
        question: parsed.question,
        model: ollama.model,
        retrieval,
        degraded: false,
      },
      { firstChunkTimeoutMs: ollama.firstChunkTimeoutMs, idleTimeoutMs: ollama.idleTimeoutMs },
    );
  } catch {
    const fallback =
      "Ollama is not available yet. These are the strongest local retrieval matches; start the Ollama container and pull the configured model to enable generated answers.";
    return textFallbackResponse(
      {
        type: "meta",
        question: parsed.question,
        model: null,
        retrieval,
        degraded: true,
      },
      fallback,
    );
  }
}
