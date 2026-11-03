import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getControls, getLatestVersion, hasRelease } from "@/lib/ism/repository";
import type { IsmControl, SearchResponse, SspRow } from "@/lib/ism/types";
import { keywordQuery, searchControls } from "@/lib/meili";
import { checkRateLimit, clientIp, rateLimitResponse } from "@/lib/rate-limit";
import {
  ApplicabilityCode,
  ChapterFilter,
  EssentialEightLevel,
  IsmVersion,
  parseJson,
  requestErrorResponse,
} from "@/lib/validation";

/** Maximum rows returned in baseline mode. */
const BASELINE_MAX_ROWS = 2000;

const SspBody = z.object({
  /** System boundary / description (also the retrieval query in "search" mode). */
  boundary: z.string().min(10).max(2000),
  version: IsmVersion.optional(),
  /**
   * "search": the most relevant controls for the boundary description (up to `limit`).
   * "baseline": every control in the release matching the filters, ignoring relevance
   * (capped at 2000 rows; `truncated` reports whether the cap was hit).
   */
  mode: z.enum(["search", "baseline"]).default("search"),
  applicability: z.array(ApplicabilityCode).max(5).optional(),
  chapter: ChapterFilter.nullish(),
  essentialEight: z.array(EssentialEightLevel).max(3).nullish(),
  limit: z.number().int().min(1).max(200).default(25),
});

function titleFor(controlTitle: string, controlId: string, topic: string) {
  return controlTitle === controlId ? topic : controlTitle;
}

function applicabilityLabel(value: string) {
  return (
    {
      NC: "OFFICIAL",
      OS: "OFFICIAL: Sensitive",
      P: "PROTECTED",
      S: "SECRET",
      TS: "TOP SECRET",
    }[value] ?? value
  );
}

function toRow(control: IsmControl, boundary: string, version: string, mode: "search" | "baseline"): SspRow {
  return {
    systemBoundary: boundary,
    ismVersion: version,
    controlId: control.controlId,
    controlTitle: titleFor(control.title, control.controlId, control.topic),
    controlStatement: control.statement,
    ismSection: control.section,
    classificationApplicability: control.applicability.map(applicabilityLabel).join("; "),
    implementationStatus: "Not assessed",
    implementationDescription: "",
    evidenceRequired: `Document how the system satisfies ${control.controlId}; attach architecture, configuration, operating procedure or test evidence as applicable.`,
    owner: "",
    notes:
      mode === "baseline"
        ? `Included from the ${control.release} baseline for the selected filters.`
        : `Retrieved from ${control.release} using the supplied system boundary description.`,
  };
}

export async function POST(request: NextRequest) {
  const rateLimit = checkRateLimit(`ssp:${clientIp(request)}`, 20, 60_000);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.resetAt);

  let parsed: z.infer<typeof SspBody>;
  try {
    parsed = await parseJson(request, SspBody);
  } catch (error) {
    return requestErrorResponse(error);
  }

  const version = parsed.version ?? (await getLatestVersion());
  if (parsed.version && !(await hasRelease(parsed.version))) {
    return NextResponse.json({ error: "Unknown ISM version" }, { status: 404 });
  }

  const generatedAt = new Date().toISOString();

  if (parsed.mode === "baseline") {
    const started = Date.now();
    const applicability = parsed.applicability ?? [];
    const essentialEight = parsed.essentialEight ?? [];
    const chapter = parsed.chapter ?? null;
    const controls = (await getControls(version)).filter(
      (control) =>
        (!applicability.length || applicability.some((value) => control.applicability.includes(value))) &&
        (!chapter || control.chapter === chapter) &&
        (!essentialEight.length || essentialEight.some((value) => control.essentialEight.includes(value))),
    );
    const selected = controls.slice(0, BASELINE_MAX_ROWS);
    const resolvedVersion = version ?? "";
    const retrieval: SearchResponse = {
      query: "",
      version: resolvedVersion,
      estimatedTotalHits: controls.length,
      processingTimeMs: Date.now() - started,
      hits: [],
      source: "local",
      offset: 0,
      limit: BASELINE_MAX_ROWS,
    };

    return NextResponse.json({
      mode: parsed.mode,
      boundary: parsed.boundary,
      version: resolvedVersion,
      generatedAt,
      total: controls.length,
      truncated: controls.length > selected.length,
      rows: selected.map((control) => toRow(control, parsed.boundary, resolvedVersion, "baseline")),
      retrieval,
    });
  }

  try {
    const retrieval = await searchControls({
      query: keywordQuery(parsed.boundary),
      version,
      applicability: parsed.applicability,
      chapter: parsed.chapter ?? null,
      essentialEight: parsed.essentialEight ?? null,
      limit: parsed.limit,
    });

    return NextResponse.json({
      mode: parsed.mode,
      boundary: parsed.boundary,
      version: retrieval.version,
      generatedAt,
      total: retrieval.estimatedTotalHits,
      truncated: retrieval.estimatedTotalHits > retrieval.hits.length,
      rows: retrieval.hits.map((control) => toRow(control, parsed.boundary, retrieval.version, "search")),
      retrieval,
    });
  } catch (error) {
    console.error("[api/ssp] retrieval failed", error);
    return NextResponse.json({ error: "Unable to build SSP rows" }, { status: 500 });
  }
}
