import { serve } from "@hono/node-server";
import { loadEnv } from "./env.js";
import { loadConfig } from "./config.js";
import { createApp } from "./app.js";

loadEnv();

const config = loadConfig();
const { app, llm, worker, queue, store } = createApp();

const server = serve(
  { fetch: app.fetch, port: config.port },
  (info) => {
    console.log(`[rattle-snake-v2] API listening on http://localhost:${info.port}`);
    console.log(`[rattle-snake-v2] LLM provider: ${llm.provider} (${llm.model})`);
  },
);

async function shutdown() {
  console.log("\n[rattle-snake-v2] shutting down...");
  server.close();
  await Promise.race([
    worker.stop(30_000),
    new Promise((resolve) => setTimeout(resolve, 32_000)),
  ]);
  try {
    await queue.close();
  } catch (err) {
    console.error("[rattle-snake-v2] queue close failed:", err);
  }
  try {
    store.close();
  } catch (err) {
    console.error("[rattle-snake-v2] store close failed:", err);
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
