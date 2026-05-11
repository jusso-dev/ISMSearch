import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { searchControls } from "@/lib/meili";
import { ApplicabilityCode, IsmVersion, validationError } from "@/lib/validation";

const SearchParams = z.object({
  q: z.string().max(300).default(""),
  version: IsmVersion.optional(),
  limit: z.coerce.number().min(1).max(50).default(12),
});

export async function GET(request: NextRequest) {
  try {
    const parsed = SearchParams.parse(Object.fromEntries(request.nextUrl.searchParams));
    const applicability = [
      ...request.nextUrl.searchParams.getAll("applicability"),
      ...(request.nextUrl.searchParams.get("classifications")?.split(",") ?? []),
    ].filter((value) => ApplicabilityCode.safeParse(value).success);
    const result = await searchControls({
      query: parsed.q,
      version: parsed.version,
      limit: parsed.limit,
      applicability,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(validationError(error), { status: 400 });
  }
}
