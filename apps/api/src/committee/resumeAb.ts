import {
  resumeEvaluationSchema,
  type ResumeAbPhase,
  type ResumeEvaluationInput,
} from "@rattlesnake/shared";
import type { EventBus } from "../events/types.js";
import type { JobStore } from "../db/store.js";
import type { LLMClient } from "../llm/types.js";
import type { ResumeTemplate } from "../resume/types.js";
import {
  generateSophisticatedResume,
  type ResumeEngineOptions,
} from "../resume/engine.js";
import {
  checkNetNewClaims,
  computeComparison,
  evaluateResume,
} from "./resumeReview.js";

/**
 * Resume A/B orchestration (design plan R2). Every step persists before the
 * next begins and the cursor (`job.abPhase`) advances with it, so a crash or
 * queue retry resumes from persisted state instead of redoing LLM work:
 *
 *   v1 (reuse the existing generated resume, or generate it)
 *     -> eval1 (3 reviewer seats, same rubric)
 *     -> v2 (engine second pass: v1 template + eval findings, moderator gate)
 *     -> eval2 (same panel, same rubric)
 *     -> comparison (deterministic, in code) -> done
 *
 * Reviewers are blind to the verdict; the LLM never picks the winner.
 */

const ACTIVE_AB_RUNS = new Set<string>();

export function isResumeAbActive(jobId: string): boolean {
  return ACTIVE_AB_RUNS.has(jobId);
}

export async function runResumeAb(
  jobId: string,
  store: JobStore,
  llm: LLMClient,
  bus: EventBus,
): Promise<void> {
  if (ACTIVE_AB_RUNS.has(jobId)) {
    throw new Error(`An A/B review for ${jobId} is already running.`);
  }
  ACTIVE_AB_RUNS.add(jobId);
  try {
    await runSteps(jobId, store, llm, bus);
  } catch (err) {
    bus.publish({
      type: "error",
      jobId,
      message: `A/B review failed: ${err instanceof Error ? err.message : String(err)}`,
    });
    throw err;
  } finally {
    ACTIVE_AB_RUNS.delete(jobId);
  }
}

