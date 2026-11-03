// Leaf module (only depends on zod) so it can be exercised directly by `node --test`.
import { z } from "zod";

export const ApplicabilityCode = z.enum(["NC", "OS", "P", "S", "TS"]);
export const EssentialEightLevel = z.enum(["ML1", "ML2", "ML3"]);
export const IsmVersion = z.string().regex(/^v\d{4}\.\d{2}\.\d{1,2}$/, "Invalid ISM version");
export const ChapterFilter = z.string().trim().min(1).max(200);

/** Control IDs such as ISM-1234 or ISM-PRINCIPLE-GOV-01 (matched case-insensitively). */
export const CONTROL_ID_PATTERN = /^ISM-[A-Z0-9-]{1,40}$/i;

/** Maximum accepted size of JSON / form request bodies. */
export const MAX_BODY_BYTES = 32 * 1024;

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

export class BodyTooLargeError extends Error {
  readonly status = 413;
  constructor() {
    super("Request body too large");
    this.name = "BodyTooLargeError";
  }
}

export function validationError(error: unknown) {
  if (error instanceof BodyTooLargeError) {
    return { error: "Request body too large" };
  }
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

/** Maps a parse/validation failure to a JSON error response (413 for oversized bodies, otherwise 400). */
export function requestErrorResponse(error: unknown) {
  return Response.json(validationError(error), { status: error instanceof BodyTooLargeError ? 413 : 400 });
}

/**
 * Reads a request body with a hard byte cap. Rejects early when a declared
 * Content-Length exceeds the cap, and also enforces the cap while streaming
 * (Content-Length can be absent with chunked encoding, or wrong).
 */
export async function readBodyBytes(request: Request, maxBytes = MAX_BODY_BYTES): Promise<Uint8Array> {
  const declared = request.headers.get("content-length");
  if (declared && /^\d+$/.test(declared.trim()) && Number(declared) > maxBytes) {
    await request.body?.cancel().catch(() => undefined);
    throw new BodyTooLargeError();
  }
  if (!request.body) return new Uint8Array(0);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new BodyTooLargeError();
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let position = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, position);
    position += chunk.byteLength;
  }
  return bytes;
}

function customIssue(path: string, message: string) {
  return new z.ZodError([{ code: "custom", path: [path], message, input: undefined }]);
}

/** Reads (with the body cap) and JSON-parses a request body without schema validation. */
export async function readJsonBody(request: Request, maxBytes = MAX_BODY_BYTES): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw customIssue("content-type", "Expected application/json");
  }
  const bytes = await readBodyBytes(request, maxBytes);
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw customIssue("body", "Malformed JSON");
  }
}

/**
 * Parses and validates a JSON request body. Throws `BodyTooLargeError` for bodies
 * over 32 KB and `z.ZodError` for wrong content type, malformed JSON or schema failures.
 * Use `requestErrorResponse(error)` to turn either into a response.
 */
export async function parseJson<T>(request: Request, schema: z.ZodType<T>, maxBytes = MAX_BODY_BYTES) {
  return schema.parse(await readJsonBody(request, maxBytes));
}

export function cleanApplicability(values?: readonly string[] | null) {
  return (values ?? []).filter((value): value is z.infer<typeof ApplicabilityCode> =>
    ApplicabilityCode.safeParse(value).success,
  );
}

export function cleanEssentialEight(values?: readonly string[] | null) {
  return [
    ...new Set(
      (values ?? []).filter((value): value is z.infer<typeof EssentialEightLevel> =>
        EssentialEightLevel.safeParse(value).success,
      ),
    ),
  ];
}
