import {
  buildColdEmailV2Prompt,
  coldEmailV2Schema,
  type ColdEmailAngle,
  type ColdEmailAudience,
  type ColdEmailCtaStyle,
  type ColdEmailDraft,
  type ColdEmailLength,
  type JobState,
  type UserProfile,
} from "@rattlesnake/shared";
import type { LLMClient } from "../llm/types.js";
import { getTemplate, resolveRoleSlug } from "../resume/roleRegistry.js";
import { buildProfileBio } from "../resume/profile.js";
import { sanitizeText } from "../resume/sanitize.js";
import { runColdEmailGate } from "./coldEmailGate.js";

/**
 * Cold-email content engine v2 (design plan R1): the candidate's own
 * first-person soft pitch. Value and capability framing, transferable-skill
 * emphasis, dynamic alignment with the JD and the user's selections.
 *
 * Strategy:
 *   1. LLM synthesis via the v2 prompt, validated against `coldEmailV2Schema`.
 *   2. The deterministic voice gate enforces the non-negotiables; a failed
 *      gate triggers exactly one corrective regeneration, then the
 *      deterministic first-person fallback takes over. The gate never loops.
 */
export interface ColdEmailOptions {
  audience?: ColdEmailAudience;
  /** Voice hint from the fixed set (direct | warm | bold | understated). */
  tone?: string;
  /** Optional recipient name used in the greeting. */
  targetName?: string;
  /** Narrative axis that decides which strengths lead the draft. */
  angle?: ColdEmailAngle;
  /** Body length budget. */
  length?: ColdEmailLength;
  /** The ask style that closes the draft. */
  ctaStyle?: ColdEmailCtaStyle;
}

const AUDIENCE_LABELS: Record<ColdEmailAudience, string> = {
  recruiter: "a recruiter",
  founder: "a founder",
  hiring_manager: "a hiring manager",
};

const CTA_BY_STYLE: Record<ColdEmailCtaStyle, string> = {
  call: "Would a short 15-minute call this week work for you?",
  reply: "Would a quick reply with a good time to talk work for you?",
  coffee_chat: "Could we grab a short virtual coffee in the next few days?",
};

export function buildColdEmailPrompt(
  job: JobState,
  profile?: UserProfile,
  options: ColdEmailOptions = {},
): string {
  const roleSlug = resolveRoleLabelSlug(job);
  const roleLabel = getTemplate(roleSlug)?.role ?? roleSlug;
  const candidateName = candidateDisplayName(job, profile);

  return buildColdEmailV2Prompt({
    jobDescription: job.jobDescription,
    roleLabel,
    company: job.jdMeta?.company,
    candidateName,
    profileBio: profile ? buildProfileBio(profile) : undefined,
    strengths: committeeStrengths(job),
    strongMatches: (job.gapAnalysis?.gapAnalysis.strongMatches ?? []).map((m) => ({
      item: m.item,
      notes: m.notes,
    })),
    selection: {
      audience: options.audience ?? "recruiter",
      tone: options.tone ?? "warm",
      angle: options.angle ?? "transferable",
      length: options.length ?? "standard",
      ctaStyle: options.ctaStyle ?? "call",
      targetName: options.targetName,
    },
  });
}

function resolveRoleLabelSlug(job: JobState): string {
  return (
    (job.roleSlug && getTemplate(job.roleSlug) ? job.roleSlug : undefined) ??
    resolveRoleSlug(job.domain, job.jobDescription)
  );
}

function candidateDisplayName(job: JobState, profile?: UserProfile): string {
  return (
    (profile ? profile.personalInfo?.firstName || profile.name : "") ||
    guessCandidateName(job.baseResume) ||
    "the candidate"
  );
}

export async function generateColdEmail(
  job: JobState,
  llm: LLMClient,
  options: ColdEmailOptions = {},
  profile?: UserProfile,
): Promise<ColdEmailDraft> {
  const llmResult = await extractViaLLM(job, llm, options, profile).catch((err) => {
    console.warn(`[pipeline] cold-email LLM generation failed for job ${job.id}; using template fallback:`, err);
    return null;
  });
  if (llmResult) return llmResult;
  return buildFallback(job, profile, options);
}

