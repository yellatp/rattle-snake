import { createHmac } from "node:crypto";
import type { JobEvent } from "@rattlesnake/shared";
import type { JobStore } from "../db/store.js";
import type { WebhookEvent, WebhookPayload, WebhookWithSecret } from "./types.js";

const WEBHOOK_TIMEOUT_MS = 10_000;
const WEBHOOK_MAX_ATTEMPTS = 3;
const WEBHOOK_RETRY_BASE_MS = 1_000;

function eventMatches(webhook: WebhookWithSecret, eventType: string): boolean {
  if (!webhook.isActive) return false;
  if (webhook.events.length === 0) return false;
  return webhook.events.includes(eventType as WebhookEvent);
}

function mapJobEventToWebhookEvent(event: JobEvent): WebhookEvent | null {
  switch (event.type) {
    case "status":
      if (event.status === "completed") return "job.completed";
      if (event.status === "failed") return "job.failed";
      return "job.created";
    case "done":
      return "job.completed";
    case "error":
      return "job.failed";
    case "resume":
      return "resume.generated";
    case "coverLetter":
      return "cover_letter.generated";
    case "coldEmail":
      return "cold_email.generated";
    case "interview":
      return "interview.generated";
    default:
      return null;
  }
}

function signPayload(payload: WebhookPayload, secret: string): string {
  const body = JSON.stringify(payload);
  return createHmac("sha256", secret).update(body).digest("hex");
}

export interface WebhookDispatchResult {
  webhookId: string;
  success: boolean;
  status?: number;
  error?: string;
}

export async function dispatchWebhook(
  webhook: WebhookWithSecret,
  event: JobEvent,
): Promise<WebhookDispatchResult> {
  const eventName = mapJobEventToWebhookEvent(event);
  if (!eventName || !eventMatches(webhook, eventName)) {
    return { webhookId: webhook.id, success: true };
  }

  const payload: WebhookPayload = {
    event: eventName,
    timestamp: new Date().toISOString(),
    tenantId: webhook.tenantId,
    data: event,
  };

  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "rattle-snake-v2-webhook/1.0",
  };
  if (webhook.secret) {
    headers["X-Webhook-Signature"] = `sha256=${signPayload(payload, webhook.secret)}`;
  }

  let lastResult: WebhookDispatchResult = {
    webhookId: webhook.id,
    success: false,
    error: "not attempted",
  };
  for (let attempt = 0; attempt < WEBHOOK_MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, WEBHOOK_RETRY_BASE_MS * 2 ** (attempt - 1)));
    }
    lastResult = await attemptDelivery(webhook, body, headers);
    if (lastResult.success) return lastResult;
  }
  return lastResult;
}

async function attemptDelivery(
  webhook: WebhookWithSecret,
  body: string,
  headers: Record<string, string>,
): Promise<WebhookDispatchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

  try {
    const res = await fetch(webhook.url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return {
      webhookId: webhook.id,
      success: res.status >= 200 && res.status < 300,
      status: res.status,
    };
  } catch (err) {
    clearTimeout(timeout);
    return {
      webhookId: webhook.id,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function dispatchEventToTenantWebhooks(
  store: JobStore,
  event: JobEvent,
  tenantId?: string,
): Promise<WebhookDispatchResult[]> {
  const webhooks = store.listWebhooksWithSecrets(tenantId);
  const results: WebhookDispatchResult[] = [];
  for (const webhook of webhooks) {
    results.push(await dispatchWebhook(webhook, event));
  }
  return results;
}
