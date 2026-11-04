import { NextRequest, NextResponse } from "next/server";
import { getFacets, getLatestVersion, hasRelease } from "@/lib/ism/repository";
import { IsmVersion, validationError } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const requested = request.nextUrl.searchParams.get("version") || null;
  const parsed = requested ? IsmVersion.safeParse(requested) : null;
  if (parsed && !parsed.success) {
    return NextResponse.json(validationError(parsed.error), { status: 400 });
  }

  const version = requested ?? (await getLatestVersion());
  if (!version || !(await hasRelease(version))) {
    return NextResponse.json({ error: "Unknown ISM version" }, { status: 404 });
  }

  return NextResponse.json(await getFacets(version));
}
