const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

function isPrivateIpv4(host: string): boolean {
  const parts = host.split(".").map((p) => Number.parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => !Number.isFinite(p) || p < 0 || p > 255)) return false;
  const [a, b] = parts as [number, number, number, number];
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) return true;
  if (host === "::1" || host === "::" || host.startsWith("fc") || host.startsWith("fd")) return true;
  if (host === "metadata.google.internal") return true;
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) return isPrivateIpv4(host);
  return false;
}

/**
 * Guard against SSRF: webhook targets must be public http(s) endpoints.
 * Hostname-level check (no DNS resolution) — good enough to block the common
 * link-local / RFC1918 / loopback / cloud-metadata targets.
 */
export function isWebhookUrlAllowed(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return false;
  if (!parsed.hostname) return false;
  return !isBlockedHostname(parsed.hostname);
}
