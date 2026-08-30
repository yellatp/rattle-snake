import {
  coverLetterSchema,
  type CoverLetterDraft,
  type JobState,
  type UserProfile,
} from "@rattlesnake/shared";
import type { LLMClient } from "../llm/types.js";
import { getTemplate, resolveRoleSlug } from "../resume/roleRegistry.js";
import { buildProfileBio } from "../resume/profile.js";
import { sanitizeText, buildTypographyDirective } from "../resume/sanitize.js";

/**
 * Cover-letter generator for one application.
 *
 * Produces a classic four-part letter (subject, salutation, body, closing) for
 * the role the job was evaluated against. The body is 3-4 paragraphs built on
 * the SME panel's vetted strengths and the candidate profile/resume.
 *
 * Strategy (same pattern as the cold-email module):
 *   1. LLM synthesis via a cover-letter writer prompt (best quality).
 *   2. Deterministic fallback derived from the candidate name + role + the
 *      SME panel's vetted strengths (or the resume's metric-bearing bullets).
 * Both outputs are run through the shared typography sanitizer.
 */

export function buildCoverLetterPrompt(
  job: JobState,
  profile?: UserProfile,
): string {
  const roleSlug =
    (job.roleSlug && getTemplate(job.roleSlug) ? job.roleSlug : undefined) ??
    resolveRoleSlug(job.domain, job.jobDescription);
  const roleLabel = getTemplate(roleSlug)?.role ?? roleSlug;

  const candidateName = profile
    ? profile.personalInfo?.firstName || profile.name
    : guessCandidateName(job.baseResume);

  const highlights = committeeStrengths(job).slice(0, 3);

  const blocks: string[] = [
    `You are a cover letter writer for job applications. You write a polished, specific cover letter: it names the role and company, leads with one or two concrete strengths the candidate can back up, connects those to the posting, and closes with a confident next step. No generic filler, no invented experience, metrics, or tools.`,
    `## OUTPUT FORMAT (strict JSON, no markdown fences, no prose)\n{\n  "subject": string,          // under 70 characters, e.g. "Application for ${roleLabel} - ${candidateName}"\n  "salutation": string,       // e.g. "Dear Hiring Manager,"\n  "body": string,             // 3-4 short paragraphs, 150-260 words, plain text lines\n  "closing": string           // sign-off line, e.g. "Best regards,\\n${candidateName}"\n}\n\nUse the candidate's real facts only. Never invent experience, metrics, or tools.`,
    `## CANDIDATE\nName: ${candidateName}\nProfile bio:\n${profile ? buildProfileBio(profile) : job.baseResume.slice(0, 1400)}`,
    `## ROLE & STRENGTHS\nTarget role: ${roleLabel}\nVetted strengths the SME panel confirmed:\n- ${highlights.join("\n- ")}`,
  ];

  if (job.jobDescription) {
    blocks.push(`## JOB DESCRIPTION\n${job.jobDescription}`);
  }
  blocks.push(buildTypographyDirective());

  return blocks.join("\n\n");
}

export async function generateCoverLetter(
  job: JobState,
  llm: LLMClient,
  profile?: UserProfile,
): Promise<CoverLetterDraft> {
  const llmResult = await extractViaLLM(job, llm, profile).catch((err) => {
    console.warn(`[pipeline] cover-letter LLM generation failed for job ${job.id}; using template fallback:`, err);
    return null;
  });
  if (llmResult) return llmResult;
  return buildFallback(job, profile);
}

async function extractViaLLM(
  job: JobState,
  llm: LLMClient,
  profile?: UserProfile,
): Promise<CoverLetterDraft | null> {
  const raw = await llm.complete(
    buildCoverLetterPrompt(job, profile),
    "Produce the cover letter JSON only.",
    { temperature: 0.6, maxTokens: 900 },
  );
  const json = stripCodeFences(raw);
  const parsed = JSON.parse(json) as unknown;
  const validated = coverLetterSchema.safeParse(parsed);
  if (!validated.success) return null;
  return {
    subject: sanitizeText(validated.data.subject),
    salutation: sanitizeText(validated.data.salutation),
    body: sanitizeText(validated.data.body),
    closing: sanitizeText(validated.data.closing),
  };
}

/** Deterministic fallback so the endpoint works even against a broken LLM. */
export function buildFallback(
  job: JobState,
  profile?: UserProfile,
): CoverLetterDraft {
  const roleSlug =
    (job.roleSlug && getTemplate(job.roleSlug) ? job.roleSlug : undefined) ??
    resolveRoleSlug(job.domain, job.jobDescription);
  const roleLabel = getTemplate(roleSlug)?.role ?? roleSlug;
  const name = profile
    ? profile.personalInfo?.firstName || profile.name
    : guessCandidateName(job.baseResume) || "the candidate";

  const highlights = committeeStrengths(job).slice(0, 3).map((h) => `- ${h}`);

  const body = [
    `I am writing to apply for the ${roleLabel} role. I have been working in the area this role covers and believe I can contribute from day one.`,
    ...(highlights.length > 0
      ? ["A few facts about me:", ...highlights]
      : []),
    `I am drawn to this position because it matches the work I do best, and I am confident I can deliver against the responsibilities in the posting. I would welcome the chance to walk you through how my background maps to the role and the team's hiring bar.`,
  ].join("\n\n");

  return {
    subject: sanitizeText(`Application for ${roleLabel} - ${name}`),
    salutation: "Dear Hiring Manager,",
    body: sanitizeText(body),
    closing: sanitizeText(`Best regards,\n${name}`),
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

/** Bullets that carry a number — the strongest signals for a letter. */
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
