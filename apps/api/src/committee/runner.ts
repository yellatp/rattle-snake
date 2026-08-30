import {
  getCommitteeForDomain,
  isSpecificSector,
  selectPanel,
  type DebatePhase,
  type JobState,
} from "@rattlesnake/shared";
import type { AppConfig } from "../config.js";
import type { JobStore } from "../db/store.js";
import type { LLMClient } from "../llm/client.js";
import { bus as defaultBus } from "../events/bus.js";
import type { EventBus } from "../events/types.js";
import { aggregateVotes, runDebate } from "./debateEngine.js";
import { executeAgentTurn } from "./agentExecutor.js";
import { extractBlueprint } from "./blueprintExtractor.js";
import { runDirectorReview } from "./directorReview.js";
import { extractJdMeta } from "./jdMetaExtractor.js";
import { extractJobDecomposition } from "./jobDecomposition.js";
import { executiveForRole, runExecutiveReview } from "./executiveReview.js";
import { applyComputedWeights } from "./weighting.js";
import { runGenerateChain } from "./generateChain.js";
import { runGapAnalysis } from "./gapAnalysis.js";
import { estimateExperienceYears } from "../resume/experience.js";
import { writeDossier } from "../exports/dossier.js";

/**
 * End-to-end SME panel orchestration for one job:
 *
 *   jdMeta extraction (company/role/sector/location/team from the JD)
 *   -> job decomposition (structured role brief shared by every seat)
 *   -> committee selection with derived seat weights (Phase 1)
 *   -> debate (round 1: 360-degree analysis + openings -> cross-talk -> ballot)
 *   -> weighted consensus
 *   -> blueprint extraction
 *   -> advisory executive review (CTO/CFO/CMO/... opinion, never overrides)
 *   -> done (artifacts stay on-demand unless the request asked for chained
 *      auto-generation, which then runs resume -> cold email -> interview)
 *
 * Every state change is persisted to the store and published to the SSE bus
 * so the frontend can stream the live panel.
 */

// Jobs currently being processed by this process. SSE streams use this to
// distinguish a genuinely live run from an orphaned one (e.g. a run whose
// backend process restarted mid-debate) so they can close instead of holding
// a connection open forever.
const activeRuns = new Set<string>();

// Jobs the user asked to terminate. Cooperative cancellation: the in-flight
// LLM call finishes, then the run stops at the next stage/seat boundary.
const cancelRequested = new Set<string>();

/** Thrown inside the runner when the user terminated a run. */
export class RunCancelledError extends Error {
  constructor(jobId: string) {
    super(`Run ${jobId} cancelled by user`);
    this.name = "RunCancelledError";
  }
}

export function isRunActive(jobId: string): boolean {
  return activeRuns.has(jobId);
}

/**
 * Ask the current process to terminate a running job. Returns false when the
 * job is not being processed by this process (already finished or running on a
 * different instance), in which case the caller should surface a 409.
 */
export function requestCancel(jobId: string): boolean {
  if (!activeRuns.has(jobId)) return false;
  cancelRequested.add(jobId);
  return true;
}

