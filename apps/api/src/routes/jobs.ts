import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import {
  createJobSchema,
  detectDomain,
  type CreateJobInput,
  type JobState,
} from "@rattlesnake/shared";
import type { AppConfig } from "../config.js";
import type { JobStore } from "../db/store.js";
import { createLLMClient, type LLMClient } from "../llm/client.js";
import { bus } from "../events/bus.js";
import { runCommittee } from "../committee/runner.js";
import { resumeToMarkdown } from "../resume/serialize.js";
import type { ResumeTemplate } from "../resume/types.js";

function newJobId(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  );
}

/** Creates the job routes bound to the shared store + LLM client. */
export function createJobsRouter(store: JobStore, llm: LLMClient, config: AppConfig) {
  const router = new Hono();

  // POST /api/jobs — create + start a committee evaluation
  router.post("/", zValidator("json", createJobSchema), async (c) => {
    const body = c.req.valid("json") as CreateJobInput;
    const domain = body.domain ?? detectDomain(body.jobDescription) ?? "SWE";

    // Bring-your-own-LLM comes from one of two mutually exclusive sources:
    // an inline `llm` override (key over the wire, never stored) or a stored
    // `llmConnectionId` (key decrypted server-side, never sent to the client).
    let jobLlm = llm;
    const hasInline = body.llm !== undefined && Object.keys(body.llm).length > 0;
    if (hasInline && body.llmConnectionId) {
      return c.json(
        { error: "Provide either `llm` or `llmConnectionId`, not both." },
        400,
      );
    }

    let llmConfig = config.llm;
    if (body.llmConnectionId) {
      const conn = store.getLlmConnectionWithKey(body.llmConnectionId);
      if (!conn) {
        return c.json({ error: "LLM connection not found." }, 400);
      }
      llmConfig = {
        ...config.llm,
        provider: conn.provider,
        baseUrl: conn.baseUrl || config.llm.baseUrl,
        apiKey: conn.apiKey || config.llm.apiKey || "",
        model: conn.model || config.llm.model,
        temperature: conn.temperature ?? config.llm.temperature,
      };
    } else if (hasInline) {
      llmConfig = {
        ...config.llm,
        ...body.llm,
        // A user who supplies an endpoint/key but no provider name gets the
        // generic OpenAI-compatible client instead of silently falling back
        // to the server's default provider (which may be the offline mock).
        provider:
          body.llm!.provider ??
          (config.llm.provider !== "mock" ? config.llm.provider : "custom"),
      };
    }

    if (body.llmConnectionId || hasInline) {
      try {
        jobLlm = createLLMClient({ ...config, llm: llmConfig });
      } catch (err) {
        return c.json(
          { error: err instanceof Error ? err.message : String(err) },
          400,
        );
      }
    }

    const job: JobState = {
      id: newJobId(),
      domain,
      jobDescription: body.jobDescription,
      baseResume: body.baseResume,
      sectorFocus: body.sectorFocus,
      jobLocation: body.location,
      transcript: [],
      status: "pending",
      llmUsed: { provider: jobLlm.provider, model: jobLlm.model },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    store.create(job);

    // Fire-and-forget: the runner publishes progress over SSE and persists
    // every state change, so the client can stream the live debate.
    void runCommittee(job.id, store, jobLlm, config);

    return c.json(job, 202);
  });

  // GET /api/jobs — list evaluations (compact: no resume/transcript bodies)
  router.get("/", (c) => {
    const jobs = store
      .list()
      .map(({ baseResume: _r, transcript, jobDescription: _jd, ...summary }) => ({
        ...summary,
        transcriptLength: transcript.length,
      }));
    return c.json({ jobs });
  });

  // GET /api/jobs/:id — full evaluation state
  router.get("/:id", (c) => {
    const job = store.get(c.req.param("id"));
    if (!job) return c.json({ error: "Job not found" }, 404);
    return c.json(job);
  });

  // PUT /api/jobs/:id/resume — persist manual edits made in the resume JSON
  // editor; the Markdown view is re-rendered server-side from the JSON.
  const resumeUpdateSchema = z.object({
    rewrittenResumeJson: z.string().min(2),
  });
  router.put("/:id/resume", zValidator("json", resumeUpdateSchema), (c) => {
    const job = store.get(c.req.param("id"));
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
    return c.json(job);
  });

  // GET /api/jobs/:id/stream — Server-Sent Events: live debate transcript
  router.get("/:id/stream", (c) => {
    const jobId = c.req.param("id");
    const job = store.get(jobId);
    if (!job) return c.json({ error: "Job not found" }, 404);

    return streamSSE(c, async (stream) => {
      // Snapshot: replay the current state so late subscribers catch up.
      await stream.writeSSE({
        event: "job",
        data: JSON.stringify({ job: store.get(jobId) }),
      });

      const unsubscribe = bus.subscribe(jobId, (event) => {
        void stream.writeSSE({ event: event.type, data: JSON.stringify(event) });
      });
      stream.onAbort(() => unsubscribe());

      while (true) {
        await stream.sleep(15_000);
        await stream.writeSSE({ event: "ping", data: "{}" });
      }
    });
  });

  // DELETE /api/jobs/:id
  router.delete("/:id", (c) => {
    const deleted = store.delete(c.req.param("id"));
    return deleted ? c.body(null, 204) : c.json({ error: "Job not found" }, 404);
  });

  return router;
}
