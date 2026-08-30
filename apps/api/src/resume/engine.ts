import type {
  Blueprint,
  EnhancementTier,
  GapAnalysisResult,
  JobState,
  ResumeEnhancement,
  TranscriptEntry,
  UserProfile,
} from "@rattlesnake/shared";
import type { LLMClient } from "../llm/types.js";
import { extractJDKeywords, resumeToText, scoreResume } from "./ats.js";
import {
  buildCoreDirective,
  buildEnhancementDirective,
  defaultEnhancementTier,
  normalizeEnhancements,
} from "./core.js";
import { extractResumeJson } from "./json.js";
import {
  buildEnglishVariantDirective,
  detectEnglishLocale,
} from "./locale.js";
import { mergeSourceIntoTemplate } from "./merge.js";
import {
  buildModeratorFeedback,
  moderateResume,
  type ModerationResult,
} from "./moderator.js";
import { applyProfileToTemplate, buildProfileBio } from "./profile.js";
import {
  getRolePrompt,
  getTemplate,
  resolveRoleSlug,
} from "./roleRegistry.js";
import {
  auditScreening,
  getScreeningChecklist,
} from "./screening.js";
import {
  buildTypographyDirective,
  sanitizeText,
} from "./sanitize.js";
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
function buildCommitteeSection(
  blueprint: Blueprint,
  transcript: TranscriptEntry[],
  gapAnalysis?: GapAnalysisResult,
): string {
  const lines: string[] = [];

  lines.push("## HIRING COMMITTEE FEEDBACK (multi-expert debate on this application)");
  lines.push("This is the GAP report and expert discussion your rewrite must resolve. Use it as the authority on what the reviewers found missing -- do NOT bloat the resume with filler to cover gaps.");

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

  // Gap analysis findings (Phase O)
  if (gapAnalysis) {
    lines.push("\n### GAP ANALYSIS (career strategist assessment)");
    lines.push(`Readiness: ${gapAnalysis.gapAnalysis.overallReadiness}`);
    lines.push(`Summary: ${gapAnalysis.gapAnalysis.summary}`);

    if (gapAnalysis.gapAnalysis.mustHaveGaps.length > 0) {
      lines.push("\nMust-Have Gaps:");
      for (const gap of gapAnalysis.gapAnalysis.mustHaveGaps) {
        lines.push(`- [${gap.impact}] ${gap.item}: ${gap.notes} (${gap.evidenceStatus})`);
      }
    }

    if (gapAnalysis.gapAnalysis.niceToHaveGaps.length > 0) {
      lines.push("\nNice-to-Have Gaps:");
      for (const gap of gapAnalysis.gapAnalysis.niceToHaveGaps) {
        const transferable = gap.transferableFrom ? ` (transferable from: ${gap.transferableFrom})` : "";
        lines.push(`- ${gap.item}${transferable}: ${gap.notes}`);
      }
    }

    if (gapAnalysis.gapAnalysis.strongMatches.length > 0) {
      lines.push("\nStrong Matches (preserve these):");
      for (const m of gapAnalysis.gapAnalysis.strongMatches) {
        lines.push(`- ${m.item}: ${m.notes}`);
      }
    }

    if (gapAnalysis.gapAnalysis.inflatedClaims.length > 0) {
      lines.push("\nInflated Claims (soften or reframe):");
      for (const c of gapAnalysis.gapAnalysis.inflatedClaims) {
        lines.push(`- [${c.severity}] ${c.claim}: ${c.panelNote}`);
      }
    }

    if (gapAnalysis.suggestions.length > 0) {
      lines.push("\nEnhancement Suggestions:");
      for (const sug of gapAnalysis.suggestions) {
        lines.push(`- [${sug.category}] ${sug.suggestion} -> ${sug.proposedChange} (risk: ${sug.risk})`);
      }
    }

    if (gapAnalysis.priorityActions.length > 0) {
      lines.push("\nPriority Actions:");
      for (const a of gapAnalysis.priorityActions) {
        lines.push(`- ${a}`);
      }
    }
  }

  lines.push("### EXPERT DISCUSSION (key transcript excerpts)");
  const maxEntries = Math.min(transcript.length, 8);
  for (let i = 0; i < maxEntries; i++) {
    const entry = transcript[i]!;
    const text = entry.text.replace(/\s+/g, " ").trim().slice(0, 400);
    lines.push(`- [${entry.sender} . ${entry.role}] ${text}`);
  }

  lines.push(
    "Resolve these objections with the candidate's REAL evidence only. Never fabricate " +
    "experience, metrics, or tools to satisfy a reviewer. Where honest proof is absent, " +
    "leave a clearly-marked [ADD: ...] placeholder.",
  );

  return lines.join("\n");
}

