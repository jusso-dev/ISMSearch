/**
 * Client-side fetch helpers. Every request goes through these so that non-2xx
 * responses become typed errors instead of being stored as results.
 */

export type ApiIssue = { path?: string; message: string };

export class ApiError extends Error {
  readonly status: number;
  readonly issues: ApiIssue[];

  constructor(message: string, status: number, issues: ApiIssue[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.issues = issues;
  }
}

/** Serialisable error shape kept in component state. */
export type ErrorInfo = { message: string; details: string[]; status?: number };

export function isAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

function statusMessage(status: number) {
  if (status === 400) return "The request was rejected. Check the highlighted values and try again.";
  if (status === 404) return "The requested release or resource was not found.";
  if (status === 413) return "The request was too large.";
  if (status === 429) return "Rate limit reached. Wait a moment, then try again.";
  if (status >= 500) return "The server could not complete the request.";
  return `Request failed with status ${status}.`;
}

async function errorFromResponse(response: Response): Promise<ApiError> {
  let message = statusMessage(response.status);
  let issues: ApiIssue[] = [];
  try {
    const body = (await response.json()) as { error?: unknown; issues?: unknown };
    if (typeof body.error === "string" && body.error.trim()) message = body.error;
    if (Array.isArray(body.issues)) {
      issues = body.issues
        .filter((issue): issue is { path?: unknown; message: string } =>
          Boolean(issue) && typeof (issue as { message?: unknown }).message === "string",
        )
        .map((issue) => ({ path: typeof issue.path === "string" ? issue.path : undefined, message: issue.message }));
    }
  } catch {
    // Non-JSON error body; keep the status-derived message.
  }
  if (response.status === 429 && !/rate|too many/i.test(message)) message = `${statusMessage(429)} ${message}`;
  return new ApiError(message, response.status, issues);
}

export function toErrorInfo(error: unknown, fallback = "Something went wrong."): ErrorInfo {
  if (error instanceof ApiError) {
    return {
      message: error.message,
      status: error.status,
      details: error.issues.map((issue) => (issue.path ? `${issue.path}: ${issue.message}` : issue.message)),
    };
  }
  if (error instanceof TypeError) {
    return { message: "Network error. Check that the app server is running, then retry.", details: [] };
  }
  return { message: error instanceof Error && error.message ? error.message : fallback, details: [] };
}

/**
 * Fetch JSON, throwing ApiError for non-2xx responses or bodies that fail the
 * optional shape guard.
 */
export async function fetchJson<T>(
  input: string,
  init: RequestInit & { guard?: (value: unknown) => value is T } = {},
): Promise<T> {
  const { guard, ...requestInit } = init;
  const response = await fetch(input, {
    ...requestInit,
    headers: { accept: "application/json", ...(requestInit.headers ?? {}) },
  });
  if (!response.ok) throw await errorFromResponse(response);
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiError("The server returned an unreadable response.", response.status);
  }
  if (guard && !guard(body)) throw new ApiError("The server returned an unexpected response.", response.status);
  return body as T;
}

export type StreamEvent =
  | { type: "meta"; [key: string]: unknown }
  | { type: "token"; token: string }
  | { type: "error"; message: string }
  | { type: "done" };

/**
 * POST and consume an NDJSON event stream. Resolves with `true` when a `done`
 * event was received; `false` when the stream ended early. Throws ApiError for
 * JSON error responses returned before streaming begins.
 */
export async function postEventStream(
  input: string,
  body: unknown,
  onEvent: (event: StreamEvent) => void,
  signal: AbortSignal,
): Promise<boolean> {
  const response = await fetch(input, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/x-ndjson" },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) throw await errorFromResponse(response);
  if (!response.body) throw new ApiError("The server response did not include a stream.", response.status);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let sawDone = false;

  const emit = (line: string) => {
    if (!line.trim()) return;
    let event: StreamEvent;
    try {
      event = JSON.parse(line) as StreamEvent;
    } catch {
      return; // Ignore malformed lines rather than abandoning the whole stream.
    }
    if (event.type === "done") sawDone = true;
    onEvent(event);
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    lines.forEach(emit);
  }
  buffer += decoder.decode();
  emit(buffer);
  return sawDone;
}

/** One in-flight request per slot; starting a new one aborts the previous. */
export class RequestSlot {
  private controller: AbortController | null = null;

  begin() {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    return controller;
  }

  isCurrent(controller: AbortController) {
    return this.controller === controller;
  }

  finish(controller: AbortController) {
    if (this.controller === controller) this.controller = null;
  }

  abort() {
    this.controller?.abort();
    this.controller = null;
  }
}
