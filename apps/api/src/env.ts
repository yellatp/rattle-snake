import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Loads .env files into process.env at every API entry point.
 *
 * Search order (first match wins, later files don't override earlier values):
 *   1. <api>/apps/api/.env
 *   2. <repo root>/.env
 *
 * Without this, `tsx`/`node dist` never parse .env and config.ts silently falls
 * back to defaults — which previously crashed local dev with "missing API key".
 */
export function loadEnv(): void {
  const apiRoot = path.resolve(__dirname, "..");
  const repoRoot = path.resolve(apiRoot, "..", "..");

  const candidates = [
    path.join(apiRoot, ".env"),
    path.join(repoRoot, ".env"),
  ].filter((p) => existsSync(p));

  config({ path: candidates.length > 0 ? candidates : undefined });
}
