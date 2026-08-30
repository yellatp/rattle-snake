import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, existsSync, rmSync } from "node:fs";
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
    process.env.EXPORTS_DIR = path.join(tmp, "exports");
    ctx = createApp();
  });

  afterEach(async () => {
    await drainActiveJobs(ctx.store);
    ctx.store.close();
    delete process.env.LLM_PROVIDER;
    delete process.env.DATABASE_PATH;
    delete process.env.DEBATE_CROSS_TALK_ROUNDS;
    delete process.env.EXPORTS_DIR;
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
      body: JSON.stringify({ domain: "SDE", jobDescription: JD, baseResume: RESUME }),
    });
    expect(res.status).toBe(202);
    const created = (await res.json()) as JobState;
    expect(created.id).toBeTruthy();
    expect(created.status).toBe("pending");

    const done = await waitForCompletion(ctx.app, created.id!);
    expect(done.status).toBe("completed");
    expect(done.finalVerdict).toBe("SHORTLISTED"); // mock always votes HIRE
    expect(done.blueprint).toBeTruthy();
    expect(done.transcript.length).toBeGreaterThan(0);
    // Resume generation is an explicit handoff: nothing is written automatically.
    expect(done.rewrittenResume).toBeUndefined();
  });

  it("chained generate block auto-produces resume, cover letter, cold email, and interview", async () => {
    const created = await createJob(ctx.app, JD, RESUME, {
      generate: { resume: true, coverLetter: true, coldEmail: true, interview: true },
    });
    expect(created.generate).toEqual({ resume: true, coverLetter: true, coldEmail: true, interview: true });

    const done = await waitForArtifacts(ctx.app, created.id!, {
      resume: true,
      coverLetter: true,
      coldEmail: true,
      interview: true,
    });
    expect(done.status).toBe("completed");
    expect(done.rewrittenResume).toBeTruthy();
    expect(done.rewrittenResume).toContain("Rohan Mehta");
    expect(done.resumeMeta?.role).toBe("swe");
    expect(done.coverLetterDraft?.subject).toBeTruthy();
    expect(done.coverLetterDraft?.body).toBeTruthy();
    expect(done.coldEmailDraft?.subject).toBeTruthy();
    expect(done.coldEmailDraft?.body).toBeTruthy();
    expect(done.interviewPlan?.roleLabel).toBe("Software Engineer");
    expect(done.interviewPlan?.pipeline.length).toBeGreaterThanOrEqual(4);
    expect(done.interviewPlan?.experts).toHaveLength(5);
  });

  it("chained generate respects partial flags (only what was asked)", async () => {
    const created = await createJob(ctx.app, JD, RESUME, {
      generate: { resume: true },
    });
    const done = await waitForArtifacts(ctx.app, created.id!, { resume: true });
    expect(done.rewrittenResume).toBeTruthy();
    expect(done.resumeMeta?.role).toBe("swe");
    expect(done.coverLetterDraft).toBeUndefined();
    expect(done.coldEmailDraft).toBeUndefined();
    expect(done.interviewPlan).toBeUndefined();
  });

  it("POST /api/jobs/:id/resume/generate writes the resume + metadata on demand", async () => {
    const created = await createJob(ctx.app, JD, RESUME);
    await waitForCompletion(ctx.app, created.id!);

    const res = await ctx.app.request(`/api/jobs/${created.id}/resume/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const result = (await res.json()) as { markdown: string; json: string; meta: Record<string, unknown> };

    const done = await getJob(ctx.app, created.id!);
    expect(done.rewrittenResume).toBe(result.markdown);
    expect(done.rewrittenResumeJson).toBe(result.json);
    expect(done.resumeMeta?.role).toBe("swe");
    expect(done.resumeMeta?.roleLabel).toBe("Software Engineer");
    expect(done.resumeMeta?.atsScore).toBeGreaterThan(0);
    expect(done.resumeMeta?.moderationApproved).toBe(true);
    expect(done.resumeMeta?.iterations).toBe(1);
    expect(done.resumeMeta?.locale).toBe("us"); // default US for an unlocated JD
    expect(done.rewrittenResume).toContain("Rohan Mehta");

    const parsed = JSON.parse(done.rewrittenResumeJson!);
    expect(parsed.contact?.name).toBe("Rohan Mehta");
    expect(parsed.sections?.experience?.length).toBeGreaterThan(0);
  });

  it("POST /api/jobs/:id/resume/generate rejects a job that is not completed", async () => {
    const now = new Date().toISOString();
    ctx.store.create({
      id: "job_not_done",
      domain: "SDE",
      roleSlug: "swe",
      jobDescription: JD,
      baseResume: RESUME,
      transcript: [],
      status: "debating",
      createdAt: now,
      updatedAt: now,
    });
    const gen = await ctx.app.request("/api/jobs/job_not_done/resume/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(gen.status).toBe(400);
  });

  it("POST /api/jobs/:id/resume/generate 404s for an unknown job", async () => {
    const res = await ctx.app.request("/api/jobs/nope/resume/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
  });

  it("POST /api/jobs/:id/resume/generate rejects conflicting BYOK sources", async () => {
    const created = await createJob(ctx.app, JD, RESUME);
    await waitForCompletion(ctx.app, created.id!);
    const res = await ctx.app.request(`/api/jobs/${created.id}/resume/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ llm: { provider: "mock" }, llmConnectionId: "conn_x" }),
    });
    expect(res.status).toBe(400);
  });

  it("persists a job location and drives the UK English variant", async () => {
    const created = await createJob(ctx.app, JD, RESUME, { location: "London, UK" });
    expect(created.jobLocation).toBe("London, UK");
    const done = await waitForCompletion(ctx.app, created.id!);
    expect(done.jobLocation).toBe("London, UK");
    await generateResume(ctx.app, created.id!);
    const updated = await getJob(ctx.app, created.id!);
    expect(updated.resumeMeta?.locale).toBe("uk");
  });

  it("PUT /api/jobs/:id/resume persists JSON edits and re-renders markdown", async () => {
    const created = await createJob(ctx.app, JD, RESUME);
    await waitForCompletion(ctx.app, created.id!);
    await generateResume(ctx.app, created.id!);

    const edited = JSON.parse((await (await ctx.app.request(`/api/jobs/${created.id}`)).json()).rewrittenResumeJson);
    edited.sections.summary = { content: "Manually edited summary line." };
    edited.contact.email = "edited@example.com";

    const res = await ctx.app.request(`/api/jobs/${created.id}/resume`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rewrittenResumeJson: JSON.stringify(edited) }),
    });
    expect(res.status).toBe(200);
    const updated = (await res.json()) as JobState;
    expect(updated.rewrittenResumeJson).toContain("Manually edited summary line.");
    expect(updated.rewrittenResume).toContain("Manually edited summary line.");
    expect(updated.rewrittenResume).toContain("edited@example.com");
  });

  it("PUT /api/jobs/:id/resume rejects invalid JSON", async () => {
    const created = await createJob(ctx.app, JD, RESUME);
    await waitForCompletion(ctx.app, created.id!);
    const res = await ctx.app.request(`/api/jobs/${created.id}/resume`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rewrittenResumeJson: "{ not valid json" }),
    });
    expect(res.status).toBe(400);
  });

  it("auto-detects domain from the JD when omitted", async () => {
    const res = await ctx.app.request("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobDescription: JD, baseResume: RESUME }),
    });
    const created = (await res.json()) as JobState;
    expect(created.domain).toBe("SDE");
  });

  it("extracts JD metadata, selects the committee, and collects 360-degree analyses (WS-4)", async () => {
    const res = await ctx.app.request("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: "SDE", jobDescription: JD, baseResume: RESUME }),
    });
    const created = (await res.json()) as JobState;
    expect(created.roleSlug).toBe("swe"); // resolved from the JD

    const done = await waitForCompletion(ctx.app, created.id!);
    expect(done.roleSlug).toBe("swe");
    expect(done.jdMeta).toBeTruthy();
    expect(done.jdMeta!.company).toBe("FinPay");
    expect(done.jdMeta!.role).toBe("Senior Backend Engineer");
    expect(done.jdMeta!.sector).toBe("FinTech payments");
    expect(done.jdMeta!.location).toBe("New York, USA");
    // The extracted location backfills the job location for the resume locale.
    expect(done.jobLocation).toBe("New York, USA");
    // 6 years of experience selects the mid-band committee: 4 expert seats,
    // each of which produced a 360-degree analysis during the opening round.
    expect(done.analyses).toHaveLength(4);
    for (const analysis of done.analyses!) {
      expect(analysis.fitScore).toBeGreaterThanOrEqual(0);
      expect(analysis.fitScore).toBeLessThanOrEqual(10);
      expect(analysis.factors.length).toBeGreaterThanOrEqual(8);
      expect(analysis.decision).toBe("HIRE");
      expect(analysis.pivotFactor.length).toBeGreaterThan(0);
    }
  });

  it("honors an explicit roleSlug override (role-driven committee)", async () => {
    const created = await createJob(ctx.app, JD, RESUME, { roleSlug: "data_engineer" });
    expect(created.roleSlug).toBe("data_engineer");
    const done = await waitForCompletion(ctx.app, created.id!);
    expect(done.roleSlug).toBe("data_engineer");
    await generateResume(ctx.app, created.id!);
    const updated = await getJob(ctx.app, created.id!);
    expect(updated.resumeMeta?.role).toBe("data_engineer");
  });

  it("treats an explicit AUTO domain as detection (resolves to a bucket)", async () => {
    const res = await ctx.app.request("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: "AUTO", jobDescription: JD, baseResume: RESUME }),
    });
    expect(res.status).toBe(202);
    const created = (await res.json()) as JobState;
    expect(created.domain).toBe("SDE");
  });

  it("persists an explicit profileId on the job (WS-6)", async () => {
    const prof = await ctx.app.request("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Rohan Mehta", email: "rohan@example.com" }),
    });
    const profile = (await prof.json()) as { id: string };
    const created = await createJob(ctx.app, JD, RESUME, { profileId: profile.id });
    expect(created.profileId).toBe(profile.id);
    const done = await waitForCompletion(ctx.app, created.id!);
    expect(done.profileId).toBe(profile.id);
    expect(done.status).toBe("completed");
  });

  it("attaches the master profile by default when one exists", async () => {
    const prof = await ctx.app.request("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Default Candidate" }),
    });
    const profile = (await prof.json()) as { id: string };
    const created = await createJob(ctx.app, JD, RESUME);
    expect(created.profileId).toBe(profile.id);
  });

  it("rejects an unknown profileId with 400", async () => {
    const res = await ctx.app.request("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        domain: "SDE",
        jobDescription: JD,
        baseResume: RESUME,
        profileId: "prof_missing",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("GET /api/jobs lists jobs without transcript bodies", async () => {
    await ctx.app.request("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: "SDE", jobDescription: JD, baseResume: RESUME }),
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

  it("DELETE /api/jobs/:id removes the job, its export dossier, and 404s afterwards", async () => {
    const created = await createJob(ctx.app, JD, RESUME);
    await waitForCompletion(ctx.app, created.id!);
    const dossierDir = path.join(ctx.config.exportsDir, created.id!);
    expect(existsSync(dossierDir)).toBe(true);

    const del = await ctx.app.request(`/api/jobs/${created.id}`, { method: "DELETE" });
    expect(del.status).toBe(204);
    expect(existsSync(dossierDir)).toBe(false);

    const again = await ctx.app.request(`/api/jobs/${created.id}`, { method: "DELETE" });
    expect(again.status).toBe(404);
  });

  it("rejects a job description that is too short", async () => {
    const res = await ctx.app.request("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: "SDE", jobDescription: "short", baseResume: RESUME }),
    });
    expect(res.status).toBe(400);
  });

  it("records llmUsed for BYOK overrides and never persists the API key", async () => {
    const res = await ctx.app.request("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        domain: "SDE",
        jobDescription: JD,
        baseResume: RESUME,
        llm: { provider: "mock", apiKey: "sk-super-secret", temperature: 0.1 },
      }),
    });
    expect(res.status).toBe(202);
    const created = (await res.json()) as JobState;
    expect(created.llmUsed).toEqual({ provider: "mock", model: "mock-response-1" });
    expect(JSON.stringify(created)).not.toContain("sk-super-secret");

    const done = await waitForCompletion(ctx.app, created.id!);
    expect(done.status).toBe("completed");
    expect(done.llmUsed).toEqual({ provider: "mock", model: "mock-response-1" });
    expect(JSON.stringify(done)).not.toContain("sk-super-secret");
  });

  it("rejects a BYOK override with an invalid base URL", async () => {
    const res = await ctx.app.request("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        domain: "SDE",
        jobDescription: JD,
        baseResume: RESUME,
        llm: { provider: "openai", baseUrl: "not-a-url" },
      }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects a BYOK override that cannot be resolved (missing model)", async () => {
    const res = await ctx.app.request("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        domain: "SDE",
        jobDescription: JD,
        baseResume: RESUME,
        llm: { provider: "vllm", baseUrl: "http://localhost:8000/v1" },
      }),
    });
    expect(res.status).toBe(400);
  });

  it("POST /api/jobs/:id/cold-email returns a sanitized draft", async () => {
    const created = await createJob(ctx.app, JD, RESUME);
    await waitForCompletion(ctx.app, created.id!);
    const res = await ctx.app.request(`/api/jobs/${created.id}/cold-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audience: "founder" }),
    });
    expect(res.status).toBe(200);
    const draft = (await res.json()) as { subject: string; body: string };
    expect(draft.subject.length).toBeGreaterThan(0);
    expect(draft.body.length).toBeGreaterThan(0);
    expect(draft.subject).not.toContain("—");
    expect(draft.body).not.toContain("—");
  });

  it("POST /api/jobs/:id/cold-email 404s for an unknown job", async () => {
    const res = await ctx.app.request("/api/jobs/nope/cold-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
  });

  it("POST /api/jobs/:id/cover-letter returns a sanitized draft", async () => {
    const created = await createJob(ctx.app, JD, RESUME);
    await waitForCompletion(ctx.app, created.id!);
    const res = await ctx.app.request(`/api/jobs/${created.id}/cover-letter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const draft = (await res.json()) as { subject: string; body: string };
    expect(draft.subject.length).toBeGreaterThan(0);
    expect(draft.body.length).toBeGreaterThan(0);
    expect(draft.subject).not.toContain("—");
    expect(draft.body).not.toContain("—");
  });

  it("POST /api/jobs/:id/cover-letter 404s for an unknown job", async () => {
    const res = await ctx.app.request("/api/jobs/nope/cover-letter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
  });

  it("POST /api/jobs/:id/cold-email rejects conflicting BYOK sources", async () => {
    const created = await createJob(ctx.app, JD, RESUME);
    await waitForCompletion(ctx.app, created.id!);
    const res = await ctx.app.request(`/api/jobs/${created.id}/cold-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ llm: { provider: "mock" }, llmConnectionId: "conn_x" }),
    });
    expect(res.status).toBe(400);
  });

  it("POST /api/jobs/:id/interview-mock returns a 5-expert plan", async () => {
    const created = await createJob(ctx.app, JD, RESUME);
    await waitForCompletion(ctx.app, created.id!);
    const res = await ctx.app.request(`/api/jobs/${created.id}/interview-mock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const plan = (await res.json()) as {
      roleLabel: string;
      pipeline: unknown[];
      experts: unknown[];
      topics: string[];
      prepTips: string[];
    };
    expect(plan.roleLabel).toBe("Software Engineer");
    expect(plan.pipeline.length).toBeGreaterThanOrEqual(4);
    expect(plan.experts).toHaveLength(5);
    expect(plan.topics.length).toBeGreaterThan(0);
    expect(plan.prepTips.length).toBeGreaterThan(0);
  });

  it("POST /api/jobs/:id/interview-mock 404s for an unknown job", async () => {
    const res = await ctx.app.request("/api/jobs/nope/interview-mock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
  });
});

async function drainActiveJobs(store: ReturnType<typeof createApp>["store"]): Promise<void> {
  for (let i = 0; i < 200; i++) {
    const active = store
      .list()
      .some((j) => j.status === "pending" || j.status === "debating");
    if (!active) return;
    await new Promise((r) => setTimeout(r, 20));
  }
}

function createJob(
  app: ReturnType<typeof createApp>["app"],
  jd: string,
  resume: string,
  extra?: Record<string, unknown>,
) {
  return app
    .request("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: "SDE", jobDescription: jd, baseResume: resume, ...extra }),
    })
    .then((r) => r.json()) as Promise<JobState>;
}

async function generateResume(
  app: ReturnType<typeof createApp>["app"],
  id: string,
): Promise<{ status: number }> {
  return app.request(`/api/jobs/${id}/resume/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
}

async function getJob(app: ReturnType<typeof createApp>["app"], id: string): Promise<JobState> {
  const res = await app.request(`/api/jobs/${id}`);
  return (await res.json()) as JobState;
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

/**
 * Waits for a job to complete AND for every requested chained artifact to be
 * persisted (the chain runs after status becomes completed, before done).
 */
async function waitForArtifacts(
  app: ReturnType<typeof createApp>["app"],
  id: string,
  requested: { resume?: boolean; coverLetter?: boolean; coldEmail?: boolean; interview?: boolean },
  timeoutMs = 30_000,
): Promise<JobState> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const job = await getJob(app, id);
    const resume = !requested.resume || Boolean(job.rewrittenResume);
    const coverLetter = !requested.coverLetter || Boolean(job.coverLetterDraft);
    const coldEmail = !requested.coldEmail || Boolean(job.coldEmailDraft);
    const interview = !requested.interview || Boolean(job.interviewPlan);
    if (job.status === "completed" && resume && coverLetter && coldEmail && interview) return job;
    if (job.status === "failed") return job;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Job ${id} artifacts did not arrive within ${timeoutMs}ms`);
}


