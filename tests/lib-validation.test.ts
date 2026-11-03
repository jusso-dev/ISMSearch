import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";

const v: typeof import("../src/lib/validation") = await import(
  new URL("../src/lib/validation.ts", import.meta.url).href
);

function jsonRequest(body: BodyInit, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
    duplex: "half",
  } as RequestInit);
}

const Schema = z.object({ name: z.string() });

test("IsmVersion accepts release tags and rejects everything else", () => {
  assert.equal(v.IsmVersion.safeParse("v2026.03.24").success, true);
  assert.equal(v.IsmVersion.safeParse("v2025.12.9").success, true);
  for (const bad of ["2026.03.24", "v2026.3.24", "v2026.03.240", "../etc/passwd", "v2026.03.24/../x", ""]) {
    assert.equal(v.IsmVersion.safeParse(bad).success, false, bad);
  }
});

test("CONTROL_ID_PATTERN matches ISM ids case-insensitively", () => {
  assert.ok(v.CONTROL_ID_PATTERN.test("ISM-1234"));
  assert.ok(v.CONTROL_ID_PATTERN.test("ism-principle-gov-01"));
  assert.ok(!v.CONTROL_ID_PATTERN.test("1234"));
  assert.ok(!v.CONTROL_ID_PATTERN.test("ISM-12 34"));
  assert.ok(!v.CONTROL_ID_PATTERN.test(`ISM-${"1".repeat(41)}`));
});

test("parseJson parses a valid small body", async () => {
  assert.deepEqual(await v.parseJson(jsonRequest(JSON.stringify({ name: "x" })), Schema), { name: "x" });
});

test("parseJson rejects malformed JSON and wrong content type with ZodError (400)", async () => {
  await assert.rejects(v.parseJson(jsonRequest("{nope"), Schema), z.ZodError);
  const wrongType = new Request("http://localhost/", { method: "POST", body: "{}", headers: { "content-type": "text/plain" } });
  await assert.rejects(v.parseJson(wrongType, Schema), z.ZodError);
  try {
    await v.parseJson(jsonRequest("{nope"), Schema);
  } catch (error) {
    assert.equal(v.requestErrorResponse(error).status, 400);
  }
});

test("parseJson rejects bodies over 32 KB based on Content-Length", async () => {
  const big = JSON.stringify({ name: "x".repeat(v.MAX_BODY_BYTES) });
  const request = jsonRequest(big, { "content-length": String(Buffer.byteLength(big)) });
  await assert.rejects(v.parseJson(request, Schema), v.BodyTooLargeError);
});

test("parseJson enforces the cap while streaming when Content-Length is absent or lies", async () => {
  const chunk = new TextEncoder().encode("x".repeat(8 * 1024));
  let pulled = 0;
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulled += 1;
      controller.enqueue(chunk); // endless body
    },
    cancel() {
      cancelled = true;
    },
  });
  let caught: unknown;
  try {
    await v.parseJson(jsonRequest(stream), Schema);
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof v.BodyTooLargeError);
  assert.ok(pulled <= 6, `read ${pulled} chunks`);
  assert.equal(cancelled, true);

  const response = v.requestErrorResponse(caught);
  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), { error: "Request body too large" });

  const lying = jsonRequest(JSON.stringify({ name: "y".repeat(40_000) }), { "content-length": "10" });
  await assert.rejects(v.readBodyBytes(lying), v.BodyTooLargeError);
});

test("cleanEssentialEight and cleanApplicability drop unknown values", () => {
  assert.deepEqual(v.cleanEssentialEight(["ML1", "ML4", "ML1", "ml2", "ML3"]), ["ML1", "ML3"]);
  assert.deepEqual(v.cleanApplicability(["NC", "XX", "TS"]), ["NC", "TS"]);
});
