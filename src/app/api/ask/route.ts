import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { searchControls } from "@/lib/meili";
import { buildAskPrompt, createOllamaStream } from "@/lib/ollama";
import { clientIp, checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { ApplicabilityCode, IsmVersion, parseJson, validationError } from "@/lib/validation";

const AskBody = z.object({
  question: z.string().min(3).max(500),
  version: IsmVersion.optional(),
  applicability: z.array(ApplicabilityCode).max(5).optional(),
});

export async function POST(request: NextRequest) {
  const rateLimit = checkRateLimit(`ask:${clientIp(request)}`, 20, 60_000);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.resetAt);

  let parsed: z.infer<typeof AskBody>;
  try {
    parsed = await parseJson(request, AskBody);
  } catch (error) {
    return NextResponse.json(validationError(error), { status: 400 });
  }

  const retrieval = await searchControls({
    query: parsed.question,
    version: parsed.version,
    applicability: parsed.applicability,
    limit: 8,
  });

  try {
    const ollama = await createOllamaStream(buildAskPrompt(parsed.question, retrieval.hits), 0.2);
    return streamOllamaResponse(ollama.body, {
      type: "meta",
      question: parsed.question,
      model: ollama.model,
      retrieval,
      degraded: false,
    });
  } catch {
    const fallback =
      "Ollama is not available yet. These are the strongest local retrieval matches; start the Ollama container and pull the configured model to enable generated answers.";
    return streamTextFallback({
      type: "meta",
      question: parsed.question,
      model: null,
      retrieval,
      degraded: true,
    }, fallback);
  }
}

function encodeEvent(value: unknown) {
  return `${JSON.stringify(value)}\n`;
}

function streamTextFallback(meta: Record<string, unknown>, text: string) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(encodeEvent(meta)));
        controller.enqueue(encoder.encode(encodeEvent({ type: "token", token: text })));
        controller.enqueue(encoder.encode(encodeEvent({ type: "done" })));
        controller.close();
      },
    }),
    { headers: { "content-type": "application/x-ndjson" } },
  );
}

function streamOllamaResponse(body: ReadableStream<Uint8Array>, meta: Record<string, unknown>) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  return new Response(
    new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode(encodeEvent(meta)));
        const reader = body.getReader();
        let buffer = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const json = JSON.parse(line) as { response?: string; done?: boolean };
            if (json.response) controller.enqueue(encoder.encode(encodeEvent({ type: "token", token: json.response })));
            if (json.done) controller.enqueue(encoder.encode(encodeEvent({ type: "done" })));
          }
        }
        controller.enqueue(encoder.encode(encodeEvent({ type: "done" })));
        controller.close();
      },
    }),
    { headers: { "content-type": "application/x-ndjson" } },
  );
}
