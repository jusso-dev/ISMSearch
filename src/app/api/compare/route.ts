import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { compareVersions, hasRelease } from "@/lib/ism/repository";
import { checkRateLimit, clientIp, rateLimitResponse } from "@/lib/rate-limit";
import { IsmVersion, validationError } from "@/lib/validation";

const CompareParams = z.object({
  from: IsmVersion,
  to: IsmVersion,
});

/**
 * GET /api/compare?from=&to=
 * Both versions must exist in the manifest (404 otherwise). Comparing a release with
 * itself is allowed and simply reports zero changes (every control "unchanged").
 */
export async function GET(request: NextRequest) {
  const rateLimit = checkRateLimit(`compare:${clientIp(request)}`, 30, 60_000);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.resetAt);

  let parsed: z.infer<typeof CompareParams>;
  try {
    parsed = CompareParams.parse({
      from: request.nextUrl.searchParams.get("from") ?? undefined,
      to: request.nextUrl.searchParams.get("to") ?? undefined,
    });
  } catch (error) {
    return NextResponse.json(validationError(error), { status: 400 });
  }

  const [fromExists, toExists] = await Promise.all([hasRelease(parsed.from), hasRelease(parsed.to)]);
  if (!fromExists || !toExists) {
    return NextResponse.json({ error: "Unknown ISM version" }, { status: 404 });
  }

  const changes = await compareVersions(parsed.from, parsed.to);
  return NextResponse.json({
    from: parsed.from,
    to: parsed.to,
    total: changes.length,
    added: changes.filter((change) => change.status === "added").length,
    removed: changes.filter((change) => change.status === "removed").length,
    changed: changes.filter((change) => change.status === "changed").length,
    unchanged: changes.filter((change) => change.status === "unchanged").length,
    changes: changes.filter((change) => change.status !== "unchanged"),
  });
}
