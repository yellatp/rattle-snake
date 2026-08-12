import {
  getCommitteeForDomain,
  type JobState,
} from "@rattlesnake/shared";
import type { AppConfig } from "../config.js";
import type { JobStore } from "../db/store.js";
import type { LLMClient } from "../llm/client.js";
import { bus } from "../events/bus.js";
import { runDebate } from "./debateEngine.js";
import { extractBlueprint } from "./blueprintExtractor.js";
import { rewriteResume } from "./resumeRewriter.js";

/**
 * End-to-end committee orchestration for one job:
 *
 *   debate (round 1 openings -> cross-talk -> ballot)
 *   -> weighted consensus
 *   -> blueprint extraction
 *   -> objection-clearing resume rewrite
 *
 * Every state change is persisted to the store and published to the SSE bus
 * so the frontend can stream the live debate.
 */
export async function runCommittee(
  jobId: string,
  store: JobStore,
  llm: LLMClient,
  config: AppConfig,
): Promise<void> {
  const job = store.get(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);

  const agents = getCommitteeForDomain(job.domain, job.sectorFocus);

  const setStatus = (status: JobState["status"], message?: string) => {
    job.status = status;
    job.error = message;
    job.updatedAt = new Date().toISOString();
    store.update(job);
    bus.publish({ type: "status", jobId, status, message });
  };

  try {
    setStatus("debating");

    const result = await runDebate(job, agents, llm, {
      crossTalkRounds: config.debate.crossTalkRounds,
      agentMaxRetries: config.debate.agentMaxRetries,
      onEntry: async (entry) => {
        job.transcript.push(entry);
        job.updatedAt = new Date().toISOString();
        store.update(job);
        bus.publish({ type: "entry", jobId, entry });
      },
    });

    job.finalVerdict = result.consensus;
    job.updatedAt = new Date().toISOString();
    store.update(job);
    bus.publish({
      type: "verdict",
      jobId,
      verdict: result.consensus,
      tallies: result.tallies,
    });

    setStatus("rewriting");

    const blueprint = await extractBlueprint(job, job.transcript, llm);
    job.blueprint = blueprint;
    job.updatedAt = new Date().toISOString();
    store.update(job);
    bus.publish({ type: "blueprint", jobId, blueprint });

    const rewrittenResume = await rewriteResume(job, blueprint, llm);
    job.rewrittenResume = rewrittenResume;
    job.updatedAt = new Date().toISOString();
    store.update(job);
    bus.publish({ type: "resume", jobId, rewrittenResume });

    setStatus("completed");
    bus.publish({ type: "done", jobId, job: store.get(jobId)! });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[committee] job ${jobId} failed:`, err);
    setStatus("failed", message);
    bus.publish({ type: "error", jobId, message });
  }
}