export async function runCommittee(
  jobId: string,
  store: JobStore,
  llm: LLMClient,
  config: AppConfig,
  eventBus: EventBus = defaultBus,
): Promise<void> {
  activeRuns.add(jobId);
  cancelRequested.delete(jobId);
  try {
    const job = store.get(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

  const setStatus = (status: JobState["status"], message?: string) => {
    job.status = status;
    job.error = message;
    job.updatedAt = new Date().toISOString();
    persist();
    eventBus.publish({ type: "status", jobId, status, message });
  };

  // Persist + stream the live stage of the run so the phase tracker always
  // reflects the current step, even after a page refresh.
  const setPhase = (phase: DebatePhase, activity?: string) => {
    job.phase = phase;
    job.activity = activity;
    job.updatedAt = new Date().toISOString();
    persist();
    eventBus.publish({ type: "phase", jobId, phase, activity });
  };

  // Full-row writes would clobber user edits made while the run is active
  // (amendment notes, resume JSON edits). Re-merge those user-owned fields
  // from the store before every persist so concurrent edits survive.
  const persist = () => {
    const fresh = store.get(jobId);
    if (fresh) {
      job.amendmentNotes = fresh.amendmentNotes;
      job.rewrittenResume = fresh.rewrittenResume;
      job.rewrittenResumeJson = fresh.rewrittenResumeJson;
      job.resumeMeta = fresh.resumeMeta;
    }
    store.update(job);
  };

  // Cooperative cancellation check between every expensive step.
  const check = () => {
    if (cancelRequested.has(jobId)) throw new RunCancelledError(jobId);
  };

  try {
    setStatus("debating");
    setPhase("jdMeta", "Extracting JD metadata and understanding the company");

    const jdMeta = await extractJdMeta(job, llm);
    check();
    job.jdMeta = jdMeta;
    if (!job.jobLocation && jdMeta.location) job.jobLocation = jdMeta.location;
    job.updatedAt = new Date().toISOString();
    persist();
    eventBus.publish({ type: "jdMeta", jobId, jdMeta });

    setPhase("decomposition", "Decomposing the role into a structured brief");
    const jobDecomposition = await extractJobDecomposition(
      {
        jobDescription: job.jobDescription,
        domain: job.domain,
        roleSlug: job.roleSlug ?? jdMeta.roleSlug,
        jdMeta,
      },
      llm,
    );
    check();
    job.jobDecomposition = jobDecomposition;
    job.updatedAt = new Date().toISOString();
    persist();
    eventBus.publish({ type: "jobDecomposition", jobId, jobDecomposition });

    setPhase("panel", "Assembling the committee and setting seat weights");
    const profile = job.profileId ? store.getProfileById(job.profileId) ?? undefined : undefined;
    const experienceYears = estimateExperienceYears(profile, job.baseResume);
    const sectorText = jdMeta.sector ?? job.sectorFocus;

    // Full 6-seat committee is the source of any Staff/Principal seats the band
    // filter removes (Layer 1 level-aware panel, plan section 4).
    const fullCommittee = getCommitteeForDomain(
      job.domain,
      job.sectorFocus ?? jdMeta.sector,
      job.roleSlug ?? jdMeta.roleSlug,
    );
    const bandAgents = getCommitteeForDomain(
      job.domain,
      job.sectorFocus ?? jdMeta.sector,
      job.roleSlug ?? jdMeta.roleSlug,
      experienceYears,
    );
    const { agents: panelAgents, forcedTopics } = selectPanel(bandAgents, fullCommittee, {
      jdLevel: jobDecomposition.level,
      baseResumeTitle: job.baseResume.split("\n")[0]?.trim(),
      experienceYears,
      includeSectorSpecialist: isSpecificSector(sectorText),
    });

    const agents = applyComputedWeights(panelAgents, {
      domain: job.domain,
      roleSlug: job.roleSlug ?? jdMeta.roleSlug,
      experienceYears,
      sectorText: jdMeta.sector,
    });

    const result = await runDebate(job, agents, llm, {
      crossTalkRounds: config.debate.crossTalkRounds,
      agentMaxRetries: config.debate.agentMaxRetries,
      shouldStop: () => check(),
      sectorFocus: job.sectorFocus ?? jdMeta.sector,
      hasSectorSpecialist: agents.some((a) => a.isSectorSpecialist),
      forcedTopics,
      onActivity: async (phase, activity) => setPhase(phase, activity),
      onEntry: async (entry) => {
        job.transcript.push(entry);
        job.updatedAt = new Date().toISOString();
        persist();
        eventBus.publish({ type: "entry", jobId, entry });
      },
      onAnalysis: async (analysis) => {
        job.analyses = [...(job.analyses ?? []), analysis];
        job.updatedAt = new Date().toISOString();
        persist();
        eventBus.publish({ type: "analysis", jobId, analysis });
      },
    });
    check();

    // Layer 2 — Director fairness audit (plan §5). Runs after the ballot,
    // before the verdict is finalized. A failure here is isolated: the run
    // completes with the original ballot. The Director can force ONE targeted
    // re-ballot on a single material factor, but can never flip the verdict
    // itself — the committee re-casts it.
    let finalResult = result;
    setPhase("director", "Running the Director fairness audit");
    const audit = await runDirectorReview(
      {
        domain: job.domain,
        jobDescription: job.jobDescription,
        baseResume: job.baseResume,
        sectorFocus: job.sectorFocus ?? jdMeta.sector,
        jobDecomposition: job.jobDecomposition,
        transcript: job.transcript,
        consensus: result.consensus,
        tallies: result.tallies,
      },
      llm,
    );
    check();
    if (audit) {
      job.directorAudit = audit;
      job.updatedAt = new Date().toISOString();
      persist();
      eventBus.publish({ type: "director", jobId, audit });

      if (audit.revoteFactor) {
        setPhase("director", `Re-ballot: re-testing "${audit.revoteFactor}"`);
        const directive = `The Director flagged the "${audit.revoteFactor}" factor as materially unfair. Re-examine your FINAL vote against the transcript with this factor front and center, then cast a decisive [VERDICT].`;
        const ballotEntries: Awaited<ReturnType<typeof executeAgentTurn>>[] = [];
        for (const agent of agents) {
          setPhase("director", `${agent.name} is re-casting their vote on "${audit.revoteFactor}"`);
          ballotEntries.push(
            await executeAgentTurn({
              llm,
              job: { ...job, transcript: job.transcript },
              agent,
              phase: "ballot",
              maxRetries: config.debate.agentMaxRetries,
              temperature: 0.2,
              sectorFocus: job.sectorFocus ?? jdMeta.sector,
              hasSectorSpecialist: agents.some((a) => a.isSectorSpecialist),
              forcedTopics,
              instruction: directive,
            }),
          );
        }
        for (const turn of ballotEntries) {
          job.transcript.push(turn.entry);
          job.updatedAt = new Date().toISOString();
          persist();
          eventBus.publish({ type: "entry", jobId, entry: turn.entry });
        }
        finalResult = { ...result, ...aggregateVotes(agents, job.transcript) };
      }
    }

    job.finalVerdict = finalResult.consensus;
    job.updatedAt = new Date().toISOString();
    persist();
    eventBus.publish({
      type: "verdict",
      jobId,
      verdict: finalResult.consensus,
      tallies: finalResult.tallies,
    });

    setPhase("blueprint", "Synthesizing the committee blueprint");
    const blueprint = await extractBlueprint(job, job.transcript, llm);
    check();
    job.blueprint = blueprint;
    job.updatedAt = new Date().toISOString();
    persist();
    eventBus.publish({ type: "blueprint", jobId, blueprint });

    // Advisory executive review (plan §3.6). Runs after the blueprint, before
    // "completed". A failure here is isolated: the run completes and the report
    // simply shows that no executive opinion was produced.
    setPhase("executive", "Preparing the advisory executive review");
    try {
      const review = await runExecutiveReview(
        {
          persona: executiveForRole(job.roleSlug ?? jdMeta.roleSlug, job.domain),
          company: jdMeta.company,
          domain: job.domain,
          jobDescription: job.jobDescription,
          baseResume: job.baseResume,
          jobDecomposition: job.jobDecomposition,
          transcript: job.transcript,
          consensus: finalResult.consensus,
          tallies: finalResult.tallies,
          blueprint,
        },
        llm,
      );
      check();
      if (review) {
        job.executiveReview = review;
        job.updatedAt = new Date().toISOString();
        persist();
        eventBus.publish({ type: "executive", jobId, review });
      }
    } catch (err) {
      if (err instanceof RunCancelledError) throw err;
      console.error(
        `[committee] executive review failed for job ${jobId} (advisory, ignored):`,
        err,
      );
    }

    // Gap analysis: structured assessment of candidate fit + enhancement
    // suggestions. Runs after executive review, before "completed". Advisory:
    // a failure here is isolated like executive review.
    setPhase("gapAnalysis", "Analyzing gaps and drafting enhancement suggestions");
    // Pick up amendment notes the user may have saved mid-run.
    const freshNotes = store.get(jobId);
    if (freshNotes) job.amendmentNotes = freshNotes.amendmentNotes;
    try {
      const gapResult = await runGapAnalysis(job, blueprint, llm);
      check();
      if (gapResult) {
        job.gapAnalysis = gapResult;
        job.updatedAt = new Date().toISOString();
        persist();
        eventBus.publish({ type: "gapAnalysis", jobId, gapAnalysis: gapResult });
      }
    } catch (err) {
      if (err instanceof RunCancelledError) throw err;
      console.error(
        `[committee] gap analysis failed for job ${jobId} (advisory, ignored):`,
        err,
      );
    }

    setStatus("completed");
    setPhase("done", "Committee run complete");

    // Chained auto-generation: when the request asked for any artifact, run it
    // in order (resume -> cold email -> interview) and stream each over SSE.
    // `done` is published last so subscribers receive one final state snapshot
    // that already includes every generated artifact.
    if (job.generate?.resume || job.generate?.coldEmail || job.generate?.interview) {
      check();
      setPhase("chain", "Generating the requested artifacts");
      await runGenerateChain(jobId, store, llm, job.generate);
    }
    eventBus.publish({ type: "done", jobId, job: store.get(jobId)! });
  } catch (err) {
    if (err instanceof RunCancelledError) {
      console.log(`[committee] job ${jobId} cancelled by user`);
      job.status = "cancelled";
      job.error = "Run cancelled by the user.";
      job.phase = "done";
      job.activity = "Run cancelled";
      job.updatedAt = new Date().toISOString();
      persist();
      eventBus.publish({
        type: "status",
        jobId,
        status: "cancelled",
        message: "Run cancelled by the user.",
      });
      eventBus.publish({ type: "phase", jobId, phase: "done", activity: "Run cancelled" });
      eventBus.publish({ type: "done", jobId, job: store.get(jobId)! });
    } else {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[committee] job ${jobId} failed:`, err);
      setStatus("failed", message);
      eventBus.publish({ type: "error", jobId, message });
    }
  }
  } finally {
    activeRuns.delete(jobId);
    cancelRequested.delete(jobId);
    // Auto-save whatever exists so the run's discussion (+ resume when chained
    // generation produced one) is always browsable as Markdown/JSON files.
    const saved = store.get(jobId);
    if (saved) writeDossier(saved, config.exportsDir);
  }
}