async function extractViaLLM(
  job: JobState,
  llm: LLMClient,
  options: ColdEmailOptions,
  profile?: UserProfile,
): Promise<ColdEmailDraft | null> {
  const system = buildColdEmailPrompt(job, profile, options);
  const user = "Produce the cold email JSON only.";
  const raw = await llm.complete(system, user, { temperature: 0.6, maxTokens: 900 });
  const first = parseDraft(raw);
  if (!first) return null;

  const gate = runColdEmailGate(first);
  if (gate.passed) return sanitizeDraft(first);

  const corrections = [
    "CORRECTIONS - regenerate the draft fixing every item below:",
    ...gate.violations.map((v) => `- ${v}`),
    "Keep everything that already satisfied the rules. Same strict JSON output format.",
  ].join("\n");
  const retryRaw = await llm.complete(
    system,
    `${user}\n\nPREVIOUS ATTEMPT:\n${raw.trim()}\n\n${corrections}`,
    { temperature: 0.5, maxTokens: 900 },
  );
  const second = parseDraft(retryRaw);
  if (!second) return null;
  const secondGate = runColdEmailGate(second);
  if (secondGate.passed) return sanitizeDraft(second);

  console.warn(
    `[pipeline] cold-email voice gate rejected both attempts for job ${job.id}: ${[...gate.violations, ...secondGate.violations].join("; ")}`,
  );
  return null;
}

interface ColdEmailV2Draft {
  subject: string;
  body: string;
  cta: string;
  angleUsed: ColdEmailAngle;
  wordCount: number;
}

function parseDraft(raw: string): ColdEmailV2Draft | null {
  const json = stripCodeFences(raw);
  try {
    const parsed = JSON.parse(json) as unknown;
    const validated = coldEmailV2Schema.safeParse(parsed);
    if (!validated.success) return null;
    return {
      subject: validated.data.subject,
      body: validated.data.body,
      cta: validated.data.cta,
      angleUsed: validated.data.angleUsed,
      wordCount: validated.data.wordCount,
    };
  } catch {
    return null;
  }
}

function sanitizeDraft(draft: ColdEmailV2Draft): ColdEmailDraft {
  return {
    subject: sanitizeText(draft.subject),
    body: sanitizeText(draft.body),
    cta: sanitizeText(draft.cta),
    angleUsed: draft.angleUsed,
    wordCount: draft.body.split(/\s+/).filter(Boolean).length,
  };
}

/** Deterministic first-person fallback so the endpoint works even when the LLM is down. */
export function buildFallback(
  job: JobState,
  profile?: UserProfile,
  options: ColdEmailOptions = {},
): ColdEmailDraft {
  const roleSlug = resolveRoleLabelSlug(job);
  const roleLabel = getTemplate(roleSlug)?.role ?? roleSlug;
  const audience = options.audience ?? "recruiter";
  const name = candidateDisplayName(job, profile);
  const strengths = committeeStrengths(job);
  const lead = strengths[0];
  const cta = CTA_BY_STYLE[options.ctaStyle ?? "call"];

  const greeting = options.targetName ? `Hi ${options.targetName},` : "Hi,";
  const opener = `I build and own work in this space end to end, and your ${roleLabel} opening reads like the kind of problem I enjoy taking on.`;
  const capability = lead
    ? `The clearest thing I would bring is that I ${lowerFirst(lead)}; turning requirements like yours into reliable, working systems is the habit I trust most.`
    : `The clearest thing I would bring is the habit of turning requirements like yours into reliable, working systems.`;
  const transferable = `If your stack differs from what I have used before, the fundamentals transfer: I pick up new domains quickly and have done so more than once.`;

  const body = [greeting, "", opener, capability, transferable, "", cta, "", "Best,", name].join(
    "\n",
  );

  return {
    subject: sanitizeText(`${name} - ${roleLabel}`),
    body: sanitizeText(body),
    cta: sanitizeText(cta),
    angleUsed: options.angle ?? "transferable",
    wordCount: body.split(/\s+/).filter(Boolean).length,
  };
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/** First plausible person's name from a resume's opening lines. */
function guessCandidateName(resume: string): string {
  const line = resume
    .split("\n")
    .map((l) => l.trim())
    .find((l) => /^[A-Z][a-z]+(\s+[A-Z][a-z]+)+(\s|$)/.test(l));
  if (!line) return "";
  const match = /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})/.exec(line);
  return match?.[1] ?? "";
}

/**
 * Vetted strengths aggregated from the SME panel's 360-degree analyses: unique
 * across seats, capped at 3, falling back to the resume's metric bullets.
 */
function committeeStrengths(job: JobState): string[] {
  const fromAnalyses = [...new Set((job.analyses ?? []).flatMap((a) => a.strengths))];
  if (fromAnalyses.length > 0) return fromAnalyses.slice(0, 3);
  return metricBullets(job.baseResume).slice(0, 3);
}

/** Bullets that carry a number — the strongest signals for an intro. */
function metricBullets(resume: string): string[] {
  return resume
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^\s*[-*•]\s+/.test(l) && /\d/.test(l))
    .map((l) => l.replace(/^\s*[-*•]\s+/, "").replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 25 && l.length < 220)
    .slice(0, 6);
}

function stripCodeFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "");
}
