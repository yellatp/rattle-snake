import {
  coldEmailSchema,
  type ColdEmailAudience,
  type ColdEmailDraft,
  type JobState,
  type UserProfile,
} from "@rattlesnake/shared";
import type { LLMClient } from "../llm/types.js";
import { getTemplate, resolveRoleSlug } from "../resume/roleRegistry.js";
import { buildProfileBio } from "../resume/profile.js";
import { sanitizeText, buildTypographyDirective } from "../resume/sanitize.js";

/**
 * Cold-email "killer intro" generator for one application.
 *
 * Produces a short, sharp outreach draft (subject + 3-5 sentence body) aimed at
 * a recruiter, founder, or hiring manager about the candidate's application for
 * the role the job was evaluated against.
 *
 * Strategy (same pattern as the review modules):
 *   1. LLM synthesis via a cold-outreach writer prompt (best quality).
 *   2. Deterministic fallback derived from the candidate name + role + the
 *      SME panel's vetted strengths (or the resume's metric-bearing bullets).
 * Both outputs are run through the shared typography sanitizer.
 */
export interface ColdEmailOptions {
  audience?: ColdEmailAudience;
  /** Optional tone hint, e.g. "warm", "direct", "enthusiastic". */
  tone?: string;
  /** Optional recipient name used in the greeting. */
  targetName?: string;
}

const AUDIENCE_LABELS: Record<ColdEmailAudience, string> = {
  recruiter: "a recruiter",
  founder: "a founder",
  hiring_manager: "a hiring manager",
};

const AUDIENCE_CLOSERS: Record<ColdEmailAudience, string> = {
  recruiter:
    "I would welcome the chance to walk you through how my background maps to the role and the team's hiring bar.",
  founder:
    "I would love to bring this experience to your team and can move quickly on next steps whenever it suits you.",
  hiring_manager:
    "I am confident I can hit the ground running on the responsibilities in the posting and would welcome a conversation.",
};

export function buildColdEmailPrompt(
  job: JobState,
  profile?: UserProfile,
  options: ColdEmailOptions = {},
): string {
  const roleSlug =
    (job.roleSlug && getTemplate(job.roleSlug) ? job.roleSlug : undefined) ??
    resolveRoleSlug(job.domain, job.jobDescription);
  const roleLabel = getTemplate(roleSlug)?.role ?? roleSlug;
  const audience = options.audience ?? "recruiter";

  const candidateName = profile
    ? profile.personalInfo?.firstName || profile.name
    : guessCandidateName(job.baseResume);

  const highlights = committeeStrengths(job).slice(0, 3);

  const blocks: string[] = [
    `You are a cold outreach writer for job applications. You write short, high-signal outreach emails that get a reply: no fluff, no generic filler, one or two specific facts that connect the candidate to the role, and a clear, low-friction ask.`,
    `## OUTPUT FORMAT (strict JSON, no markdown fences, no prose)\n{\n  "subject": string,   // under 70 characters, specific, no clickbait\n  "body": string       // 3-5 short sentences, plain text lines, ends with an ask\n}\n\nKeep the body 90-140 words. Use the candidate's real facts only. Never invent experience, metrics, or tools.`,
    `## RECIPIENT\nYou are writing to ${AUDIENCE_LABELS[audience]} about the candidate's application for the ${roleLabel} role.${options.targetName ? ` The recipient's name is ${options.targetName}.` : ""}${options.tone ? ` Tone: ${options.tone}.` : ""}`,
    `## CANDIDATE\nName: ${candidateName}\nProfile bio:\n${profile ? buildProfileBio(profile) : job.baseResume.slice(0, 1200)}`,
    `## ROLE & STRENGTHS\nTarget role: ${roleLabel}\nVetted strengths the SME panel confirmed:\n- ${highlights.join("\n- ")}`,
  ];

  if (job.jobDescription) {
    blocks.push(`## JOB DESCRIPTION\n${job.jobDescription}`);
  }
  blocks.push(buildTypographyDirective());

  return blocks.join("\n\n");
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
  const raw = await llm.complete(
    buildColdEmailPrompt(job, profile, options),
    "Produce the cold email JSON only.",
    { temperature: 0.6, maxTokens: 700 },
  );
  const json = stripCodeFences(raw);
  const parsed = JSON.parse(json) as unknown;
  const validated = coldEmailSchema.safeParse(parsed);
  if (!validated.success) return null;
  return {
    subject: sanitizeText(validated.data.subject),
    body: sanitizeText(validated.data.body),
  };
}

/** Deterministic fallback so the endpoint works even against a broken LLM. */
export function buildFallback(
  job: JobState,
  profile?: UserProfile,
  options: ColdEmailOptions = {},
): ColdEmailDraft {
  const roleSlug =
    (job.roleSlug && getTemplate(job.roleSlug) ? job.roleSlug : undefined) ??
    resolveRoleSlug(job.domain, job.jobDescription);
  const roleLabel = getTemplate(roleSlug)?.role ?? roleSlug;
  const audience = options.audience ?? "recruiter";
  const name = profile
    ? profile.personalInfo?.firstName || profile.name
    : guessCandidateName(job.baseResume) || "the candidate";

  const highlights = committeeStrengths(job).slice(0, 3).map(
    (h) => `- ${h}`,
  );

  const body = [
    options.targetName ? `Hi ${options.targetName},` : "Hi,",
    "",
    `I am ${name}, and I am applying for the ${roleLabel} role.`,
    ...(highlights.length > 0
      ? ["A few facts about me:", ...highlights]
      : [`I have been working in the area this role covers and believe I can contribute from day one.`]),
    "",
    AUDIENCE_CLOSERS[audience],
    "",
    "Best regards,",
    name,
  ].join("\n");

  return {
    subject: sanitizeText(`Application for ${roleLabel} - ${name}`),
    body: sanitizeText(body),
  };
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
