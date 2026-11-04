import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { enqueueManagedJob, getJobsSnapshot, isManagedQueueKey } from "@/lib/jobs/queues";
import { clientIp, checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { BodyTooLargeError, readBodyBytes } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Auth model: when JOBS_ADMIN_TOKEN is set, enqueueing requires it (Authorization:
 * Bearer, X-Jobs-Admin-Token header, or a `token` form/JSON field). When it is NOT set
 * we still allow enqueueing so the default docker-compose setup works out of the box;
 * the /jobs page shows a prominent warning in that case. Cross-site requests are always
 * rejected and requests are rate limited.
 */
const JOBS_ADMIN_TOKEN = process.env.JOBS_ADMIN_TOKEN || "";

type ErrorCode = "unauthorised" | "unknown-queue" | "unavailable" | "invalid-request" | "rate-limited";

function digest(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

function tokenMatches(candidate: string) {
  if (!JOBS_ADMIN_TOKEN || !candidate) return false;
  return timingSafeEqual(digest(candidate), digest(JOBS_ADMIN_TOKEN));
}

function hasValidOrigin(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") return false;

  const origin = request.headers.get("origin");
  if (origin === null) return true; // non-browser clients
  try {
    const requestUrl = new URL(request.url);
    const originUrl = new URL(origin); // "null" and garbage throw -> rejected
    return originUrl.host === requestUrl.host && originUrl.protocol === requestUrl.protocol;
  } catch {
    return false;
  }
}

function headerToken(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const bearer = /^Bearer\s+/i.test(auth) ? auth.replace(/^Bearer\s+/i, "").trim() : "";
  const header = request.headers.get("x-jobs-admin-token")?.trim() ?? "";
  return bearer || header;
}

const STATUS: Record<ErrorCode, number> = {
  unauthorised: 401,
  "unknown-queue": 400,
  unavailable: 503,
  "invalid-request": 400,
  "rate-limited": 429,
};

const MESSAGE: Record<ErrorCode, string> = {
  unauthorised: "Not authorised to enqueue jobs",
  "unknown-queue": "Unknown job queue",
  unavailable: "Job queue is unavailable",
  "invalid-request": "Invalid request",
  "rate-limited": "Too many requests",
};

/** HTML form posts get a 303 back to /jobs with a status code; API callers get JSON. */
function redirectToJobs(params: Record<string, string>) {
  return new Response(null, {
    status: 303,
    headers: { location: `/jobs?${new URLSearchParams(params).toString()}` },
  });
}

function fail(code: ErrorCode, isForm: boolean, extra?: { status?: number; message?: string }) {
  if (isForm) return redirectToJobs({ error: code });
  return NextResponse.json({ error: extra?.message ?? MESSAGE[code] }, { status: extra?.status ?? STATUS[code] });
}

function isFormContentType(contentType: string) {
  return contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data");
}

async function readBody(request: Request, isForm: boolean): Promise<{ queue: string; token: string } | null> {
  const bytes = await readBodyBytes(request);
  if (isForm) {
    const form = await new Response(bytes as BodyInit, {
      headers: { "content-type": request.headers.get("content-type") ?? "" },
    })
      .formData()
      .catch(() => null);
    if (!form) return null;
    const queue = form.get("queue");
    const token = form.get("token");
    return { queue: typeof queue === "string" ? queue : "", token: typeof token === "string" ? token : "" };
  }

  if (bytes.byteLength === 0) return { queue: "", token: "" };
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const record = json as Record<string, unknown>;
  return {
    queue: typeof record.queue === "string" ? record.queue : "",
    token: typeof record.token === "string" ? record.token : "",
  };
}

export async function GET() {
  try {
    return NextResponse.json({ queues: await getJobsSnapshot() });
  } catch (error) {
    console.error("[api/jobs] unable to read jobs", error);
    return NextResponse.json({ error: "Unable to read jobs" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!hasValidOrigin(request)) {
    return NextResponse.json({ error: "Cross-site job requests are not allowed" }, { status: 403 });
  }

  const isForm = isFormContentType(request.headers.get("content-type") ?? "");

  const rateLimit = checkRateLimit(`jobs:${clientIp(request)}`, 12, 60_000);
  if (!rateLimit.allowed) {
    return isForm ? redirectToJobs({ error: "rate-limited" }) : rateLimitResponse(rateLimit.resetAt);
  }

  // Header credentials are checked before reading the body.
  const fromHeader = headerToken(request);
  let authorised = !JOBS_ADMIN_TOKEN || tokenMatches(fromHeader);
  if (JOBS_ADMIN_TOKEN && fromHeader && !authorised) {
    return fail("unauthorised", isForm);
  }

  let body: { queue: string; token: string } | null;
  try {
    body = await readBody(request, isForm);
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      return fail("invalid-request", isForm, { status: 413, message: "Request body too large" });
    }
    return fail("invalid-request", isForm);
  }
  if (!body) return fail("invalid-request", isForm);

  if (!authorised) authorised = tokenMatches(body.token);
  if (!authorised) return fail("unauthorised", isForm);

  if (!isManagedQueueKey(body.queue)) return fail("unknown-queue", isForm);

  try {
    const job = await enqueueManagedJob(body.queue);
    if (isForm) return redirectToJobs({ queued: body.queue });
    return NextResponse.json({ id: job.id, queue: body.queue });
  } catch (error) {
    console.error(`[api/jobs] unable to enqueue ${body.queue} job`, error);
    return fail("unavailable", isForm);
  }
}
