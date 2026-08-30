import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp } from "../app.js";
import type { Webhook } from "../webhooks/types.js";

async function createWebhook(
  app: ReturnType<typeof createApp>["app"],
  body: { url: string; events: string[]; secret?: string; isActive?: boolean },
): Promise<Webhook> {
  const res = await app.request("/api/webhooks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as Webhook;
}

describe("webhooks API", () => {
  let tmp: string;
  let ctx: ReturnType<typeof createApp>;

  beforeEach(() => {
    tmp = mkdtempSync(path.join(tmpdir(), "rsnake-webhooks-"));
    process.env.LLM_PROVIDER = "mock";
    process.env.DATABASE_PATH = path.join(tmp, "test.db");
    process.env.EXPORTS_DIR = path.join(tmp, "exports");
    ctx = createApp();
  });

  afterEach(async () => {
    ctx.store.close();
    delete process.env.LLM_PROVIDER;
    delete process.env.DATABASE_PATH;
    delete process.env.EXPORTS_DIR;
    rmSync(tmp, { recursive: true, force: true });
  });

  it("POST /api/webhooks creates a webhook", async () => {
    const created = await createWebhook(ctx.app, {
      url: "https://example.com/hook",
      events: ["job.completed", "resume.generated"],
      secret: "shh",
    });
    expect(created.id).toMatch(/^wh_/);
    expect(created.url).toBe("https://example.com/hook");
    expect(created.events).toEqual(["job.completed", "resume.generated"]);
    expect(created.hasSecret).toBe(true);
    expect((created as unknown as { secret?: string }).secret).toBeUndefined();
    expect(created.isActive).toBe(true);
  });

  it("GET /api/webhooks lists webhooks for the tenant", async () => {
    const created = await createWebhook(ctx.app, {
      url: "https://example.com/hook",
      events: ["job.completed"],
    });
    const res = await ctx.app.request("/api/webhooks");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Webhook[] };
    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe(created.id);
  });

  it("GET /api/webhooks/:id returns a webhook", async () => {
    const created = await createWebhook(ctx.app, {
      url: "https://example.com/hook",
      events: ["job.completed"],
    });
    const res = await ctx.app.request(`/api/webhooks/${created.id}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Webhook;
    expect(body.id).toBe(created.id);
  });

  it("GET /api/webhooks/:id 404s for unknown webhook", async () => {
    const res = await ctx.app.request("/api/webhooks/wh_missing");
    expect(res.status).toBe(404);
  });

  it("PUT /api/webhooks/:id updates a webhook", async () => {
    const created = await createWebhook(ctx.app, {
      url: "https://example.com/hook",
      events: ["job.completed"],
    });
    const res = await ctx.app.request(`/api/webhooks/${created.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/new", isActive: false }),
    });
    expect(res.status).toBe(200);
    const updated = (await res.json()) as Webhook;
    expect(updated.url).toBe("https://example.com/new");
    expect(updated.isActive).toBe(false);
    expect(updated.events).toEqual(["job.completed"]);
  });

  it("DELETE /api/webhooks/:id removes a webhook", async () => {
    const created = await createWebhook(ctx.app, {
      url: "https://example.com/hook",
      events: ["job.completed"],
    });
    const del = await ctx.app.request(`/api/webhooks/${created.id}`, { method: "DELETE" });
    expect(del.status).toBe(204);
    const again = await ctx.app.request(`/api/webhooks/${created.id}`);
    expect(again.status).toBe(404);
  });
});
