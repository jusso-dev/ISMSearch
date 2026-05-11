import { NextResponse } from "next/server";
import { enqueueManagedJob, getJobsSnapshot, isManagedQueueKey } from "@/lib/jobs/queues";
import { clientIp, checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JOBS_ADMIN_TOKEN = process.env.JOBS_ADMIN_TOKEN;

function hasValidOrigin(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") return false;

  const origin = request.headers.get("origin");
  if (!origin) return true;

  const requestUrl = new URL(request.url);
  const originUrl = new URL(origin);
  return originUrl.host === requestUrl.host && originUrl.protocol === requestUrl.protocol;
}

function hasAdminToken(request: Request, tokenFromBody: string) {
  if (!JOBS_ADMIN_TOKEN) return true;
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  const header = request.headers.get("x-jobs-admin-token") ?? "";
  return [bearer, header, tokenFromBody].some((token) => token && token === JOBS_ADMIN_TOKEN);
}

export async function GET() {
  try {
    return NextResponse.json({ queues: await getJobsSnapshot() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to read jobs" },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  if (!hasValidOrigin(request)) {
    return NextResponse.json({ error: "Cross-site job requests are not allowed" }, { status: 403 });
  }

  const rateLimit = checkRateLimit(`jobs:${clientIp(request)}`, 12, 60_000);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.resetAt);

  const contentType = request.headers.get("content-type") ?? "";
  const isForm = contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data");
  const body = isForm ? await request.formData() : await request.json().catch(() => ({}));
  const queueKey = String(isForm ? body.get("queue") ?? "" : body.queue ?? "");
  const token = String(isForm ? body.get("token") ?? "" : body.token ?? "");

  if (!hasAdminToken(request, token)) {
    return NextResponse.json({ error: "Not authorised to enqueue jobs" }, { status: 401 });
  }

  if (!isManagedQueueKey(queueKey)) {
    return NextResponse.json({ error: "Unknown job queue" }, { status: 400 });
  }

  try {
    const job = await enqueueManagedJob(queueKey);
    if (isForm) {
      return NextResponse.redirect(new URL("/jobs", request.url), { status: 303 });
    }
    return NextResponse.json({ id: job.id, queue: queueKey });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to enqueue job" },
      { status: 503 },
    );
  }
}
