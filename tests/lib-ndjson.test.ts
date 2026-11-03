import assert from "node:assert/strict";
import { test } from "node:test";

const nd: typeof import("../src/lib/ndjson") = await import(new URL("../src/lib/ndjson.ts", import.meta.url).href);

const encoder = new TextEncoder();

function upstreamFrom(chunks: (string | Error)[], onCancel?: () => void) {
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index >= chunks.length) {
        controller.close();
        return;
      }
      const next = chunks[index++];
      if (next instanceof Error) controller.error(next);
      else controller.enqueue(encoder.encode(next));
    },
    cancel() {
      onCancel?.();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>) {
  const text = await new Response(stream).text();
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { type: string; token?: string; message?: string });
}

const meta = { type: "meta", model: "test" };

test("relays tokens and emits done exactly once", async () => {
  let closed = 0;
  const events = await collect(
    nd.relayOllamaStream(
      upstreamFrom(['{"response":"Hel', 'lo"}\n{"response":" world"}\n', '{"response":"","done":true}\n']),
      meta,
      { onClose: () => (closed += 1) },
    ),
  );
  assert.deepEqual(events, [
    { type: "meta", model: "test" },
    { type: "token", token: "Hello" },
    { type: "token", token: " world" },
    { type: "done" },
  ]);
  assert.equal(closed, 1);
});

test("Ollama error lines become an error event followed by a single done", async () => {
  let cancelled = false;
  const events = await collect(
    nd.relayOllamaStream(
      upstreamFrom(['{"response":"a"}\n{"error":"model not found"}\n', '{"response":"never"}\n'], () => (cancelled = true)),
      meta,
    ),
  );
  assert.deepEqual(
    events.map((event) => event.type),
    ["meta", "token", "error", "done"],
  );
  assert.match(events[2].message ?? "", /model not found/);
  assert.equal(cancelled, true);
});

test("malformed JSON from upstream becomes an error event, never a thrown stream", async () => {
  const events = await collect(nd.relayOllamaStream(upstreamFrom(['{"response":"a"}\n{not json\n']), meta));
  assert.deepEqual(
    events.map((event) => event.type),
    ["meta", "token", "error", "done"],
  );
});

test("upstream failure mid-stream becomes an error event", async () => {
  const events = await collect(
    nd.relayOllamaStream(upstreamFrom(['{"response":"a"}\n', new Error("socket hang up")]), meta),
  );
  assert.deepEqual(
    events.map((event) => event.type),
    ["meta", "token", "error", "done"],
  );
  assert.doesNotMatch(events[2].message ?? "", /socket/);
});

test("upstream EOF without done:true reports an error then done", async () => {
  const events = await collect(nd.relayOllamaStream(upstreamFrom(['{"response":"a"}']), meta));
  assert.deepEqual(
    events.map((event) => event.type),
    ["meta", "token", "error", "done"],
  );
});

test("idle timeout ends the stream with an error and cancels upstream", async () => {
  let cancelled = false;
  const stalled = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('{"response":"a"}\n'));
      // never sends anything else
    },
    cancel() {
      cancelled = true;
    },
  });
  const events = await collect(nd.relayOllamaStream(stalled, meta, { firstChunkTimeoutMs: 1000, idleTimeoutMs: 30 }));
  assert.deepEqual(
    events.map((event) => event.type),
    ["meta", "token", "error", "done"],
  );
  assert.match(events[2].message ?? "", /timed out/);
  assert.equal(cancelled, true);
});

test("cancelling the response stream cancels the upstream reader", async () => {
  let cancelled = false;
  let closed = 0;
  const endless = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(encoder.encode('{"response":"x"}\n'));
    },
    cancel() {
      cancelled = true;
    },
  });
  const stream = nd.relayOllamaStream(endless, meta, { onClose: () => (closed += 1) });
  const reader = stream.getReader();
  await reader.read(); // meta
  await reader.read(); // token
  await reader.cancel("client disconnected");
  assert.equal(cancelled, true);
  assert.equal(closed, 1);
});

test("textFallbackResponse emits meta, one token, done", async () => {
  const response = nd.textFallbackResponse({ type: "meta", degraded: true }, "fallback text");
  assert.match(response.headers.get("content-type") ?? "", /application\/x-ndjson/);
  const events = await collect(response.body!);
  assert.deepEqual(events, [
    { type: "meta", degraded: true },
    { type: "token", token: "fallback text" },
    { type: "done" },
  ]);
});
