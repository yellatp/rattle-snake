import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp } from "../app.js";
import { JobStore } from "../db/store.js";
import type { JobState, LlmConnection } from "@rattlesnake/shared";

const JD = `Senior Backend Engineer — FinTech Payments Platform.
We build low-latency payment processing. You will own services that move money
between merchants and banks in real time. Requirements: 5+ years in TypeScript,
Go, or Java. Strong systems design: distributed systems, microservices,
concurrency, idempotency. Event-driven architecture (Kafka, SQS). PostgreSQL at
scale. PCI-DSS awareness. Production debugging and on-call ownership.`;

const RESUME = `Rohan Mehta — Backend Engineer (6 years).
Senior Software Engineer — RetailWorks (E-commerce), 2021–Present.
Built inventory synchronization services. Improved API latency by refactoring
queries. Worked on order processing at 2M+ orders/month. Migrated a monolith to
event-driven microservices using Kafka. Skills: TypeScript, Node.js, Go,
PostgreSQL, Redis, Kafka, Docker, Kubernetes, AWS, Terraform, CI/CD.`;

describe("settings API", () => {
  let tmp: string;
  let ctx: ReturnType<typeof createApp>;
  let dbPath: string;

  beforeEach(() => {
    tmp = mkdtempSync(path.join(tmpdir(), "rsnake-set-"));
    process.env.LLM_PROVIDER = "mock";
    process.env.DEBATE_CROSS_TALK_ROUNDS = "1";
    dbPath = path.join(tmp, "test.db");
    process.env.DATABASE_PATH = dbPath;
    ctx = createApp();
  });

  afterEach(async () => {
    await drainActiveJobs(ctx.store);
    ctx.store.close();
    delete process.env.LLM_PROVIDER;
    delete process.env.DATABASE_PATH;
    delete process.env.DEBATE_CROSS_TALK_ROUNDS;
    rmSync(tmp, { recursive: true, force: true });
  });

  // --- Profile ----------------------------------------------------------------

  it("GET /api/profile returns empty defaults before anything is saved", async () => {
    const res = await ctx.app.request("/api/profile");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ name: "", email: "" });
  });

  it("PUT /api/profile persists the profile", async () => {
    const put = await ctx.app.request("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Jane Doe", email: "jane@example.com" }),
    });
    expect(put.status).toBe(200);
    const body = await put.json();
    expect(body).toMatchObject({ name: "Jane Doe", email: "jane@example.com" });

    const res = await ctx.app.request("/api/profile");
    expect(await res.json()).toMatchObject({ name: "Jane Doe", email: "jane@example.com" });
  });

  it("PUT /api/profile rejects invalid input", async () => {
    const res = await ctx.app.request("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: 42 }),
    });
    expect(res.status).toBe(400);
  });

  // --- Saved resumes -------------------------------------------------------------

  it("resumes CRUD: create, list, update, delete", async () => {
    const create = await ctx.app.request("/api/resumes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Rohan 2026", content: RESUME }),
    });
    expect(create.status).toBe(201);
    const item = await create.json();
    expect(item.title).toBe("Rohan 2026");

    const list = await ctx.app.request("/api/resumes");
    const listBody = (await list.json()) as { items: { id: string }[] };
    expect(listBody.items).toHaveLength(1);

    const updated = await ctx.app.request(`/api/resumes/${item.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Rohan v2", content: RESUME }),
    });
    expect(updated.status).toBe(200);
    expect((await updated.json()).title).toBe("Rohan v2");

    const del = await ctx.app.request(`/api/resumes/${item.id}`, { method: "DELETE" });
    expect(del.status).toBe(204);

    const again = await ctx.app.request(`/api/resumes/${item.id}`, { method: "DELETE" });
    expect(again.status).toBe(404);
  });

  // --- Saved JDs -------------------------------------------------------------------

  it("jds CRUD: create and validate min length", async () => {
    const ok = await ctx.app.request("/api/jds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "SWE JD", content: JD }),
    });
    expect(ok.status).toBe(201);

    const short = await ctx.app.request("/api/jds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Short", content: "tiny" }),
    });
    expect(short.status).toBe(400);
  });

  // --- LLM connections ----------------------------------------------------------------

  it("create connection encrypts the key: never returned, masked preview only", async () => {
    const res = await ctx.app.request("/api/llm-connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "My OpenAI",
        provider: "openai",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o-mini",
        apiKey: "sk-super-secret-test-key-1234567890",
      }),
    });
    expect(res.status).toBe(201);
    const conn = (await res.json()) as LlmConnection;
    expect(conn.hasKey).toBe(true);
    expect(conn.keyPreview).toBeTruthy();
    expect(JSON.stringify(conn)).not.toContain("sk-super-secret-test-key");
    expect(JSON.stringify(conn)).not.toContain("apiKey");
  });

  it("stored key survives round-trip: same value decrypts from a fresh store", async () => {
    const conn = ctx.store.createLlmConnection({
      name: "Secret",
      provider: "custom",
      baseUrl: "http://localhost:9000/v1",
      model: "test-model",
      apiKey: "sk-roundtrip-abc123",
    });
    const fresh = new JobStore(dbPath);
    const withKey = fresh.getLlmConnectionWithKey(conn.id);
    expect(withKey).not.toBeNull();
    expect(withKey!.apiKey).toBe("sk-roundtrip-abc123");
    fresh.close();
  });

  it("update without apiKey keeps the existing encrypted key", async () => {
    const created = ctx.store.createLlmConnection({
      name: "Keep",
      provider: "openai",
      model: "gpt-4o-mini",
      apiKey: "sk-original-key-999",
    });
    const res = await ctx.app.request(`/api/llm-connections/${created.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renamed" }),
    });
    expect(res.status).toBe(200);
    const updated = (await res.json()) as LlmConnection;
    expect(updated.name).toBe("Renamed");
    expect(updated.hasKey).toBe(true);

    const fresh = new JobStore(dbPath);
    expect(fresh.getLlmConnectionWithKey(created.id)?.apiKey).toBe("sk-original-key-999");
    fresh.close();
  });

  it("update with a new apiKey replaces the stored key", async () => {
    const created = ctx.store.createLlmConnection({
      name: "Swap",
      provider: "openai",
      model: "gpt-4o-mini",
      apiKey: "sk-old-key",
    });
    const res = await ctx.app.request(`/api/llm-connections/${created.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: "sk-new-key" }),
    });
    expect(res.status).toBe(200);
    const fresh = new JobStore(dbPath);
    expect(fresh.getLlmConnectionWithKey(created.id)?.apiKey).toBe("sk-new-key");
    fresh.close();
  });

  it("setting isDefault clears other defaults", async () => {
    const a = await createConnection(ctx.app, "A");
    const b = await createConnection(ctx.app, "B");
    await ctx.app.request(`/api/llm-connections/${a.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    });
    await ctx.app.request(`/api/llm-connections/${b.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    });
    const list = await ctx.app.request("/api/llm-connections");
    const body = (await list.json()) as { items: LlmConnection[] };
    const byId = new Map(body.items.map((c) => [c.id, c]));
    expect(byId.get(a.id)?.isDefault).toBe(false);
    expect(byId.get(b.id)?.isDefault).toBe(true);
  });

  it("delete connection removes it (204) and 404s afterwards", async () => {
    const created = ctx.store.createLlmConnection({ name: "Tmp", provider: "mock", model: "x" });
    const del = await ctx.app.request(`/api/llm-connections/${created.id}`, { method: "DELETE" });
    expect(del.status).toBe(204);
    const again = await ctx.app.request(`/api/llm-connections/${created.id}`, { method: "DELETE" });
    expect(again.status).toBe(404);
  });

  // --- llmConnectionId integration with jobs ----------------------------------------------

  it("rejects a job that provides both inline llm and llmConnectionId", async () => {
    const conn = ctx.store.createLlmConnection({ name: "T", provider: "mock", model: "x" });
    const res = await ctx.app.request("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        domain: "SWE",
        jobDescription: JD,
        baseResume: RESUME,
        llm: { provider: "mock" },
        llmConnectionId: conn.id,
      }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects an unknown llmConnectionId with 400", async () => {
    const res = await ctx.app.request("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        domain: "SWE",
        jobDescription: JD,
        baseResume: RESUME,
        llmConnectionId: "llm_nope",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("runs a job against a stored llmConnectionId and records llmUsed", async () => {
    const conn = ctx.store.createLlmConnection({
      name: "Mock Conn",
      provider: "mock",
      model: "mock-response-1",
      apiKey: "sk-not-sent",
    });
    const res = await ctx.app.request("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        domain: "SWE",
        jobDescription: JD,
        baseResume: RESUME,
        llmConnectionId: conn.id,
      }),
    });
    expect(res.status).toBe(202);
    const created = (await res.json()) as JobState;
    expect(created.llmUsed).toEqual({ provider: "mock", model: "mock-response-1" });
    expect(JSON.stringify(created)).not.toContain("sk-not-sent");

    const done = await waitForCompletion(ctx.app, created.id!);
    expect(done.status).toBe("completed");
    expect(done.llmUsed).toEqual({ provider: "mock", model: "mock-response-1" });
    expect(JSON.stringify(done)).not.toContain("sk-not-sent");
  });
});

function createConnection(
  app: ReturnType<typeof createApp>["app"],
  name: string,
): Promise<LlmConnection> {
  return app
    .request("/api/llm-connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, provider: "mock", model: "x" }),
    })
    .then((r) => r.json()) as Promise<LlmConnection>;
}

async function drainActiveJobs(store: ReturnType<typeof createApp>["store"]): Promise<void> {
  for (let i = 0; i < 200; i++) {
    const active = store
      .list()
      .some((j) => j.status === "pending" || j.status === "debating" || j.status === "rewriting");
    if (!active) return;
    await new Promise((r) => setTimeout(r, 20));
  }
}

async function waitForCompletion(
  app: ReturnType<typeof createApp>["app"],
  id: string,
  timeoutMs = 20_000,
): Promise<JobState> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await app.request(`/api/jobs/${id}`);
    const job = (await res.json()) as JobState;
    if (job.status === "completed" || job.status === "failed") return job;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Job ${id} did not complete within ${timeoutMs}ms`);
}
