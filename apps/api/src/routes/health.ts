import { Hono } from "hono";
import type { AppConfig } from "../config.js";
import type { JobStore } from "../db/store.js";
import type { LLMClient } from "../llm/client.js";

export function createHealthRouter(config: AppConfig, llm: LLMClient, store?: JobStore) {
  const router = new Hono();

  router.get("/", (c) => {
    const dbOk = store ? store.healthCheck() : true;
    if (!dbOk) return c.json({ ok: false, service: "rattle-snake-v2", db: false }, 503);
    return c.json({
      ok: true,
      service: "rattle-snake-v2",
      db: true,
      llm: { provider: llm.provider, model: llm.model },
    });
  });

  return router;
}
