import {
  buildExecutiveReviewPrompt,
  executiveReviewSchema,
  type Blueprint,
  type Decision,
  type Domain,
  type ExecutivePersona,
  type ExecutiveReview,
  type JobDecomposition,
  type TranscriptEntry,
  type Verdict,
} from "@rattlesnake/shared";
import type { LLMClient } from "../llm/client.js";

/**
 * Executive review (Phase 1, plan §3.6).
 *
 * A function-aware C-suite moderator of the actual hiring company reads the JD,
 * the candidate's resume, the full debate and the committee verdict, then gives
 * an ADVISORY opinion on whether the debate and the candidate fairly benefit the
 * organization. The review is advisory only: it never changes `finalVerdict`.
 *
 * A failure here is isolated — the caller treats null as "no executive opinion
 * was produced" and completes the run normally.
 */

/** roleSlug -> executive persona. role-level overrides beat the domain mapping. */
export const EXEC_PERSONA_FOR_SLUG: Record<string, ExecutivePersona> = {
  marketing_analyst: "CMO",
  marketing_strategist: "CMO",
  gtm_analyst: "CMO",
  product_manager: "CPO",
  product_analyst: "CPO",
  project_manager: "COO",
  operations_analyst: "COO",
  business_analyst: "COO",
  business_strategist: "CEO",
};

/** Domain -> default executive persona. */
export const EXEC_PERSONA_FOR_DOMAIN: Record<Domain, ExecutivePersona> = {
  AI_ENGINEERING: "CTO",
  ML_ENGINEERING: "CTO",
  SDE: "CTO",
  DATA_ENGINEERING: "CTO",
  DATA_SCIENCE: "CDO",
  CYBERSECURITY: "CISO",
  NETWORKING: "CTO",
  DEVOPS: "CTO",
  PROJECT_MANAGEMENT: "COO",
};

/**
 * Resolve the executive persona for a role. The role slug wins when it maps to
 * a function (product -> CPO, marketing -> CMO, ops -> COO, ...); otherwise the
 * domain's default applies, and the CTO/CEO as a last resort.
 */
export function executiveForRole(roleSlug?: string, domain?: Domain): ExecutivePersona {
  if (roleSlug && EXEC_PERSONA_FOR_SLUG[roleSlug]) return EXEC_PERSONA_FOR_SLUG[roleSlug];
  if (domain && EXEC_PERSONA_FOR_DOMAIN[domain]) return EXEC_PERSONA_FOR_DOMAIN[domain];
  return "CEO";
}

export interface ExecutiveReviewInput {
  persona: ExecutivePersona;
  company: string;
  domain: Domain;
  jobDescription: string;
  baseResume: string;
  jobDecomposition?: JobDecomposition;
  transcript: TranscriptEntry[];
  consensus: Verdict;
  tallies: Record<Decision, number>;
  blueprint: Blueprint;
}

/** Produce the advisory executive review, or null when it cannot be produced. */
export async function runExecutiveReview(
  input: ExecutiveReviewInput,
  llm: LLMClient,
): Promise<ExecutiveReview | null> {
  try {
    const prompt = buildExecutiveReviewPrompt(input);
    const raw = await llm.complete(prompt, "Produce the executive review JSON only.", {
      temperature: 0.2,
      maxTokens: 1200,
    });
    const json = stripCodeFences(raw);
    const parsed = JSON.parse(json) as unknown;
    const validated = executiveReviewSchema.safeParse(parsed);
    if (!validated.success) {
      console.warn(`[pipeline] executive-review LLM output failed schema validation (${llm.provider}/${llm.model}); skipping advisory review`);
      return null;
    }
    return repair(validated.data, input);
  } catch (err) {
    console.warn(`[pipeline] executive-review LLM call failed (${llm.provider}/${llm.model}); skipping advisory review:`, err);
    return null;
  }
}

/** Guarantee every required field exists and pin the persona/company to the resolver. */
function repair(
  review: ExecutiveReview,
  input: ExecutiveReviewInput,
): ExecutiveReview {
  return {
    persona: input.persona,
    company: input.company,
    debateRelevance: review.debateRelevance ?? { score: 0, note: "" },
    roleAlignment: review.roleAlignment ?? { score: 0, note: "" },
    growthAlignment: review.growthAlignment ?? { score: 0, note: "" },
    requirementAssessment: review.requirementAssessment ?? "",
    conditionsToHire: review.conditionsToHire ?? [],
    opinion: review.opinion ?? "NEUTRAL",
    opinionReason: review.opinionReason ?? "",
    summary: review.summary ?? "",
  };
}

function stripCodeFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "");
}
