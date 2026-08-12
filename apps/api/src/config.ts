import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function int(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Centralised env config. Loads .env from the API app root at runtime
 * (tsx loads it automatically; `node dist/index.js` relies on this loader).
 */
export function loadConfig() {
  const env = { ...process.env };

  return {
    port: int(env.API_PORT, 8787),
    databasePath: env.DATABASE_PATH ?? path.join(__dirname, "..", "data", "rattle-snake.db"),
    llm: {
      // Provider name: "openai" | "anthropic" | "google" | "deepseek" |
      // "kimi" | "grok" | "groq" | "qwen" | "openrouter" | "ollama" |
      // "vllm" | "lmstudio" | "localai" | "custom" | any unknown name
      // (unknown = generic OpenAI-compatible). See llm/presets.ts (FR-6).
      provider: env.LLM_PROVIDER ?? "openai",
      // Optional overrides; when unset, the provider preset supplies defaults
      // (base URL, model) and standard key env vars are consulted (FR-6.6).
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
  };
}

export type AppConfig = ReturnType<typeof loadConfig>;
