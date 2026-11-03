// Leaf module: NDJSON event streaming shared by /api/ask and /api/policy.
//
// Event protocol (one JSON object per line):
//   {"type":"meta", ...}           first event, always
//   {"type":"token","token":"..."} zero or more
//   {"type":"error","message":"..."} at most one, when generation fails mid-stream
//   {"type":"done"}                exactly once, always last
//
// The relay never throws inside the stream: upstream failures, Ollama `{"error":...}`
// lines, malformed JSON and timeouts all become an `error` event followed by `done`.

export type NdjsonEvent =
  | ({ type: "meta" } & Record<string, unknown>)
  | { type: "token"; token: string }
  | { type: "error"; message: string }
  | { type: "done" };

export const NDJSON_HEADERS = {
  "content-type": "application/x-ndjson; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
} as const;

export function encodeEvent(value: NdjsonEvent | Record<string, unknown>) {
  return `${JSON.stringify(value)}\n`;
}

/** Stream with a meta event, a single token containing `text`, then done. */
export function textFallbackResponse(meta: Record<string, unknown>, text: string) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(encodeEvent({ ...meta, type: "meta" })));
      controller.enqueue(encoder.encode(encodeEvent({ type: "token", token: text })));
      controller.enqueue(encoder.encode(encodeEvent({ type: "done" })));
      controller.close();
    },
  });
  return new Response(body, { headers: NDJSON_HEADERS });
}

export type RelayOptions = {
  /** Max wait for the first upstream chunk (ms). Default 120 s. */
  firstChunkTimeoutMs?: number;
  /** Max wait between subsequent upstream chunks (ms). Default 60 s. */
  idleTimeoutMs?: number;
  /** Called once when the relay finishes for any reason (done, error, cancel). */
  onClose?: () => void;
};

class RelayTimeoutError extends Error {
  constructor() {
    super("timeout");
    this.name = "RelayTimeoutError";
  }
}

const MAX_UPSTREAM_ERROR_LENGTH = 200;

/**
 * Converts an Ollama `/api/generate` streaming body (NDJSON of
 * `{response, done}` / `{error}` objects) into our NDJSON event protocol.
 * Cancelling the returned stream (client disconnect) cancels the upstream reader,
 * which aborts the underlying fetch.
 */
export function relayOllamaStream(
  upstream: ReadableStream<Uint8Array>,
  meta: Record<string, unknown>,
  options: RelayOptions = {},
): ReadableStream<Uint8Array> {
  const firstChunkTimeoutMs = options.firstChunkTimeoutMs ?? 120_000;
  const idleTimeoutMs = options.idleTimeoutMs ?? 60_000;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = upstream.getReader();
  let buffer = "";
  let receivedChunk = false;
  let finished = false;
  let closeNotified = false;

  const notifyClose = () => {
    if (closeNotified) return;
    closeNotified = true;
    try {
      options.onClose?.();
    } catch {
      // ignore
    }
  };

  const stopUpstream = () => {
    reader.cancel().catch(() => undefined);
  };

  const send = (controller: ReadableStreamDefaultController<Uint8Array>, event: NdjsonEvent) => {
    if (finished) return;
    try {
      controller.enqueue(encoder.encode(encodeEvent(event)));
    } catch {
      finished = true; // consumer went away
    }
  };

  const finish = (controller: ReadableStreamDefaultController<Uint8Array>, errorMessage?: string) => {
    if (finished) return;
    if (errorMessage) send(controller, { type: "error", message: errorMessage });
    send(controller, { type: "done" });
    finished = true;
    try {
      controller.close();
    } catch {
      // already closed / cancelled
    }
    notifyClose();
  };

  /** Handles one complete upstream line. Returns true when the stream has finished. */
  const handleLine = (controller: ReadableStreamDefaultController<Uint8Array>, line: string) => {
    if (!line.trim()) return false;
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch {
      finish(controller, "The language model returned malformed data.");
      stopUpstream();
      return true;
    }
    if (!json || typeof json !== "object") {
      finish(controller, "The language model returned malformed data.");
      stopUpstream();
      return true;
    }
    const record = json as { response?: unknown; done?: unknown; error?: unknown };
    if (record.error !== undefined && record.error !== null) {
      const detail = typeof record.error === "string" ? record.error.slice(0, MAX_UPSTREAM_ERROR_LENGTH) : "unknown error";
      finish(controller, `The language model reported an error: ${detail}`);
      stopUpstream();
      return true;
    }
    if (typeof record.response === "string" && record.response) {
      send(controller, { type: "token", token: record.response });
    }
    if (record.done === true) {
      finish(controller);
      stopUpstream();
      return true;
    }
    return false;
  };

  const readWithTimeout = (timeoutMs: number) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new RelayTimeoutError()), timeoutMs);
    });
    return Promise.race([reader.read(), timeout]).finally(() => clearTimeout(timer));
  };

  return new ReadableStream<Uint8Array>({
    start(controller) {
      send(controller, { ...meta, type: "meta" });
    },
    async pull(controller) {
      try {
        while (!finished) {
          const { value, done } = await readWithTimeout(receivedChunk ? idleTimeoutMs : firstChunkTimeoutMs);
          if (finished) return;
          if (done) {
            buffer += decoder.decode();
            if (buffer.trim() && handleLine(controller, buffer)) return;
            buffer = "";
            finish(controller, "The language model stream ended unexpectedly.");
            return;
          }
          receivedChunk = true;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          let emitted = false;
          for (const line of lines) {
            if (handleLine(controller, line)) return;
            if (line.trim()) emitted = true;
          }
          if (emitted) return; // let the consumer drain before reading more
        }
      } catch (error) {
        if (finished) return;
        finish(
          controller,
          error instanceof RelayTimeoutError
            ? "The language model stopped responding (timed out)."
            : "The language model stream was interrupted.",
        );
        stopUpstream();
      }
    },
    cancel(reason) {
      finished = true;
      notifyClose();
      return reader.cancel(reason).catch(() => undefined);
    },
  });
}

export function ollamaNdjsonResponse(
  upstream: ReadableStream<Uint8Array>,
  meta: Record<string, unknown>,
  options?: RelayOptions,
) {
  return new Response(relayOllamaStream(upstream, meta, options), { headers: NDJSON_HEADERS });
}
