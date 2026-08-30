/** Shared HTTP helpers for the provider adapters. */

const LLM_TIMEOUT_MS = 120_000;
const LLM_MAX_ATTEMPTS = 3;
const LLM_RETRY_BASE_MS = 500;

/** Non-retryable LLM HTTP failure with provider context. */
export class LlmHttpError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "LlmHttpError";
    this.status = status;
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/**
 * POST-with-resilience for every provider adapter:
 * - hard timeout per attempt (AbortSignal.timeout),
 * - bounded retries with backoff on network errors and 408/429/5xx,
 * - honors a numeric `Retry-After` header when the provider sends one.
 * The request body must be a string so it can be safely replayed.
 */
export async function fetchLlm(
  url: string | URL,
  init: RequestInit & { body: string },
  provider: string,
): Promise<Response> {
  let lastError: unknown = new Error(`LLM request to ${provider} was not attempted`);
  let retryAfterSeconds = "";
  for (let attempt = 0; attempt < LLM_MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      const headerSeconds = Number.parseInt(retryAfterSeconds, 10);
      const delay = Number.isFinite(headerSeconds) && headerSeconds > 0
        ? Math.min(headerSeconds * 1_000, 15_000)
        : LLM_RETRY_BASE_MS * 2 ** (attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
      retryAfterSeconds = "";
    }
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(LLM_TIMEOUT_MS) });
      if (res.ok) return res;
      retryAfterSeconds = res.headers?.get?.("retry-after") ?? "";
      const error = new LlmHttpError(await describeHttpError(res, provider), res.status);
      if (!isRetryableStatus(res.status)) throw error;
      lastError = error;
    } catch (err) {
      if (err instanceof LlmHttpError) throw err;
      lastError = err;
    }
  }
  throw lastError;
}

/**
 * Build an error message from a non-2xx LLM response. Keeps the message small
 * (first ~300 chars of the body) while retaining status + provider context.
 */
export async function describeHttpError(res: Response, provider: string): Promise<string> {
  let detail = "";
  try {
    const raw = await res.text();
    detail = raw.slice(0, 300);
  } catch {
    detail = "(no response body)";
  }
  return `LLM request to ${provider} failed with HTTP ${res.status}: ${detail}`;
}

/**
 * Append an API path to a base URL without double-prefixing a version segment.
 * e.g. withApiPath("https://api.anthropic.com", "/v1/messages")
 *        -> "https://api.anthropic.com/v1/messages"
 *      withApiPath("https://api.anthropic.com/v1", "/v1/messages")
 *        -> "https://api.anthropic.com/v1/messages"
 */
export function withApiPath(baseUrl: string, apiPath: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  const version = apiPath.match(/^(\/[^/]+)/)?.[1];
  if (version && base.endsWith(version)) {
    return `${base}${apiPath.slice(version.length)}`;
  }
  return `${base}${apiPath}`;
}
