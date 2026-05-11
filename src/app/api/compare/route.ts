import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { compareVersions } from "@/lib/ism/repository";
import { IsmVersion, validationError } from "@/lib/validation";

const CompareParams = z.object({
  from: IsmVersion,
  to: IsmVersion,
});

export async function GET(request: NextRequest) {
  try {
    const parsed = CompareParams.parse(Object.fromEntries(request.nextUrl.searchParams));
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
  } catch (error) {
    return NextResponse.json(validationError(error), { status: 400 });
  }
}
