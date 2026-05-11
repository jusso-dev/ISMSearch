import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { searchControls } from "@/lib/meili";
import type { SspRow } from "@/lib/ism/types";
import { ApplicabilityCode, IsmVersion, parseJson, validationError } from "@/lib/validation";

const SspBody = z.object({
  boundary: z.string().min(10).max(2000),
  version: IsmVersion.optional(),
  applicability: z.array(ApplicabilityCode).max(5).optional(),
  limit: z.number().min(1).max(80).default(25),
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

export async function POST(request: NextRequest) {
  try {
    const parsed = await parseJson(request, SspBody);
    const retrieval = await searchControls({
      query: parsed.boundary,
      version: parsed.version,
      applicability: parsed.applicability,
      limit: parsed.limit,
    });

    const rows: SspRow[] = retrieval.hits.map((control) => ({
      systemBoundary: parsed.boundary,
      ismVersion: retrieval.version,
      controlId: control.controlId,
      controlTitle: titleFor(control.title, control.controlId, control.topic),
      controlStatement: control.statement,
      ismSection: control.section,
      classificationApplicability: control.applicability.map(applicabilityLabel).join("; "),
      implementationStatus: "Not assessed",
      implementationDescription: "",
      evidenceRequired: `Document how the system satisfies ${control.controlId}; attach architecture, configuration, operating procedure or test evidence as applicable.`,
      owner: "",
      notes: `Retrieved from ${control.release} using the supplied system boundary description.`,
    }));

    return NextResponse.json({
      boundary: parsed.boundary,
      version: retrieval.version,
      generatedAt: new Date().toISOString(),
      rows,
      retrieval,
    });
  } catch (error) {
    return NextResponse.json(validationError(error), { status: 400 });
  }
}
