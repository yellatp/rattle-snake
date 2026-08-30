import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import {
  coldEmailAudienceSchema,
  createJobSchema,
  detectDomain,
  llmOverrideSchema,
  type CreateJobInput,
  type JobState,
} from "@rattlesnake/shared";
import type { AppConfig } from "../config.js";
import type { AuditLogger } from "../audit/logger.js";
import type { JobStore } from "../db/store.js";
import type { LLMClient } from "../llm/client.js";
import {
  resolveLlmClientForRequest,
  type LlmRequestInput,
} from "../llm/resolve.js";
import type { EventBus } from "../events/types.js";
import type { Queue } from "../queue/types.js";
import { isRunActive, requestCancel } from "../committee/runner.js";
import { generateColdEmail } from "../outreach/coldEmail.js";
import { generateCoverLetter } from "../outreach/coverLetter.js";
import { generateInterviewMock } from "../interview/mock.js";
import { generateSophisticatedResume } from "../resume/engine.js";
import { detectRoleWithLlm } from "../resume/roleDetect.js";
import { resolveRoleSlug } from "../resume/roleRegistry.js";
import { resumeToMarkdown } from "../resume/serialize.js";
import type { ResumeTemplate } from "../resume/types.js";
import { removeDossier, writeDossier } from "../exports/dossier.js";

function newJobId(store: JobStore): string {
  return store.nextJobId();
}

