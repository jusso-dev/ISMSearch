// Leaf module: in-memory fixed-window rate limiter (per server process).

type Bucket = {
  count: number;
  resetAt: number;
};

/** Hard cap on tracked buckets; the oldest-inserted buckets are evicted beyond this. */
export const MAX_BUCKETS = 10_000;
/** Expired buckets are swept on access once the map grows past this size. */
export const SWEEP_THRESHOLD = 1_000;

const buckets = new Map<string, Bucket>();
let lastSweepAt = Number.NEGATIVE_INFINITY;

/**
 * Returns the rate-limit key for the requesting client.
 *
 * Next.js route handlers do not expose the TCP peer address, so without a trusted
 * reverse proxy there is no reliable per-client identifier: forwarding headers are
 * fully client-controlled and trusting them would let anyone bypass limits by
 * rotating a fake `X-Forwarded-For`. In that case every request shares the constant
 * key "direct" (i.e. limits are global per route).
 *
 * Set `TRUST_PROXY=true` only when the app is reachable exclusively through a reverse
 * proxy that appends the client address to `X-Forwarded-For`. We then use the LAST
 * (rightmost) entry: that is the one written by our own proxy, whereas entries to its
 * left were supplied by the client (or upstream hops) and can be spoofed.
 */
export function clientIp(request: Request) {
  if (process.env.TRUST_PROXY !== "true") return "direct";

  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const last = forwarded?.at(-1);
  return last || request.headers.get("x-real-ip")?.trim() || "direct";
}

function sweepExpired(now: number) {
  // Sweeping is O(n); do it at most once per second.
  if (now - lastSweepAt < 1_000) return;
  lastSweepAt = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

function evictOldest() {
  while (buckets.size >= MAX_BUCKETS) {
    const oldest = buckets.keys().next();
    if (oldest.done) return;
    buckets.delete(oldest.value);
  }
}

export function checkRateLimit(key: string, limit: number, windowMs: number, now = Date.now()) {
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    if (current) buckets.delete(key); // re-insert so Map order tracks bucket age
    if (buckets.size >= SWEEP_THRESHOLD) sweepExpired(now);
    evictOldest();
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  if (current.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: current.resetAt };
  }

  current.count += 1;
  return { allowed: true, remaining: limit - current.count, resetAt: current.resetAt };
}

/** Number of tracked buckets (for tests / diagnostics). */
export function rateLimitBucketCount() {
  return buckets.size;
}

/** Clears all buckets (for tests). */
export function resetRateLimits() {
  buckets.clear();
  lastSweepAt = Number.NEGATIVE_INFINITY;
}

export function rateLimitResponse(resetAt: number) {
  return Response.json(
    { error: "Too many requests" },
    {
      status: 429,
      headers: {
        "retry-after": String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))),
      },
    },
  );
}
