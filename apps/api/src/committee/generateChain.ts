import type { GenerateOptions, JobState } from "@rattlesnake/shared";
import type { JobStore } from "../db/store.js";
import type { LLMClient } from "../llm/client.js";
import { bus as defaultBus } from "../events/bus.js";
import type { EventBus } from "../events/types.js";
import { generateSophisticatedResume } from "../resume/engine.js";
import { generateColdEmail } from "../outreach/coldEmail.js";
import { generateCoverLetter } from "../outreach/coverLetter.js";
import { generateInterviewMock } from "../interview/mock.js";

/**
 * Chained auto-generation for one completed job.
 *
 * Runs the requested artifacts in order (resume -> cover letter -> cold email
 * -> interview), persisting each to the job and publishing the matching SSE
 * event so clients can stream them live. One failed stage is isolated: the
 * error is reported and the remaining stages still run. A job with no flags is
 * a no-op.
 */
export async function runGenerateChain(
  jobId: string,
  store: JobStore,
  llm: LLMClient,
  requested: GenerateOptions,
  eventBus: EventBus = defaultBus,
): Promise<void> {
  const job = store.get(jobId);
  if (!job || job.status !== "completed" || !job.blueprint) return;
  const profile = job.profileId ? store.getProfileById(job.profileId) ?? undefined : undefined;

  const persist = (apply: (job: JobState) => void) => {
    apply(job);
    job.updatedAt = new Date().toISOString();
    store.update(job);
  };

  const stage = async (label: string, run: () => Promise<void>) => {
    try {
      await run();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[chain] ${label} failed for job ${jobId}:`, err);
      eventBus.publish({ type: "error", jobId, message: `${label} generation failed: ${message}` });
    }
  };

  const stages: Promise<void>[] = [];

  if (requested.resume) {
    stages.push(
      stage("resume", async () => {
        const result = await generateSophisticatedResume({ ...job }, job.blueprint!, llm, profile);
        persist((j) => {
          j.rewrittenResume = result.markdown;
          j.rewrittenResumeJson = result.json;
          j.resumeMeta = result.meta;
        });
        eventBus.publish({
          type: "resume",
          jobId,
          rewrittenResume: result.markdown,
          rewrittenResumeJson: result.json,
          resumeMeta: result.meta,
        });
      }),
    );
  }

  if (requested.coverLetter) {
    stages.push(
      stage("cover letter", async () => {
        const draft = await generateCoverLetter(job, llm, profile);
        persist((j) => {
          j.coverLetterDraft = draft;
        });
        eventBus.publish({ type: "coverLetter", jobId, draft });
      }),
    );
  }

  if (requested.coldEmail) {
    stages.push(
      stage("cold email", async () => {
        const draft = await generateColdEmail(job, llm, { audience: "recruiter" }, profile);
        persist((j) => {
          j.coldEmailDraft = draft;
        });
        eventBus.publish({ type: "coldEmail", jobId, draft });
      }),
    );
  }

  if (requested.interview) {
    stages.push(
      stage("interview mock", async () => {
        const plan = await generateInterviewMock(job, llm, profile);
        persist((j) => {
          j.interviewPlan = plan;
        });
        eventBus.publish({ type: "interview", jobId, plan });
      }),
    );
  }

  await Promise.allSettled(stages);
}
