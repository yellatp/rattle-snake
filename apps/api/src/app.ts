import "./types/hono.js";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { loadConfig } from "./config.js";
import { createAuditLogger } from "./audit/logger.js";
import { createLLMClient } from "./llm/client.js";
import { JobStore } from "./db/store.js";
import { createJobsRouter } from "./routes/jobs.js";
import { createHealthRouter } from "./routes/health.js";
import { createSettingsRouter } from "./routes/settings.js";
import { createExportsRouter } from "./routes/exports.js";
import { createStorageRouter } from "./routes/storage.js";
import { createWebhooksRouter } from "./routes/webhooks.js";
import { createEventBus } from "./events/factory.js";
import { createQueue } from "./queue/factory.js";
import { createDefaultWorker } from "./worker/runner.js";
import { dispatchEventToTenantWebhooks } from "./webhooks/dispatcher.js";
import {
  authMiddleware,
  auditContextMiddleware,
  bodyLimitMiddleware,
  rateLimitMiddleware,
  securityHeadersMiddleware,
} from "./middleware/security.js";

export function createApp() {
  const config = loadConfig();
  const store = new JobStore(config.databasePath);
  const llm = createLLMClient(config);
  const auditLogger = createAuditLogger({ level: config.audit.level, pretty: config.audit.pretty });
  const bus = createEventBus(config);
  const queue = createQueue(config);

  // Hook: dispatch tenant webhooks for every job event published to the bus.
  // Failures are logged but never block the pipeline. Tenant lookups are
  // memoized per job (tenant never changes) so hot events avoid full-row reads.
  const tenantByJob = new Map<string, string | undefined>();
  const originalPublish = bus.publish.bind(bus);
  bus.publish = (event) => {
    originalPublish(event);
    if (!tenantByJob.has(event.jobId)) {
      if (tenantByJob.size > 2_000) tenantByJob.clear();
      tenantByJob.set(event.jobId, store.get(event.jobId)?.tenantId);
    }
    const eventTenantId = tenantByJob.get(event.jobId);
    void dispatchEventToTenantWebhooks(store, event, eventTenantId).catch((err) => {
      auditLogger.log({
        timestamp: new Date().toISOString(),
        action: "webhook.dispatch_failed",
        tenantId: eventTenantId ?? "default",
        outcome: "failure",
        message: err instanceof Error ? err.message : String(err),
        resourceId: event.jobId,
      });
    });
  };

  // Recover jobs orphaned by a previous crash/restart mid-debate.
  for (const job of store.list()) {
    if (job.status === "debating" || job.status === "pending") {
      job.status = "failed";
      job.error = "Interrupted by server restart. Resubmit to re-run the committee.";
      job.updatedAt = new Date().toISOString();
      store.update(job);
    }
  }

  const worker = createDefaultWorker(queue, { store, llm, config, bus });
  worker.start();

  const securityConfig: import("./middleware/security.js").SecurityConfig = {
    ...config.security,
    auditLogger,
  };

  const app = new Hono();

  // CORS must run before auth: browsers do not send credentials (API key) on
  // preflight OPTIONS, so auth-first would 401 the preflight itself.
  app.use(
    "*",
    cors({
      origin:
        config.corsOrigins.length > 0 ? config.corsOrigins : (origin) => origin || "*",
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "X-API-Key", "X-Tenant-ID"],
    }),
  );
  app.use("*", securityHeadersMiddleware());
  app.use("*", bodyLimitMiddleware(config.security.maxBodySizeBytes));
  app.use("*", authMiddleware(securityConfig));
  app.use("*", auditContextMiddleware(auditLogger, config.security.trustProxy));
  app.use("*", rateLimitMiddleware(securityConfig));

  app.route("/health", createHealthRouter(config, llm, store));
  app.route("/api/jobs", createJobsRouter(store, llm, config, bus, queue, auditLogger));
  app.route("/api/exports", createExportsRouter(store, config));
  app.route("/api/storage", createStorageRouter(store));
  app.route("/api/webhooks", createWebhooksRouter(store, auditLogger));
  app.route("/api", createSettingsRouter(store, llm, config, auditLogger));

  return { app, store, llm, config, bus, queue, worker, auditLogger };
}
