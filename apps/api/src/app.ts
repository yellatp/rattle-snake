import { Hono } from "hono";
import { cors } from "hono/cors";
import { loadConfig } from "./config.js";
import { createLLMClient } from "./llm/client.js";
import { JobStore } from "./db/store.js";
import { createJobsRouter } from "./routes/jobs.js";
import { createHealthRouter } from "./routes/health.js";
import { createSettingsRouter } from "./routes/settings.js";

export function createApp() {
  const config = loadConfig();
  const store = new JobStore(config.databasePath);
  const llm = createLLMClient(config);

  // Recover jobs orphaned by a previous crash/restart mid-debate.
  for (const job of store.list()) {
    if (job.status === "debating" || job.status === "rewriting" || job.status === "pending") {
      job.status = "failed";
      job.error = "Interrupted by server restart. Resubmit to re-run the committee.";
      job.updatedAt = new Date().toISOString();
      store.update(job);
    }
  }

  const app = new Hono();

  app.use(
    "*",
    cors({
      origin:
        config.corsOrigins.length > 0 ? config.corsOrigins : (origin) => origin || "*",
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type"],
    }),
  );

  app.route("/health", createHealthRouter(config, llm));
  app.route("/api/jobs", createJobsRouter(store, llm, config));
  app.route("/api", createSettingsRouter(store));

  return { app, store, llm, config };
}
