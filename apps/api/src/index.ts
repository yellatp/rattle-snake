import { serve } from "@hono/node-server";
import { loadConfig } from "./config.js";
import { createApp } from "./app.js";

const config = loadConfig();
const { app, llm } = createApp();

const server = serve(
  { fetch: app.fetch, port: config.port },
  (info) => {
    console.log(`[rattle-snake-v2] API listening on http://localhost:${info.port}`);
    console.log(`[rattle-snake-v2] LLM provider: ${llm.provider} (${llm.model})`);
  },
);

function shutdown() {
  console.log("\n[rattle-snake-v2] shutting down...");
  server.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
