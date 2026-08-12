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
      provider: (env.LLM_PROVIDER ?? "openai") as "openai" | "mock",
      baseUrl: env.LLM_BASE_URL ?? "http://localhost:11434/v1",
      apiKey: env.LLM_API_KEY ?? "ollama",
      model: env.LLM_MODEL ?? "llama3.1",
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