/**
 * The final resume MUST be a visibly different, better-structured document
 * than the source. Injected into the system prompt so the model never simply
 * copies the candidate's resume.
 */
function buildDivergenceDirective(blueprint: Blueprint): string {
  const changes =
    blueprint.requiredChanges.length > 0
      ? blueprint.requiredChanges.map((c) => `  - ${c}`).join("\n")
      : "  - none recorded";
  return [
    "## REWRITE, DO NOT COPY",
    "The source resume and template below contain the candidate's REAL content. Your job is to REWRITE it into a better resume:",
    "- Reorganize skills into 3-5 labeled subsections (tools/platforms in Technical Skills; methods/stats in Core Competencies).",
    "- Front-load the strongest metric in the first 3 words of every bullet (Google X-Y-Z formula).",
    "- Replace every `[Experience details to be refined]` placeholder with a strong, quantified achievement bullet grounded in the candidate's title, company, and the job description.",
    "- Apply the role prompt's strict bullet limits (3/3/2/2), page limits, and C-A-R format.",
    "- The output MUST differ structurally from the source: different bullet wording, reordered/regrouped skills, achievement-first phrasing.",
    "",
    "## QUALIFICATIONS, NOT KEYWORDS (recruiter standards)",
    "- Every claimed skill must be proven WHERE it was used: give WHAT (their exact word), HOW (the system you used it in), WHY (what it enabled), WHERE (the job/project). A skill only in the Skills block does not count.",
    "- The FIRST bullet of the most recent relevant role is the most valuable line on the page. Put the highest-priority qualification the posting asked for there, inside one coherent piece of work.",
    "- Serve the hamburger before the hot dog: the posting is the order. Required skills and explicit asks come first, adjacent impressiveness after.",
    "- Never rely on implication. TypeScript does not imply JavaScript, \"cloud\" does not imply AWS, GitHub Actions does not imply CI/CD. If the posting asked for a tool, write its exact word in a bullet.",
    "- Cut vague verbs (led, drove, spearheaded, optimized operations) that would stay true for a completely different job. Replace them with WHAT touched, WHAT used, WHAT changed.",
    "- Numbers only when they carry real scale: team size, users, budget, latency, throughput, volume. A bare percentage with no context is decoration; replace it or cut it.",
    "",
    "The committee's Required Changes below are authoritative — resolve each one:",
    changes,
  ].join("\n");
}

