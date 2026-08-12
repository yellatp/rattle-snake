import { Hono } from "hono";
import type { AppConfig } from "../config.js";
import type { LLMClient } from "../llm/client.js";

export function createHealthRouter(config: AppConfig, llm: LLMClient) {
  const router = new Hono();

  router.get("/", (c) =>
    c.json({
      ok: true,
      service: "rattle-snake-v2",
      llm: { provider: llm.provider, model: llm.model },
      debate: config.debate,
    }),
  );

  return router;
}
