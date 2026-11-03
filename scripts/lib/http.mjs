export class HttpError extends Error {
  constructor(url, status, statusText) {
    super(`Failed to fetch ${url}: ${status} ${statusText}`.trim());
    this.name = "HttpError";
    this.url = url;
    this.status = status;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isRetryable(error) {
  if (error instanceof HttpError) return error.status === 429 || error.status >= 500;
  return true; // network errors and timeouts
}

/**
 * fetch() wrapper with a per-attempt timeout and small retry budget for
 * transient failures (network errors, timeouts, 429 and 5xx).
 */
export async function fetchText(url, { headers = {}, timeoutMs = 30_000, retries = 2, retryDelayMs = 1_500 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers,
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw new HttpError(url, response.status, response.statusText);
      }
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt === retries || !isRetryable(error)) break;
      await sleep(retryDelayMs * (attempt + 1));
    }
  }
  if (lastError?.name === "TimeoutError") {
    throw new Error(`Timed out fetching ${url} after ${timeoutMs}ms`);
  }
  throw lastError;
}

export { sleep };
