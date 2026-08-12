/** Shared HTTP helpers for the provider adapters. */

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
