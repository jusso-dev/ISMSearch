import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

const rl: typeof import("../src/lib/rate-limit") = await import(
  new URL("../src/lib/rate-limit.ts", import.meta.url).href
);

const originalTrustProxy = process.env.TRUST_PROXY;

afterEach(() => {
  if (originalTrustProxy === undefined) delete process.env.TRUST_PROXY;
  else process.env.TRUST_PROXY = originalTrustProxy;
  rl.resetRateLimits();
});

function requestWith(headers: Record<string, string>) {
  return new Request("http://localhost/api/test", { headers });
}

test("clientIp ignores forwarding headers unless TRUST_PROXY=true", () => {
  delete process.env.TRUST_PROXY;
  assert.equal(rl.clientIp(requestWith({ "x-forwarded-for": "1.2.3.4", "x-real-ip": "5.6.7.8" })), "direct");
  process.env.TRUST_PROXY = "1";
  assert.equal(rl.clientIp(requestWith({ "x-forwarded-for": "1.2.3.4" })), "direct");
});

test("clientIp uses the rightmost X-Forwarded-For entry when TRUST_PROXY=true", () => {
  process.env.TRUST_PROXY = "true";
  assert.equal(rl.clientIp(requestWith({ "x-forwarded-for": "6.6.6.6, 10.0.0.1, 203.0.113.9" })), "203.0.113.9");
  assert.equal(rl.clientIp(requestWith({ "x-forwarded-for": " 198.51.100.7 " })), "198.51.100.7");
  assert.equal(rl.clientIp(requestWith({ "x-real-ip": "192.0.2.1" })), "192.0.2.1");
  assert.equal(rl.clientIp(requestWith({})), "direct");
});

test("checkRateLimit allows up to the limit then blocks until the window resets", () => {
  const now = 1_000_000;
  assert.equal(rl.checkRateLimit("k", 2, 1000, now).allowed, true);
  const second = rl.checkRateLimit("k", 2, 1000, now + 1);
  assert.equal(second.allowed, true);
  assert.equal(second.remaining, 0);
  const third = rl.checkRateLimit("k", 2, 1000, now + 2);
  assert.equal(third.allowed, false);
  assert.equal(third.resetAt, now + 1000);
  assert.equal(rl.checkRateLimit("k", 2, 1000, now + 1000).allowed, true);
});

test("expired buckets are swept once the map grows past the threshold", () => {
  const now = 5_000_000;
  for (let index = 0; index < rl.SWEEP_THRESHOLD + 50; index += 1) {
    rl.checkRateLimit(`short:${index}`, 5, 10, now);
  }
  assert.ok(rl.rateLimitBucketCount() >= rl.SWEEP_THRESHOLD);
  rl.checkRateLimit("fresh", 5, 10_000, now + 5_000);
  assert.equal(rl.rateLimitBucketCount(), 1);
});

test("bucket map is capped by evicting the oldest entries", () => {
  const now = 9_000_000;
  for (let index = 0; index < rl.MAX_BUCKETS + 25; index += 1) {
    // Long windows so nothing is expired; only the cap applies.
    rl.checkRateLimit(`long:${index}`, 5, 3_600_000, now);
  }
  assert.equal(rl.rateLimitBucketCount(), rl.MAX_BUCKETS);
  // The oldest key was evicted, so it starts a fresh window (full allowance).
  assert.equal(rl.checkRateLimit("long:0", 1, 3_600_000, now).allowed, true);
  // A recent key is still tracked.
  rl.checkRateLimit(`long:${rl.MAX_BUCKETS + 24}`, 1, 3_600_000, now);
  assert.equal(rl.checkRateLimit(`long:${rl.MAX_BUCKETS + 24}`, 1, 3_600_000, now).allowed, false);
});
