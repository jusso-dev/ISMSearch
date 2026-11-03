import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasRelease } from "@/lib/ism/repository";
import { searchControls } from "@/lib/meili";
import { ChapterFilter, cleanApplicability, cleanEssentialEight, IsmVersion, validationError } from "@/lib/validation";

const SearchParams = z.object({
  q: z.string().max(300).default(""),
  version: IsmVersion.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(12),
  offset: z.coerce.number().int().min(0).max(5000).default(0),
  chapter: ChapterFilter.optional(),
});

function csvValues(params: URLSearchParams, name: string) {
  return params.getAll(name).flatMap((value) => value.split(",")).map((value) => value.trim());
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  let parsed: z.infer<typeof SearchParams>;
  try {
    parsed = SearchParams.parse({
      q: params.get("q") ?? undefined,
      version: params.get("version") || undefined,
      limit: params.get("limit") || undefined,
      offset: params.get("offset") || undefined,
      chapter: params.get("chapter") || undefined,
    });
  } catch (error) {
    return NextResponse.json(validationError(error), { status: 400 });
  }

  if (parsed.version && !(await hasRelease(parsed.version))) {
    return NextResponse.json({ error: "Unknown ISM version" }, { status: 404 });
  }

  // `classifications` is the legacy comma-separated form of `applicability`.
  const applicability = cleanApplicability([...csvValues(params, "applicability"), ...csvValues(params, "classifications")]);
  const essentialEight = cleanEssentialEight(csvValues(params, "essentialEight"));

  try {
    const result = await searchControls({
      query: parsed.q,
      version: parsed.version,
      limit: parsed.limit,
      offset: parsed.offset,
      applicability,
      chapter: parsed.chapter ?? null,
      essentialEight,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[api/search] search failed", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