async function runSteps(
  jobId: string,
  store: JobStore,
  llm: LLMClient,
  bus: EventBus,
): Promise<void> {
  const load = () => {
    const job = store.get(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);
    return job;
  };

  const setPhase = (phase: ResumeAbPhase) => {
    const job = load();
    job.abPhase = phase;
    job.updatedAt = new Date().toISOString();
    store.update(job);
  };

  let job = load();
  const blueprint = job.blueprint;
  if (job.status !== "completed" || !blueprint) {
    throw new Error("The committee run must be completed with a blueprint before an A/B review.");
  }

  // ---- v1 -----------------------------------------------------------------
  setPhase("v1");
  job = load();
  const existingV1 = store.getResumeVersion(jobId, 1, job.tenantId);
  let v1Json: string;
  let v1Markdown: string;
  if (existingV1) {
    v1Json = existingV1.templateJson;
    v1Markdown = existingV1.markdown;
  } else if (job.rewrittenResumeJson) {
    v1Json = job.rewrittenResumeJson;
    v1Markdown = job.rewrittenResume ?? v1Json;
    store.saveResumeVersion({
      jobId,
      tenantId: job.tenantId,
      version: 1,
      templateJson: v1Json,
      markdown: v1Markdown,
      metaJson: job.resumeMeta ? JSON.stringify(job.resumeMeta) : undefined,
    });
  } else {
    const profile = job.profileId ? store.getProfileById(job.profileId) ?? undefined : undefined;
    const result = await generateSophisticatedResume(job, blueprint, llm, profile);
    v1Json = result.json;
    v1Markdown = result.markdown;
    store.saveResumeVersion({
      jobId,
      tenantId: job.tenantId,
      version: 1,
      templateJson: v1Json,
      markdown: v1Markdown,
    });
  }

  // ---- eval1 --------------------------------------------------------------
  setPhase("eval1");
  let v1Eval = readEvaluation(store.getResumeVersion(jobId, 1, job.tenantId)?.evaluationJson);
  if (!v1Eval) {
    v1Eval = await evaluateResume(job, v1Json, llm);
    store.setResumeEvaluation(jobId, 1, JSON.stringify(v1Eval));
  }
  bus.publish({ type: "resumeEval", jobId, version: 1, evaluation: v1Eval });

  // ---- v2 -----------------------------------------------------------------
  setPhase("v2");
  job = load();
  const existingV2 = store.getResumeVersion(jobId, 2, job.tenantId);
  let v2Json: string;
  let v2Markdown: string;
  if (existingV2) {
    v2Json = existingV2.templateJson;
    v2Markdown = existingV2.markdown;
  } else {
    const profile = job.profileId ? store.getProfileById(job.profileId) ?? undefined : undefined;
    const engineOptions = buildV2EngineOptions(v1Json, v1Eval);
    const result = await generateSophisticatedResume(
      job,
      blueprint,
      llm,
      profile,
      engineOptions,
    );
    v2Json = result.json;
    v2Markdown = result.markdown;
    store.saveResumeVersion({
      jobId,
      tenantId: job.tenantId,
      version: 2,
      templateJson: v2Json,
      markdown: v2Markdown,
    });
  }
  bus.publish({ type: "resumeVariant", jobId, version: 2, markdown: v2Markdown, templateJson: v2Json });

  // ---- eval2 --------------------------------------------------------------
  setPhase("eval2");
  let v2Eval = readEvaluation(store.getResumeVersion(jobId, 2, job.tenantId)?.evaluationJson);
  if (!v2Eval) {
    v2Eval = await evaluateResume(job, v2Json, llm);
    const netNew = checkNetNewClaims(v1Markdown ?? v1Json, v2Markdown ?? v2Json);
    if (netNew.length > 0) {
      const guardIssue = {
        severity: "medium" as const,
        section: "Fabrication guard",
        finding: `Tokens present in v2 but absent from v1 (warn-only): ${netNew.join(", ")}`,
        fixHint: "Verify each is defensible from the candidate's real background before sending.",
      };
      v2Eval = { ...v2Eval, issues: [guardIssue, ...v2Eval.issues].slice(0, 12) };
    }
    store.setResumeEvaluation(jobId, 2, JSON.stringify(v2Eval));
  }
  bus.publish({ type: "resumeEval", jobId, version: 2, evaluation: v2Eval });

  // ---- comparison ---------------------------------------------------------
  setPhase("comparison");
  job = load();
  const comparison = job.comparison ?? computeComparison(v1Eval, v2Eval);
  job.comparison = comparison;
  job.abPhase = "done";
  job.updatedAt = new Date().toISOString();
  store.update(job);
  bus.publish({ type: "resumeComparison", jobId, comparison });
}

function buildV2EngineOptions(
  v1Json: string,
  evaluation: ResumeEvaluationInput,
): ResumeEngineOptions {
  const source = JSON.parse(v1Json) as ResumeTemplate;
  const directives = [
    "This is the second expert pass. You are rewriting the CURRENT resume (provided as the working template) - not starting over.",
    `Reviewers scored the current version ${evaluation.verdict === "ship" ? "good overall but improvable" : "in need of revision"}.`,
    evaluation.strengths.length > 0
      ? `Keep these strengths intact (they scored well): ${evaluation.strengths.join("; ")}.`
      : "",
    evaluation.issues.length > 0
      ? [
          "Fix every HIGH finding, and the MEDIUM ones where honest:",
          ...evaluation.issues.map(
            (i) => `- [${i.severity}] ${i.section}: ${i.finding} (fix: ${i.fixHint})`,
          ),
        ].join("\n")
      : "",
    "Never fabricate experience to fix a finding - use [ADD: ...] placeholders for anything unverifiable.",
  ]
    .filter(Boolean)
    .join("\n");
  return { sourceTemplateOverride: source, rewriteDirectives: directives };
}

function readEvaluation(raw?: string): ResumeEvaluationInput | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    // Local re-validate to keep persisted payloads honest after a reload.
    const result = resumeEvaluationSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
