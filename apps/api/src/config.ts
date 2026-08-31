import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function int(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function loadApiKeys(env: NodeJS.ProcessEnv): Map<string, { tenantId: string; keyId: string }> {
  const keys = new Map<string, { tenantId: string; keyId: string }>();
  let raw = "";
  if (env.API_KEYS_FILE && existsSync(env.API_KEYS_FILE)) {
    raw = readFileSync(env.API_KEYS_FILE, "utf8").trim();
  } else if (env.API_KEYS) {
    raw = env.API_KEYS.trim();
  }
  if (!raw) return keys;
  try {
    const parsed = JSON.parse(raw) as Record<string, { tenantId: string; keyId: string }>;
    for (const [key, meta] of Object.entries(parsed)) {
      if (typeof meta?.tenantId === "string" && typeof meta?.keyId === "string") {
        keys.set(key, { tenantId: meta.tenantId, keyId: meta.keyId });
      }
    }
  } catch {
    // Invalid API key JSON is ignored so the server can still start in single-tenant mode.
  }
  return keys;
}

export function loadConfig() {
  const env = { ...process.env };
  // Secure-by-default for SaaS deployments: API keys are required in production
  // unless REQUIRE_API_KEY explicitly opts out. Dev/test stay frictionless.
  const requireApiKeyEnv = env.REQUIRE_API_KEY?.toLowerCase();
  const requireApiKey =
    requireApiKeyEnv !== undefined
      ? requireApiKeyEnv === "true" || requireApiKeyEnv === "1"
      : env.NODE_ENV === "production";
  // User-account auth ships behind a flag for one release (design plan R3/P4):
  // false = sessions exist but nothing is enforced; true = session or API key
  // required on every non-probe route, and legacy NULL-tenant rows are
  // backfilled to the default org (strict tenant isolation).
  const requireAuthEnv = env.REQUIRE_AUTH?.toLowerCase();
  const requireAuth = requireAuthEnv === "true" || requireAuthEnv === "1";

  return {
    port: int(env.API_PORT, 8787),
    databasePath: env.DATABASE_PATH ?? path.join(__dirname, "..", "data", "rattle-snake.db"),
    exportsDir: env.EXPORTS_DIR ?? path.join(__dirname, "..", "data", "exports"),
    llm: {
      provider: env.LLM_PROVIDER ?? "mock",
      baseUrl: env.LLM_BASE_URL,
      apiKey: env.LLM_API_KEY,
      model: env.LLM_MODEL,
      temperature: Number.parseFloat(env.LLM_TEMPERATURE ?? "0.3") || 0.3,
    },
    debate: {
      crossTalkRounds: int(env.DEBATE_CROSS_TALK_ROUNDS, 2),
      agentMaxRetries: int(env.AGENT_MAX_RETRIES, 2),
    },
    corsOrigins: (env.CORS_ORIGINS ?? "")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean),
    security: {
      maxBodySizeBytes: int(env.MAX_BODY_SIZE_BYTES, 256 * 1024),
      rateLimitRequests: int(env.RATE_LIMIT_REQUESTS, env.NODE_ENV === "production" ? 60 : 0),
      rateLimitWindowMs: int(env.RATE_LIMIT_WINDOW_MS, 60_000),
      requireApiKey,
      apiKeys: loadApiKeys(env),
      trustProxy: env.TRUST_PROXY === "true" || env.TRUST_PROXY === "1",
    },
    redis: {
      url: env.REDIS_URL,
      enabled: Boolean(env.REDIS_URL),
    },
    queue: {
      // "memory" or "redis". Redis is used when REDIS_URL is set and QUEUE_DRIVER=redis.
      driver: env.QUEUE_DRIVER ?? (env.REDIS_URL ? "redis" : "memory"),
      concurrency: int(env.QUEUE_CONCURRENCY, 4),
    },
    audit: {
      level: env.AUDIT_LOG_LEVEL ?? (env.NODE_ENV === "production" ? "info" : "debug"),
      pretty: env.AUDIT_PRETTY !== "false" && env.NODE_ENV !== "production",
    },
    auth: {
      requireAuth,
      tenantStrict: requireAuth || env.TENANT_STRICT === "true" || env.TENANT_STRICT === "1",
    },
  };
}

export type AppConfig = ReturnType<typeof loadConfig>;
