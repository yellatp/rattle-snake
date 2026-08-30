import {
  buildDirectorPrompt,
  directorAuditSchema,
  type Decision,
  type DirectorAudit,
  type Domain,
  type JobDecomposition,
  type TranscriptEntry,
  type Verdict,
} from "@rattlesnake/shared";
import type { LLMClient } from "../llm/client.js";

/**
 * Director / Architect fairness audit (Layer 2, plan section 5).
 *
 * The Director runs AFTER the ballot and BEFORE the verdict is finalized. It
 * audits the FAIRNESS of the debate itself - evidence-bar consistency, level
 * calibration, transferability, groupthink, confidence consistency, and
 * evidence acceptance - and may force ONE targeted re-ballot on a single
 * material factor. It can never flip the verdict alone; the re-ballot is the
 * committee's to re-cast.
 *
 * A failure here is isolated: the caller treats null as "no audit produced"
 * and finalizes the verdict from the original ballot.
 */
export interface DirectorReviewInput {
  domain: Domain;
  jobDescription: string;
  baseResume: string;
  sectorFocus?: string;
  jobDecomposition?: JobDecomposition;
  transcript: TranscriptEntry[];
  consensus: Verdict;
  tallies: Record<Decision, number>;
}

/** Produce the Director's fairness audit, or null when it cannot be produced. */
export async function runDirectorReview(
  input: DirectorReviewInput,
  llm: LLMClient,
): Promise<DirectorAudit | null> {
  try {
    const prompt = buildDirectorPrompt(input);
    const raw = await llm.complete(prompt, "Produce the Director audit JSON only.", {
      temperature: 0.1,
      maxTokens: 1200,
    });
    const json = stripCodeFences(raw);
    const parsed = JSON.parse(json) as unknown;
    const validated = directorAuditSchema.safeParse(parsed);
    if (!validated.success) {
      console.warn(`[pipeline] director-audit LLM output failed schema validation (${llm.provider}/${llm.model}); skipping audit`);
      return null;
    }
    return repair(validated.data);
  } catch (err) {
    console.warn(`[pipeline] director-audit LLM call failed (${llm.provider}/${llm.model}); skipping audit:`, err);
    return null;
  }
}

/** Derive the overall flags from the per-factor findings. */
function repair(audit: DirectorAudit): DirectorAudit {
  const items = audit.items ?? [];
  const anyFailed = items.some((i) => !i.passed);
  const revote = anyFailed ? (audit.revoteFactor ?? items.find((i) => !i.passed)?.factor ?? "") : "";
  return {
    fair: audit.fair ?? !anyFailed,
    items,
    passes: !anyFailed,
    revoteFactor: revote || undefined,
    needsHumanReview: audit.needsHumanReview ?? undefined,
  };
}

function stripCodeFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "");
}