/** V1-style structured user prompt: pre-merged template + gap lists. */
function buildUserPrompt(
  template: ResumeTemplate,
  job: JobState,
  matchedKeywords: string[],
  missingKeywords: string[],
  moderatorFeedback?: string,
  profile?: UserProfile,
): string {
  const sections: string[] = [];

  sections.push(`Role: ${template.role}`);
  sections.push(`\n=== Job Description ===\n${job.jobDescription.slice(0, 6000)}`);
  sections.push(`\n=== Source Resume (candidate reference — rewrite, do NOT copy verbatim) ===\n${job.baseResume.slice(0, 5000)}`);
  if (profile) {
    sections.push(`\n=== Candidate Profile (structured, authoritative — prefer these facts over the source resume) ===\n${buildProfileBio(profile)}`);
  }
  sections.push(`\n=== Template JSON (pre-populated from the source — rewrite every section, resolve the [Experience details to be refined] placeholders) ===\n${JSON.stringify(template, null, 2).slice(0, 8000)}`);
  sections.push(`\nTone: balanced`);
  sections.push(
    `Locked sections: contact and personal information. Never change the candidate's name, contact details (email, phone, location, links), or any personal fact; these stay exactly as provided. Only dynamic content (experience, skills) may change across evaluations.`,
  );

  if (job.sectorFocus?.trim()) {
    sections.push(`Industry Sector: ${job.sectorFocus.trim()}`);
  }

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
  profile?: UserProfile,
): Promise<SophisticatedResumeResult> {
  const roleSlug =
    (job.roleSlug && getTemplate(job.roleSlug) ? job.roleSlug : undefined) ??
    resolveRoleSlug(job.domain, job.jobDescription);
  const template = getTemplate(roleSlug)!;
  const rolePrompt = getRolePrompt(roleSlug)!;
  const screeningChecklist = getScreeningChecklist(roleSlug);

  // V1-style pre-merge: populate the template from the source so the model
  // REWRITES it instead of copying (fixes the "identical to input" output).
  const merged = mergeSourceIntoTemplate(template, job.baseResume);
  const preMergedTemplate = profile
    ? applyProfileToTemplate(merged.template, profile)
    : merged.template;

  // US/UK English variant comes from the job's location (explicit field first,
  // then JD markers, then US default). It drives spelling + terminology.
  const locale = detectEnglishLocale(job.jobLocation, job.jobDescription);
  const localeDirective = buildEnglishVariantDirective(locale);
  const typographyDirective = buildTypographyDirective();
  const divergenceDirective = buildDivergenceDirective(blueprint);

  // Controlled enhancement tier (Layer 3, plan 6b-6d): the user's choice wins;
  // otherwise a regulated sector or low panel confidence defaults to
  // Conservative, and everything else to Balanced.
  const sector = job.sectorFocus ?? job.jdMeta?.sector;
  const lowPanelConfidence = (job.analyses ?? []).some((a) => a.confidence === "Low");
  const tier: EnhancementTier = job.generate?.enhancementTier
    ?? defaultEnhancementTier({ sector, lowPanelConfidence });
  const coreDirective = buildCoreDirective();
  const enhancementDirective = buildEnhancementDirective({ tier, sector });
  const screeningDirective =
    screeningChecklist.length > 0
      ? [
          "## ROLE SCREENING CHECKLIST (MINIMUM BAR)",
          "These baseline expectations are the FLOOR the role is screened on. The posting and the candidate's seniority raise the bar. Make sure the resume evidences each one with a WHERE (a bullet), using the posting's exact words -- never imply them.",
          ...screeningChecklist.map((item) => `  - ${item}`),
        ].join("\n")
      : "";

  const committeeSection = buildCommitteeSection(blueprint, job.transcript, job.gapAnalysis);
  const amendmentSection = job.amendmentNotes
    ? [
        "## USER AMENDMENT NOTES",
        "The candidate has provided these additional instructions:",
        job.amendmentNotes,
        "",
        "Honor these instructions where they are defensible and honest. Do not fabricate experience to satisfy them -- use [ADD: ...] placeholders for unverifiable claims.",
      ].join("\n")
    : "";
  const baseSystemPrompt = [
    coreDirective,
    rolePrompt,
    committeeSection,
    enhancementDirective,
    localeDirective,
    typographyDirective,
    screeningDirective,
    divergenceDirective,
    amendmentSection,
  ]
    .filter(Boolean)
    .join("\n\n");

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
  let enhancements: ResumeEnhancement[] = [];
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
      preMergedTemplate,
      job,
      matchedKeywords,
      missingKeywords,
      moderatorFeedback,
      profile,
    );

    const raw = await llm.complete(systemPrompt, userPrompt, {
      temperature: GENERATION_TEMPERATURE,
      maxTokens: GENERATION_MAX_TOKENS,
    });

    json = extractResumeJson(raw);
    const parsed = JSON.parse(json) as Partial<ResumeTemplate> & {
      enhancements?: unknown;
    };
    enhancements = normalizeEnhancements(parsed.enhancements);

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
      ? await moderateResume(
          json,
          job.jobDescription,
          llm,
          locale,
          screeningChecklist,
          enhancements,
          tier,
          sector,
          blueprint,
        )
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

  // Enforce the typography rules deterministically on BOTH representations so
  // no em-dash / smart-quote / emoji survives into the stored resume, even if
  // the model ignored the prompt block. The audit-trail `enhancements` key is
  // stripped here: it is stored in ResumeMeta, not inside the template JSON.
  const { enhancements: _stripped, ...cleanedJson } = JSON.parse(
    sanitizeText(json),
  ) as ResumeTemplate & { enhancements?: unknown };
  const markdown = sanitizeText(resumeToMarkdown(cleanedJson));

  // Screening-floor coverage for the meta panel (matched/total baseline items).
  const screening = auditScreening(markdown, screeningChecklist);

  return {
    markdown,
    json: JSON.stringify(cleanedJson, null, 2),
    meta: {
      role: roleSlug,
      roleLabel: template.role,
      atsScore,
      moderationScore: moderation?.score ?? 0,
      moderationApproved: moderation?.approved ?? false,
      iterations,
      locale,
      screeningCoverage: screeningChecklist.length > 0 ? {
        matched: screening.matched,
        total: screening.total,
      } : undefined,
      // Tsenta framing: the ATS score is keyword overlap, not a prediction.
      atsScoreNote:
        "Keyword overlap with the posting — a screening aid, NOT an ATS score or a prediction. Use it to catch a word you forgot, then ignore the number.",
      // Controlled-enhancement audit trail (Layer 3, plan 6c): every added or
      // materially expanded bullet, traceable to its source + justification.
      enhancementTier: tier,
      enhancements: enhancements.length > 0 ? enhancements : undefined,
      // Full auditor feedback so the candidate can see what was flagged and fix it.
      moderator: moderation
        ? {
            score: moderation.score,
            approved: moderation.approved,
            summaryVerdict: moderation.summaryVerdict,
            bannedPhrases: moderation.bannedPhrases,
            issues: moderation.issues,
            suggestions: moderation.suggestions,
          }
        : undefined,
    },
  };
}

export { extractJDKeywords, scoreResume, resumeToText };
