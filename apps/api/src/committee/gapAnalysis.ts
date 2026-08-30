import {
  gapAnalysisResultSchema,
  buildGapAnalysisPrompt,
  type Blueprint,
  type GapAnalysisResult,
  type JobState,
} from "@rattlesnake/shared";
import type { LLMClient } from "../llm/client.js";

/**
 * Runs the Gap Analysis stage after the executive review.
 *
 * Produces a structured assessment of candidate fit plus defensible
 * enhancement suggestions for the resume agent.
 */
export async function runGapAnalysis(
  job: JobState,
  blueprint: Blueprint,
  llm: LLMClient,
): Promise<GapAnalysisResult> {
  const llmResult = await extractViaLLM(job, blueprint, llm).catch((err) => {
    console.warn(`[pipeline] gap-analysis LLM extraction failed for job ${job.id}; using rule-based fallback:`, err);
    return null;
  });
  if (llmResult) return llmResult;

  // Fallback: produce a minimal gap analysis from the blueprint when the LLM
  // call fails (e.g. offline / mock provider).
  return buildFallbackGapAnalysis(blueprint, job);
}

function stripCodeFences(s: string): string {
  const m = s.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  return m?.[1]?.trim() ?? s.trim();
}

async function extractViaLLM(
  job: JobState,
  blueprint: Blueprint,
  llm: LLMClient,
): Promise<GapAnalysisResult | null> {
  const prompt = buildGapAnalysisPrompt({
    jobDescription: job.jobDescription,
    baseResume: job.baseResume,
    blueprint,
    amendmentNotes: job.amendmentNotes,
  });

  const raw = await llm.complete(prompt, "Produce the gap analysis JSON only.", {
    temperature: 0.2,
    maxTokens: 3000,
  });
  const json = stripCodeFences(raw);
  const parsed = JSON.parse(json) as unknown;
  const validated = gapAnalysisResultSchema.safeParse(parsed);
  if (!validated.success) return null;
  return validated.data;
}

/**
 * Builds a minimal fallback gap analysis from the blueprint when the LLM
 * call fails (e.g. offline, mock provider, or parse error).
 */
function buildFallbackGapAnalysis(
  blueprint: Blueprint,
  job: JobState,
): GapAnalysisResult {
  const mustHaveGaps = (blueprint.requirementMap ?? [])
    .filter((r) => r.status === "missing" || r.status === "partial")
    .map((r) => ({
      item: r.requirement,
      evidenceStatus: r.status === "missing" ? "Missing" as const : "Partial" as const,
      impact: "High" as const,
      notes: r.action,
    }));

  const strongMatches = (blueprint.requirementMap ?? [])
    .filter((r) => r.status === "proven")
    .map((r) => ({
      item: r.requirement,
      notes: r.evidence,
    }));

  const niceToHaveGaps = (blueprint.missingSkillsRanked ?? []).map((s) => ({
    item: s.skill,
    evidenceStatus: "Missing" as const,
    transferableFrom: null,
    notes: `Severity: ${s.severity}`,
  }));

  const inflatedClaims = (blueprint.inflatedClaims ?? []).map((c) => ({
    claim: c.claim,
    severity: c.severity === "low" ? "Low" as const : c.severity === "medium" ? "Medium" as const : "High" as const,
    panelNote: c.evidence,
  }));

  const readiness =
    mustHaveGaps.length <= 1 && strongMatches.length >= 3
      ? "Strong Match"
      : mustHaveGaps.length <= 4
        ? "Partial Match"
        : "Significant Gaps";

  return {
    gapAnalysis: {
      mustHaveGaps,
      niceToHaveGaps,
      strongMatches,
      inflatedClaims,
      overallReadiness: readiness,
      summary: mustHaveGaps.length === 0
        ? "The candidate meets all must-have requirements with strong evidence."
        : `The candidate has ${mustHaveGaps.length} must-have gap(s) that need addressing in the resume.`,
    },
    suggestions: [
      {
        id: "fallback-1",
        category: "Elevate Theme",
        suggestion: "Address all must-have gaps identified in the blueprint",
        justification: "These are non-negotiable requirements per the JD.",
        risk: "Medium",
        targetSection: "Most Recent Role",
        proposedChange: "Reframe existing experience to address each must-have gap",
        jdThemeAddressed: "Must-have requirements",
      },
    ],
    priorityActions: mustHaveGaps.map((g) => `Address gap: ${g.item}`),
  };
}

function validateEnum<T extends string>(value: unknown, valid: readonly T[], fallback: T): T {
  if (typeof value === "string" && (valid as readonly string[]).includes(value)) {
    return value as T;
  }
  return fallback;
}
