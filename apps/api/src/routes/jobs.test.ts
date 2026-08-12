import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp } from "../app.js";
import type { JobState } from "@rattlesnake/shared";

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

describe("jobs API", () => {
  let tmp: string;
  let ctx: ReturnType<typeof createApp>;

  beforeEach(() => {
    tmp = mkdtempSync(path.join(tmpdir(), "rsnake-"));
    process.env.LLM_PROVIDER = "mock";
    process.env.DATABASE_PATH = path.join(tmp, "test.db");
    process.env.DEBATE_CROSS_TALK_ROUNDS = "1";
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

  it("GET /health reports the LLM provider + model", async () => {
    const res = await ctx.app.request("/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.llm.provider).toBe("mock");
  });

  it("POST /api/jobs creates a job (202), then completes end-to-end", async () => {
    const res = await ctx.app.request("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: "SWE", jobDescription: JD, baseResume: RESUME }),
    });
    expect(res.status).toBe(202);
    const created = (await res.json()) as JobState;
    expect(created.id).toBeTruthy();
    expect(created.status).toBe("pending");

    const done = await waitForCompletion(ctx.app, created.id!);
    expect(done.status).toBe("completed");
    expect(done.finalVerdict).toBe("SHORTLISTED"); // mock always votes HIRE
    expect(done.blueprint).toBeTruthy();
    expect(done.rewrittenResume).toContain("# ");
    expect(done.transcript.length).toBeGreaterThan(0);
  });

  it("auto-detects domain from the JD when omitted", async () => {
    const res = await ctx.app.request("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobDescription: JD, baseResume: RESUME }),
    });
    const created = (await res.json()) as JobState;
    expect(created.domain).toBe("SWE");
  });

  it("GET /api/jobs lists jobs without transcript bodies", async () => {
    await ctx.app.request("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: "SWE", jobDescription: JD, baseResume: RESUME }),
    });
    const res = await ctx.app.request("/api/jobs");
    const body = (await res.json()) as { jobs: (JobState & { transcriptLength: number })[] };
    expect(body.jobs.length).toBeGreaterThanOrEqual(1);
    expect(body.jobs[0]!.transcriptLength).toBeGreaterThanOrEqual(0);
    expect(body.jobs[0]!).not.toHaveProperty("jobDescription");
  });

  it("GET /api/jobs/:id returns 404 for an unknown job", async () => {
    const res = await ctx.app.request("/api/jobs/nope");
    expect(res.status).toBe(404);
  });

  it("DELETE /api/jobs/:id removes the job (204) and 404s afterwards", async () => {
    const created = await createJob(ctx.app, JD, RESUME);
    await waitForCompletion(ctx.app, created.id!);
    const del = await ctx.app.request(`/api/jobs/${created.id}`, { method: "DELETE" });
    expect(del.status).toBe(204);
    const again = await ctx.app.request(`/api/jobs/${created.id}`, { method: "DELETE" });
    expect(again.status).toBe(404);
  });

  it("rejects a job description that is too short", async () => {
    const res = await ctx.app.request("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: "SWE", jobDescription: "short", baseResume: RESUME }),
    });
    expect(res.status).toBe(400);
  });
});

async function drainActiveJobs(store: ReturnType<typeof createApp>["store"]): Promise<void> {
  for (let i = 0; i < 200; i++) {
    const active = store
      .list()
      .some((j) => j.status === "pending" || j.status === "debating" || j.status === "rewriting");
    if (!active) return;
    await new Promise((r) => setTimeout(r, 20));
  }
}

function createJob(app: ReturnType<typeof createApp>["app"], jd: string, resume: string) {
  return app
    .request("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: "SWE", jobDescription: jd, baseResume: resume }),
    })
    .then((r) => r.json()) as Promise<JobState>;
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


