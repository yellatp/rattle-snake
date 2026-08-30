import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { JobStore } from "../db/store.js";
import type { AuditLogger } from "../audit/logger.js";
import { webhookEventSchema } from "../webhooks/types.js";
import type { WebhookEvent, WebhookInput, WebhookUpdateInput } from "../webhooks/types.js";
import { isWebhookUrlAllowed } from "../webhooks/validate.js";

const webhookInputSchema = z.object({
  url: z.string().url(),
  events: z.array(webhookEventSchema).min(1),
  secret: z.string().max(256).optional(),
  isActive: z.boolean().optional(),
});

const webhookUpdateSchema = z.object({
  url: z.string().url().optional(),
  events: z.array(webhookEventSchema).optional(),
  secret: z.string().max(256).optional(),
  isActive: z.boolean().optional(),
});

export function createWebhooksRouter(store: JobStore, auditLogger?: AuditLogger) {
  const router = new Hono();

  const tenantId = (c: { get: (key: "tenantId") => string }) => c.get("tenantId") ?? "default";

  function audit(
    c: { get: (key: "tenantId" | "apiKeyId") => string },
    action: Parameters<AuditLogger["log"]>[0]["action"],
    outcome: Parameters<AuditLogger["log"]>[0]["outcome"],
    message: string,
    resourceId?: string,
  ) {
    if (!auditLogger) return;
    auditLogger.log({
      timestamp: new Date().toISOString(),
      action,
      tenantId: c.get("tenantId") ?? "default",
      apiKeyId: c.get("apiKeyId"),
      outcome,
      message,
      resourceId,
    });
  }

  router.get("/", (c) => {
    return c.json({ items: store.listWebhooks(tenantId(c)) });
  });

  router.post("/", zValidator("json", webhookInputSchema), (c) => {
    const body = c.req.valid("json") as WebhookInput;
    if (!isWebhookUrlAllowed(body.url)) {
      return c.json({ error: "Webhook URL must point to a public http(s) endpoint." }, 400);
    }
    const item = store.createWebhook(body, tenantId(c));
    audit(c, "webhook.created", "success", "Webhook created", item.id);
    return c.json(item, 201);
  });

  router.get("/:id", (c) => {
    const item = store.getWebhook(c.req.param("id"), tenantId(c));
    if (!item) return c.json({ error: "Webhook not found" }, 404);
    return c.json(item);
  });

  router.put("/:id", zValidator("json", webhookUpdateSchema), (c) => {
    const id = c.req.param("id");
    const patch = c.req.valid("json") as WebhookUpdateInput;
    if (patch.url !== undefined && !isWebhookUrlAllowed(patch.url)) {
      return c.json({ error: "Webhook URL must point to a public http(s) endpoint." }, 400);
    }
    const updated = store.updateWebhook(id, patch, tenantId(c));
    if (!updated) return c.json({ error: "Webhook not found" }, 404);
    audit(c, "webhook.updated", "success", "Webhook updated", id);
    return c.json(updated);
  });

  router.delete("/:id", (c) => {
    const id = c.req.param("id");
    const deleted = store.deleteWebhook(id, tenantId(c));
    if (!deleted) return c.json({ error: "Webhook not found" }, 404);
    audit(c, "webhook.deleted", "success", "Webhook deleted", id);
    return c.body(null, 204);
  });

  return router;
}
