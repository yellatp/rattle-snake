import type { Blueprint, JobState, TranscriptEntry } from "@rattlesnake/shared";
import type { LLMClient } from "../llm/types.js";
import { extractJDKeywords, resumeToText, scoreResume } from "./ats.js";
import { extractResumeJson } from "./json.js";
import {
  buildEnglishVariantDirective,
  detectEnglishLocale,
} from "./locale.js";
import {
  buildModeratorFeedback,
  moderateResume,
  type ModerationResult,
} from "./moderator.js";
import {
  getRolePrompt,
  getTemplate,
  resolveRoleSlug,
} from "./roleRegistry.js";
import { resumeToMarkdown } from "./serialize.js";
import type { ResumeMeta, ResumeTemplate } from "./types.js";

export interface SophisticatedResumeResult {
  markdown: string;
  json: string;
  meta: ResumeMeta;
}

const GENERATION_TEMPERATURE = 0.3;
const GENERATION_MAX_TOKENS = 4000;

/** Total generations allowed per job (initial + one moderator-driven re-run). */
const MAX_ITERATIONS = 2;

/** Append the committee's GAP report + expert discussion to the role prompt. */
function buildCommitteeSection(blueprint: Blueprint, transcript: TranscriptEntry[]): string {
  const lines: string[] = [];

  lines.push("## HIRING COMMITTEE FEEDBACK (multi-expert debate on this application)");
  lines.push("This is the GAP report and expert discussion your rewrite must resolve. Use it as the authority on what the reviewers found missing — do NOT bloat the resume with filler to cover gaps.");

  lines.push("### GAP REPORT (blueprint)");
  if (blueprint.objections.length > 0) lines.push(`- Objections: ${blueprint.objections.join(" | ")}`);
  if (blueprint.requiredChanges.length > 0) lines.push(`- Required changes: ${blueprint.requiredChanges.join(" | ")}`);
  if (blueprint.strengths.length > 0) lines.push(`- Strengths to preserve: ${blueprint.strengths.join(" | ")}`);
  if (blueprint.sectorNotes.length > 0) lines.push(`- Sector notes: ${blueprint.sectorNotes.join(" | ")}`);
  if (blueprint.pivotFactors.length > 0) lines.push(`- Deciding factors: ${blueprint.pivotFactors.join(" | ")}`);
  lines.push(`- Consensus: ${blueprint.consensus}`);

  const verdicts = Object.entries(blueprint.verdicts ?? {})
    .map(([name, vote]) => `${name}:${vote}`)
    .join(", ");
  if (verdicts) lines.push(`- Verdicts: ${verdicts}`);

  lines.push("### EXPERT DISCUSSION (key transcript excerpts)");
  const maxEntries = Math.min(transcript.length, 8);
  for (let i = 0; i < maxEntries; i++) {
    const entry = transcript[i]!;
    const text = entry.text.replace(/\s+/g, " ").trim().slice(0, 400);
    lines.push(`- [${entry.sender} · ${entry.role}] ${text}`);
  }

  lines.push(
    "Resolve these objections with the candidate's REAL evidence only. Never fabricate " +
    "experience, metrics, or tools to satisfy a reviewer. Where honest proof is absent, " +
    "leave a clearly-marked [ADD: ...] placeholder.",
  );

  return lines.join("\n");
}

/** V1-style structured user prompt: source resume + template skeleton + gap lists. */
function buildUserPrompt(
  template: ResumeTemplate,
  job: JobState,
  matchedKeywords: string[],
  missingKeywords: string[],
  moderatorFeedback?: string,
): string {
  const sections: string[] = [];

  sections.push(`Role: ${template.role}`);
  sections.push(`\n=== Job Description ===\n${job.jobDescription.slice(0, 6000)}`);
  sections.push(`\n=== Source Resume (candidate, as-is — populate the template from this) ===\n${job.baseResume.slice(0, 5000)}`);
  sections.push(`\n=== Template JSON (skeleton — fill every section from the source resume) ===\n${JSON.stringify(template, null, 2).slice(0, 8000)}`);
  sections.push(`\nTone: balanced`);
  sections.push(`Locked sections: none`);

  if (matchedKeywords.length > 0) {
    sections.push(`Matched keywords: ${matchedKeywords.join(", ")}`);
  }
  if (missingKeywords.length > 0) {
    sections.push(`Missing keywords (integrate these ONLY if honestly supported by the source resume): ${missingKeywords.join(", ")}`);
  }
  if (moderatorFeedback) {
    sections.push(`\n=== Moderator Feedback (fix these issues) ===\n${moderatorFeedback}`);
  }

  return sections.join("\n");
}