export function createJobsRouter(
  store: JobStore,
  llm: LLMClient,
  config: AppConfig,
  bus: EventBus,
  queue: Queue,
  auditLogger: AuditLogger,
) {
  const router = new Hono();

  const tenantId = (c: { get: (key: "tenantId") => string }) => c.get("tenantId") ?? "default";

  function audit(
    c: { get: (key: "tenantId" | "apiKeyId") => string },
    action: Parameters<AuditLogger["log"]>[0]["action"],
    outcome: Parameters<AuditLogger["log"]>[0]["outcome"],
    message: string,
    resourceId?: string,
    metadata?: Record<string, unknown>,
  ) {
    auditLogger.log({
      timestamp: new Date().toISOString(),
      action,
      tenantId: c.get("tenantId") ?? "default",
      apiKeyId: c.get("apiKeyId"),
      outcome,
      message,
      resourceId,
      metadata,
    });
  }

  function resolveLlmClient(body: LlmRequestInput, ctxTenantId?: string): { client: LLMClient; error?: string } {
    return resolveLlmClientForRequest(store, config, llm, body, ctxTenantId);
  }

  router.post("/", zValidator("json", createJobSchema), async (c) => {
    const body = c.req.valid("json");
    const domain = body.domain === "AUTO"
      ? detectDomain(body.jobDescription) ?? "SDE"
      : body.domain ?? detectDomain(body.jobDescription) ?? "SDE";

    const resolved = resolveLlmClient(body, tenantId(c));
    if (resolved.error) {
      audit(c, "job.created", "failure", `LLM resolution failed: ${resolved.error}`);
      return c.json({ error: resolved.error }, 400);
    }
    const jobLlm = resolved.client;

    const roleSlug = body.roleSlug
      ? body.roleSlug
      : await detectRoleWithLlm(domain, body.jobDescription, jobLlm)
          .catch(() => resolveRoleSlug(domain, body.jobDescription));

    let profileId: string | undefined;
    if (body.profileId) {
      if (!store.getProfileById(body.profileId)) {
        audit(c, "job.created", "failure", "Profile not found", body.profileId);
        return c.json({ error: "Profile not found." }, 400);
      }
      profileId = body.profileId;
    } else {
      const master = store.getMasterProfile();
      if (master) profileId = master.id;
    }

    const job: JobState = {
      id: newJobId(store),
      tenantId: tenantId(c),
      domain,
      roleSlug,
      jobDescription: body.jobDescription,
      baseResume: body.baseResume,
      sectorFocus: body.sectorFocus,
      jobLocation: body.location,
      profileId,
      generate: body.generate,
      transcript: [],
      status: "pending",
      llmUsed: { provider: jobLlm.provider, model: jobLlm.model },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    store.create(job);

    await queue.enqueue({
      id: `committee:${job.id}`,
      type: "committee",
      payload: { jobId: job.id },
      tenantId: job.tenantId ?? "default",
      attempts: 0,
      maxAttempts: 2,
    });

    audit(c, "job.created", "success", "Committee evaluation queued", job.id, {
      domain,
      roleSlug,
      provider: jobLlm.provider,
      model: jobLlm.model,
    });

    return c.json(job, 202);
  });

  router.get("/", (c) => {
    const jobs = store.listRunSummaries(tenantId(c));
    return c.json({ jobs });
  });

  router.get("/:id", (c) => {
    const job = store.get(c.req.param("id"), tenantId(c));
    if (!job) return c.json({ error: "Job not found" }, 404);
    return c.json(job);
  });

  // PUT /api/jobs/:id/resume — persist manual edits made in the resume JSON
  // editor; the Markdown view is re-rendered server-side from the JSON.
  const resumeUpdateSchema = z.object({
    rewrittenResumeJson: z.string().min(2),
  });
  router.put("/:id/resume", zValidator("json", resumeUpdateSchema), (c) => {
    const job = store.get(c.req.param("id"), tenantId(c));
    if (!job) return c.json({ error: "Job not found" }, 404);
    const body = c.req.valid("json");
    try {
      const parsed = JSON.parse(body.rewrittenResumeJson) as ResumeTemplate;
      job.rewrittenResumeJson = JSON.stringify(parsed, null, 2);
      job.rewrittenResume = resumeToMarkdown(parsed);
    } catch {
      return c.json({ error: "Invalid resume JSON." }, 400);
    }
    job.updatedAt = new Date().toISOString();
    store.update(job);
    writeDossier(job, config.exportsDir);
    return c.json(job);
  });

  // POST /api/jobs/:id/resume/generate — explicit, on-demand resume generation
  // (the SME panel stops after the blueprint; the user chooses the moment).
  const resumeGenerateSchema = z.object({
    roleSlug: z.string().min(1).max(60).optional(),
    enhancementTier: z.enum(["conservative", "balanced", "competitive"]).optional(),
    llm: llmOverrideSchema.optional(),
    llmConnectionId: z.string().min(1).max(80).optional(),
  });
  router.post("/:id/resume/generate", zValidator("json", resumeGenerateSchema), async (c) => {
    const job = store.get(c.req.param("id"), tenantId(c));
    if (!job) return c.json({ error: "Job not found" }, 404);
    if (job.status !== "completed") {
      return c.json({ error: "The SME panel must finish before a resume can be generated." }, 400);
    }
    if (!job.blueprint) {
      return c.json({ error: "No blueprint yet; the debate did not produce one." }, 400);
    }

    const body = c.req.valid("json");
    const resolved = resolveLlmClient(body, tenantId(c));
    if (resolved.error) {
      audit(c, "resume.generated", "failure", `LLM resolution failed: ${resolved.error}`, job.id);
      return c.json({ error: resolved.error }, 400);
    }

    const roleSlug = body.roleSlug ?? job.roleSlug;
    const generate = body.enhancementTier
      ? { ...job.generate, enhancementTier: body.enhancementTier }
      : job.generate;
    const profile =
      (job.profileId ? store.getProfileById(job.profileId) : undefined) ?? undefined;

    try {
      const result = await generateSophisticatedResume(
        { ...job, roleSlug, generate },
        job.blueprint,
        resolved.client,
        profile ?? undefined,
      );
      job.rewrittenResume = result.markdown;
      job.rewrittenResumeJson = result.json;
      job.resumeMeta = result.meta;
      job.updatedAt = new Date().toISOString();
      store.update(job);
      writeDossier(job, config.exportsDir);
      bus.publish({
        type: "resume",
        jobId: job.id,
        rewrittenResume: result.markdown,
        rewrittenResumeJson: result.json,
        resumeMeta: result.meta,
      });
      audit(c, "resume.generated", "success", "Resume generated", job.id, {
        provider: resolved.client.provider,
        model: resolved.client.model,
        moderationApproved: result.meta.moderationApproved,
      });
      return c.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      audit(c, "resume.generated", "failure", message, job.id);
      return c.json({ error: message }, 500);
    }
  });

  // GET /api/jobs/:id/stream — Server-Sent Events: live debate transcript
  router.get("/:id/stream", (c) => {
    const jobId = c.req.param("id");
    const job = store.get(jobId, tenantId(c));
    if (!job) return c.json({ error: "Job not found" }, 404);

    const isActive = () =>
      isRunActive(jobId) || job.status === "pending" || job.status === "debating";

    return streamSSE(c, async (stream) => {
      // Snapshot: replay the current state so late subscribers catch up.
      await stream.writeSSE({
        event: "job",
        data: JSON.stringify({ job: store.get(jobId, tenantId(c)) }),
      });

      // Subscribe before checking liveness so the bus can replay events that
      // were published while the worker was processing asynchronously.
      const unsubscribe = bus.subscribe(jobId, (event) => {
        void stream.writeSSE({ event: event.type, data: JSON.stringify(event) });
      });
      stream.onAbort(() => unsubscribe());

      // Close immediately for runs that are not being processed right now:
      // finished runs, and orphaned runs whose backend process restarted
      // mid-debate. Otherwise every open run page would hold an SSE connection
      // open forever (pings every 15s), which eventually exhausts the browser's
      // per-host connection pool and makes new requests hang.
      if (!isActive()) {
        await stream.writeSSE({
          event: "done",
          data: JSON.stringify({ job: store.get(jobId, tenantId(c)) }),
        });
        unsubscribe();
        return;
      }

      while (true) {
        await stream.sleep(15_000);
        // The runner publishes "done" itself on success; this is a safety net
        // for cases where the runner vanished without publishing it.
        if (!isActive()) {
          await stream.writeSSE({
            event: "done",
            data: JSON.stringify({ job: store.get(jobId, tenantId(c)) }),
          });
          unsubscribe();
          return;
        }
        await stream.writeSSE({ event: "ping", data: "{}" });
      }
    });
  });

  // POST /api/jobs/:id/cold-email — killer cold-email intro for the application
  const coldEmailRequestSchema = z.object({
    audience: coldEmailAudienceSchema.optional(),
    tone: z.string().max(60).optional(),
    targetName: z.string().max(80).optional(),
    llm: llmOverrideSchema.optional(),
    llmConnectionId: z.string().min(1).max(80).optional(),
  });
  router.post("/:id/cold-email", zValidator("json", coldEmailRequestSchema), async (c) => {
    const job = store.get(c.req.param("id"), tenantId(c));
    if (!job) return c.json({ error: "Job not found" }, 404);

    const body = c.req.valid("json");
    const resolved = resolveLlmClient(body, tenantId(c));
    if (resolved.error) {
      audit(c, "cold_email.generated", "failure", `LLM resolution failed: ${resolved.error}`, job.id);
      return c.json({ error: resolved.error }, 400);
    }

    const profile = (job.profileId ? store.getProfileById(job.profileId) : undefined) ?? undefined;
    const draft = await generateColdEmail(
      job,
      resolved.client,
      { audience: body.audience, tone: body.tone, targetName: body.targetName },
      profile,
    );
    audit(c, "cold_email.generated", "success", "Cold email generated", job.id);
    return c.json(draft);
  });

  // POST /api/jobs/:id/cover-letter — cover-letter draft for the application
  const coverLetterRequestSchema = z.object({
    llm: llmOverrideSchema.optional(),
    llmConnectionId: z.string().min(1).max(80).optional(),
  });
  router.post("/:id/cover-letter", zValidator("json", coverLetterRequestSchema), async (c) => {
    const job = store.get(c.req.param("id"), tenantId(c));
    if (!job) return c.json({ error: "Job not found" }, 404);

    const body = c.req.valid("json");
    const resolved = resolveLlmClient(body, tenantId(c));
    if (resolved.error) {
      audit(c, "cover_letter.generated", "failure", `LLM resolution failed: ${resolved.error}`, job.id);
      return c.json({ error: resolved.error }, 400);
    }

    const profile = (job.profileId ? store.getProfileById(job.profileId) : undefined) ?? undefined;
    const draft = await generateCoverLetter(job, resolved.client, profile);
    audit(c, "cover_letter.generated", "success", "Cover letter generated", job.id);
    return c.json(draft);
  });

  // POST /api/jobs/:id/interview-mock — interview prep plan
  const interviewMockRequestSchema = z.object({
    llm: llmOverrideSchema.optional(),
    llmConnectionId: z.string().min(1).max(80).optional(),
  });
  router.post("/:id/interview-mock", zValidator("json", interviewMockRequestSchema), async (c) => {
    const job = store.get(c.req.param("id"), tenantId(c));
    if (!job) return c.json({ error: "Job not found" }, 404);

    const body = c.req.valid("json");
    const resolved = resolveLlmClient(body, tenantId(c));
    if (resolved.error) {
      audit(c, "interview.generated", "failure", `LLM resolution failed: ${resolved.error}`, job.id);
      return c.json({ error: resolved.error }, 400);
    }

    const profile = (job.profileId ? store.getProfileById(job.profileId) : undefined) ?? undefined;
    const plan = await generateInterviewMock(job, resolved.client, profile);
    audit(c, "interview.generated", "success", "Interview prep plan generated", job.id);
    return c.json(plan);
  });

  // POST /api/jobs/:id/cancel — terminate a live run. Cooperative: the
  // in-flight agent call finishes, then the run stops at the next boundary and
  // the job is marked "cancelled" over SSE.
  router.post("/:id/cancel", (c) => {
    const jobId = c.req.param("id");
    const job = store.get(jobId, tenantId(c));
    if (!job) return c.json({ error: "Job not found" }, 404);
    if (!isRunActive(jobId)) {
      return c.json(
        { error: "This run is not being processed right now, so it cannot be cancelled." },
        409,
      );
    }
    requestCancel(jobId);
    audit(c, "job.cancelled", "success", "Run cancellation requested", jobId);
    return c.json({ cancelled: true, jobId });
  });

  router.delete("/:id", (c) => {
    const jobId = c.req.param("id");
    const deleted = store.delete(jobId, tenantId(c));
    if (!deleted) return c.json({ error: "Job not found" }, 404);
    removeDossier(jobId, config.exportsDir);
    audit(c, "job.deleted", "success", "Run deleted", jobId);
    return c.body(null, 204);
  });

  router.patch("/:id/amendment-notes", async (c) => {
    const jobId = c.req.param("id");
    const job = store.get(jobId, tenantId(c));
    if (!job) return c.json({ error: "Job not found" }, 404);
    const body = await c.req.json<{ amendmentNotes?: string }>();
    job.amendmentNotes = typeof body.amendmentNotes === "string" ? body.amendmentNotes : "";
    job.updatedAt = new Date().toISOString();
    store.update(job);
    return c.json({ ok: true });
  });

  return router;
}
