import { z } from "zod";

export const ApplicabilityCode = z.enum(["NC", "OS", "P", "S", "TS"]);
export const IsmVersion = z.string().regex(/^v\d{4}\.\d{2}\.\d{1,2}$/, "Invalid ISM version");

export const PolicyType = z.enum([
  "acceptable_use",
  "email_use",
  "incident_response",
  "access_control",
  "data_handling",
  "remote_work",
  "supplier_security",
  "backup_recovery",
]);

export function validationError(error: unknown) {
  if (error instanceof z.ZodError) {
    return {
      error: "Invalid request",
      issues: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    };
  }
  return { error: "Invalid request" };
}

export async function parseJson<T>(request: Request, schema: z.ZodType<T>) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new z.ZodError([
      {
        code: "custom",
        path: ["content-type"],
        message: "Expected application/json",
      },
    ]);
  }

  const body = await request.json().catch(() => {
    throw new z.ZodError([
      {
        code: "custom",
        path: ["body"],
        message: "Malformed JSON",
      },
    ]);
  });

  return schema.parse(body);
}

export function cleanApplicability(values?: string[] | null) {
  return (values ?? []).filter((value): value is z.infer<typeof ApplicabilityCode> =>
    ApplicabilityCode.safeParse(value).success,
  );
}