/**
 * Sophisticated committee-driven resume rewrite.
 *
 * Combines the Rattle-Snake V1 role-targeted resume engine (32 role templates +
 * role system prompts, ATS gap analysis, and an elite moderation loop) with the
 * V2 hiring-committee output: the blueprint (GAP report) and debate transcript
 * (expert discussion) are injected into the generation prompt, and the final
 * resume is produced as structured role-template JSON plus a rendered Markdown
 * view. Grounding rule: the candidate stays "as-is" — nothing is invented, and
 * unprovable requests surface as [ADD: ...] placeholders.
 */
export async function generateSophisticatedResume(
  job: JobState,
  blueprint: Blueprint,
  llm: LLMClient,
): Promise<SophisticatedResumeResult> {
  const roleSlug = resolveRoleSlug(job.domain, job.jobDescription);
  const template = getTemplate(roleSlug)!;
  const rolePrompt = getRolePrompt(roleSlug)!;

  // US/UK English variant comes from the job's location (explicit field first,
  // then JD markers, then US default). It drives spelling + terminology.
  const locale = detectEnglishLocale(job.jobLocation, job.jobDescription);
  const localeDirective = buildEnglishVariantDirective(locale);

  const committeeSection = buildCommitteeSection(blueprint, job.transcript);
  const baseSystemPrompt = `${rolePrompt}\n\n${localeDirective}\n\n${committeeSection}`;

  const initialGap = scoreResume(
    job.baseResume,
    job.jobDescription,
    template.ats_keywords ?? [],
  );

  let json = "";
  let atsScore = 0;
  let matchedKeywords = initialGap.matched.map((m) => m.keyword);
  let missingKeywords = initialGap.topMissing;
  let moderation: ModerationResult | null = null;
  let iterations = 0;

  while (iterations < MAX_ITERATIONS) {
    iterations += 1;

    const moderatorFeedback = moderation
      ? buildModeratorFeedback(moderation)
      : undefined;
    const systemPrompt = moderatorFeedback
      ? `${baseSystemPrompt}\n\n## MODERATOR FEEDBACK\n${moderatorFeedback}`
      : baseSystemPrompt;
    const userPrompt = buildUserPrompt(
      template,
      job,
      matchedKeywords,
      missingKeywords,
      moderatorFeedback,
    );

    const raw = await llm.complete(systemPrompt, userPrompt, {
      temperature: GENERATION_TEMPERATURE,
      maxTokens: GENERATION_MAX_TOKENS,
    });

    json = extractResumeJson(raw);
    const parsed = JSON.parse(json) as Partial<ResumeTemplate>;

    // Re-run the ATS gap analysis against the freshly generated resume so the
    // moderator re-run is driven by the newest matched/missing keyword state.
    const generated = scoreResume(
      resumeToText(json),
      job.jobDescription,
      template.ats_keywords ?? [],
    );
    atsScore = generated.score;
    matchedKeywords = generated.matched.map((m) => m.keyword);
    missingKeywords = generated.topMissing;

    // A structurally-invalid generation counts as a failed moderation so the
    // loop regenerates once with feedback.
    const hasMinimalStructure =
      Array.isArray(parsed.sections?.experience) || Boolean(parsed.contact?.name);
    moderation = hasMinimalStructure
      ? await moderateResume(json, job.jobDescription, llm, locale)
      : {
          score: 30,
          approved: false,
          summaryVerdict: "Score 30 — response was not valid structured resume JSON.",
          bannedPhrases: [],
          issues: ["The generated output could not be parsed as the role template JSON."],
          suggestions: ["Return a single JSON object matching the template schema exactly."],
        };

    if (moderation.approved) break;
  }

  const parsedFinal = JSON.parse(json) as ResumeTemplate;
  const markdown = resumeToMarkdown(parsedFinal);

  return {
    markdown,
    json: JSON.stringify(parsedFinal, null, 2),
    meta: {
      role: roleSlug,
      roleLabel: template.role,
      atsScore,
      moderationScore: moderation?.score ?? 0,
      moderationApproved: moderation?.approved ?? false,
      iterations,
      locale,
    },
  };
}

export { extractJDKeywords, scoreResume, resumeToText };
