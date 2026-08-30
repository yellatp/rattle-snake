import type { Context, Next } from "hono";
import type { AuditLogger } from "../audit/logger.js";
import type { AuditEvent } from "../audit/types.js";

export interface SecurityConfig {
  maxBodySizeBytes: number;
  rateLimitRequests: number;
  rateLimitWindowMs: number;
  apiKeys?: Map<string, { tenantId: string; keyId: string }>;
  requireApiKey: boolean;
  auditLogger: AuditLogger;
  /** Trust x-forwarded-for/x-real-ip (set only when running behind a trusted proxy). */
  trustProxy?: boolean;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimits = new Map<string, RateLimitEntry>();

// Periodically evict expired buckets so the map cannot grow without bound.
const RATE_LIMIT_SWEEP_INTERVAL_MS = 5 * 60 * 1_000;
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimits) {
    if (now >= entry.resetAt) rateLimits.delete(key);
  }
}, RATE_LIMIT_SWEEP_INTERVAL_MS);
sweeper.unref?.();

type RequestContext = Context;

/** Best-effort client IP: socket address unless the proxy headers are trusted. */
function requestIp(c: RequestContext, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip");
    if (forwarded) return forwarded.split(",")[0]!.trim();
  }
  // @hono/node-server exposes the raw IncomingMessage on c.env; the cast is the
  // documented runtime shape, not an escape hatch.
  const env = c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined;
  return env?.incoming?.socket?.remoteAddress ?? "unknown";
}

function getClientIdentifier(c: RequestContext, trustProxy: boolean): string {
  const tenant = c.get("tenantId") ?? "default";
  const key = c.get("apiKeyId") ?? "anonymous";
  return `${tenant}:${key}:${requestIp(c, trustProxy)}`;
}

function isRateLimited(windowMs: number, maxRequests: number, key: string): boolean {
  const now = Date.now();
  const entry = rateLimits.get(key);
  if (!entry || now >= entry.resetAt) {
    rateLimits.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  entry.count += 1;
  return entry.count > maxRequests;
}

export function bodyLimitMiddleware(maxBytes: number) {
  return async (c: Context, next: Next) => {
    const length = c.req.header("content-length");
    if (length && Number.parseInt(length, 10) > maxBytes) {
      return c.json({ error: "Request body too large." }, 413);
    }
    await next();
  };
}

/** Liveness probes must never authenticate or count against rate limits. */
function isProbePath(path: string): boolean {
  return path === "/health" || path.startsWith("/health/");
}

export function rateLimitMiddleware(config: SecurityConfig) {
  const trustProxy = config.trustProxy ?? false;
  return async (c: Context, next: Next) => {
    if (config.rateLimitRequests <= 0 || isProbePath(c.req.path)) {
      await next();
      return;
    }
    const key = getClientIdentifier(c, trustProxy);
    if (isRateLimited(config.rateLimitWindowMs, config.rateLimitRequests, key)) {
      config.auditLogger.log({
        timestamp: new Date().toISOString(),
        action: "rate_limit.hit",
        tenantId: c.get("tenantId") ?? "default",
        apiKeyId: c.get("apiKeyId"),
        ip: requestIp(c, trustProxy),
        outcome: "rate_limited",
        message: "Rate limit exceeded",
      } as AuditEvent);
      return c.json({ error: "Rate limit exceeded. Please slow down." }, 429);
    }
    await next();
  };
}

export function authMiddleware(config: SecurityConfig) {
  const trustProxy = config.trustProxy ?? false;
  return async (c: Context, next: Next) => {
    if (isProbePath(c.req.path)) {
      c.set("tenantId", "default");
      c.set("apiKeyId", "probe");
      await next();
      return;
    }
    const tenantHeader = c.req.header("x-tenant-id");
    const apiKeyHeader = c.req.header("x-api-key");

    if (config.requireApiKey) {
      if (!apiKeyHeader) {
        config.auditLogger.log({
          timestamp: new Date().toISOString(),
          action: "api_key.rejected",
          tenantId: tenantHeader ?? "default",
          ip: requestIp(c, trustProxy),
          outcome: "denied",
          message: "Missing API key",
        } as AuditEvent);
        return c.json({ error: "API key required." }, 401);
      }
      const key = config.apiKeys?.get(apiKeyHeader);
      if (!key) {
        config.auditLogger.log({
          timestamp: new Date().toISOString(),
          action: "api_key.rejected",
          tenantId: tenantHeader ?? "default",
          ip: requestIp(c, trustProxy),
          outcome: "denied",
          message: "Invalid API key",
        } as AuditEvent);
        return c.json({ error: "Invalid API key." }, 401);
      }
      c.set("tenantId", key.tenantId);
      c.set("apiKeyId", key.keyId);
    } else {
      c.set("tenantId", tenantHeader ?? "default");
      c.set("apiKeyId", apiKeyHeader ?? "system");
    }

    await next();
  };
}

export function auditContextMiddleware(auditLogger: AuditLogger, trustProxy = false) {
  return async (c: Context, next: Next) => {
    const tenantId = c.get("tenantId") ?? "default";
    const apiKeyId = c.get("apiKeyId");
    const ip = requestIp(c, trustProxy);
    const userAgent = c.req.header("user-agent") ?? "unknown";
    c.set(
      "audit",
      auditLogger.child({ tenantId, apiKeyId, ip, userAgent }),
    );
    await next();
  };
}

export function securityHeadersMiddleware() {
  return async (c: Context, next: Next) => {
    c.header("X-Content-Type-Options", "nosniff");
    c.header("X-Frame-Options", "DENY");
    c.header("Referrer-Policy", "strict-origin-when-cross-origin");
    await next();
  };
}
