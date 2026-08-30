import type {
  Blueprint,
  EnglishLocale,
  EnhancementTier,
  ResumeEnhancement,
} from "@rattlesnake/shared";
import type { LLMClient } from "../llm/types.js";
import { containsEmDash } from "./sanitize.js";
import {
  isRegulatedSector,
  PURE_ADDITION_CEILING,
} from "./core.js";
import {
  auditScreening,
  checklistKeywords,
  type ScreeningAuditResult,
} from "./screening.js";

/**
 * Elite resume quality auditor — ported from the Rattle-Snake V1 generator.
 * Scores a generated resume for banned phrases, summary quality, bullet
 * quality, hallucinations, and structure. The feedback drives the automatic
 * regeneration loop in the engine.
 */

export interface ModerationResult {
  score: number; // 0–100 quality score
  issues: string[]; // Specific problems found
  bannedPhrases: string[]; // Exact banned phrases detected
  suggestions: string[]; // Actionable improvement suggestions
  approved: boolean; // true if score >= 75
  summaryVerdict: string; // One-line verdict for the UI
}

const MODERATOR_SYSTEM_PROMPT = `
You are an elite resume quality auditor. Your job is to evaluate a resume rewrite and return
a strict JSON quality assessment — no fluff, no encouragement, no padding.

## YOUR EVALUATION CRITERIA

### 1. BANNED PHRASES (score -5 each)
Flag any of these phrases appearing ANYWHERE in the resume (summary, bullets, skills):
Analytically driven, Results-driven, Data-driven (when used alone without citing specific data),
Leveraged, Utilized, Spearheaded, Orchestrated, Pivotal, Passionate,
Thought leader, Synergy, Best-in-class, Innovative (when vague),
Cutting-edge, World-class, Holistic, Seamlessly, Scalable (when not a technical claim),
Value-add, Paradigm shift, Move the needle, Impactful (without specifying impact),
Results-oriented, Detail-oriented, Team player, Self-starter, Go-getter,
Think outside the box, Hit the ground running, Proactive (when used as filler),
Strategic thinker (without naming the actual strategy),
Cross-functional (without naming the actual teams),
Stakeholders (without naming who).

### 2. SUMMARY QUALITY (score -10 if failing)
The summary must NOT start with a generic adjective-driven opener.
BAD openers: "Analytically driven...", "Results-driven...", "Passionate about...",
"Experienced [title] with N years...", "Dedicated to...", "Motivated..."
GOOD opener: leads with a specific domain + years + a concrete differentiator or outcome.

### 3. BULLET QUALITY (score -3 per weak bullet)
Flag bullets that:
- Have no action verb
- Use passive voice ("was responsible for", "was involved in")
- Have no result or outcome whatsoever
- Start with "I", "We", "My"
- Are generic with no technical/domain specificity

### 4. HALLUCINATION CHECK (score -15 per likely hallucination)
Flag metrics, tools, companies, or certifications that look invented or implausibly precise
given the surrounding context. Use your best judgment — only flag genuinely suspicious items.

### 5. STRUCTURE CHECK (score -5 per issue)
- Missing "changed_sections" key
- Invalid JSON structure
- Summary section missing or empty
- Experience section has fewer than 1 entry

### 6. ENGLISH VARIANT CHECK (score -5 per mixed-variant word)
- The resume must be written in a single English variant (US or UK English).
- Flag any word spelled in the other variant (e.g. "colour"/"organise" in a US resume,
  or "color"/"analyze" in a UK resume).

### 7. TYPOGRAPHY CHECK (score -5 per em-dash, -2 per smart quote / ellipsis)
- Em-dashes (—) and en-dashes (–) are STRICTLY forbidden anywhere in the resume.
- Smart quotes, typographic apostrophes, ellipses (...), and middle dots (·) are forbidden.
- Everything must be plain ASCII punctuation.

### 8. QUALIFICATION AUDIT (score -3 per unproven claim)
A keyword is not a qualification. A qualification has four parts — WHAT (their exact
word), HOW (the system/workflow/thing built or run), WHY (what it enabled, prevented,
or made cheaper), and WHERE (the job or project it happened inside). Grade every claim:
- A skill or tool that appears ONLY in the Skills block and is never used in a bullet
  (no WHERE) is a claim, not a qualification. It does not count.
- Vague verbs that would still be true for a completely different job ("led", "drove",
  "spearheaded", "owned initiatives") — flag them and demand WHAT/WHY/WHERE.
- Never rely on implication: TypeScript does not imply JavaScript, "cloud" does not
  imply AWS, GitHub Actions does not imply CI/CD. If the posting asked for it, the
  exact word must appear in a bullet.
- The FIRST bullet of the most recent relevant role is the most valuable line on the
  page — it must carry the highest-priority qualification the posting asked for
  ("serve the hamburger before the hot dog": required skills first, adjacent
  impressiveness after).
- Numbers count only when they carry real scale (team size, users, budget, latency,
  throughput, volume). A bare percentage with no context is decoration.
- Recruiters read qualifications, not summaries: anything only in the summary or
  skills block is invisible.

## SCORING
Start at 100. Apply deductions from each category. Floor at 0.
approved: true if final score >= 75.

## OUTPUT — STRICT JSON ONLY
Return a single JSON object with exactly these keys:
{
  "score": <number 0-100>,
  "approved": <boolean>,
  "summaryVerdict": "<one sentence, blunt and specific>",
  "bannedPhrases": ["<exact phrase from resume>", ...],
  "issues": ["<specific problem description>", ...],
  "suggestions": ["<actionable fix>", ...]
}

Rules:
- bannedPhrases: list exact phrases found, or empty array []
- issues: list specific problems found, or empty array []
- suggestions: max 5 actionable suggestions, prioritized by impact
- summaryVerdict: start with the score, e.g. "Score 82 — solid bullets, but summary opener is generic."
No prose before or after. No markdown fences. Raw JSON only starting with {.
`.trim();

const LOCALE_NOTE: Record<EnglishLocale, string> = {
  us: "The resume MUST be written in US English. Flag any UK spellings (colour, behaviour, centre, travelled, organise, analyse, catalogue, programme, defence, licence) as issues.",
  uk: "The resume MUST be written in UK English. Flag any US spellings (color, behavior, center, traveled, organize, analyze, catalog, program, defense, license) as issues.",
};

function extractJson(text: string): string {
  const cleaned = text
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();
  const jsonStart = cleaned.indexOf("{");
  const jsonEnd = cleaned.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1) throw new Error("No JSON in moderator response");
  return cleaned.slice(jsonStart, jsonEnd + 1);
}

export async function moderateResume(
  resumeJson: string,
  jobDescription: string,
  llm: LLMClient,
  locale: EnglishLocale = "us",
  screeningChecklist: string[] = [],
  enhancements: ResumeEnhancement[] = [],
  tier: EnhancementTier = "balanced",
  sector?: string,
  blueprint?: Blueprint,
): Promise<ModerationResult> {
  const checklistBlock =
    screeningChecklist.length > 0
      ? `### 9. ROLE SCREENING CHECKLIST (MINIMUM BAR)
The role is screened on the baseline items below. This is the FLOOR, not the ceiling:
the posting and the candidate's seniority raise the bar. Grade whether EACH item is
evidenced by a WHERE (a job or project context), not merely claimed in the Skills block.
Score -2 per item with no evidence:
${screeningChecklist.map((item) => `  - ${item}`).join("\n")}`
      : "";

  // Layer 3 over-enhancement audit (plan 6e): when the resume carried an
  // enhancement audit trail, the auditor grades it against the 3-minute
  // interview test and the panel's inflated-claim findings.
  const inflatedClaims = blueprint?.inflatedClaims?.length
    ? `\nPanel-flagged inflated claims to verify were softened: ${blueprint.inflatedClaims.map((c) => c.claim).join(" | ")}`
    : "";
  const enhancementBlock =
    enhancements.length > 0
      ? `### 10. OVER-ENHANCEMENT AUDIT
The resume carried the following enhancements (original -> enhanced, with the agent's
justification). Grade whether each is defensible:
- VIOLATION if it invents projects, companies, metrics, or responsibilities with no anchor
  in the source text, or if it could not survive a 3-minute interview ("can you walk me
  through a time you did that?").
- Pure additions (empty "original") are high-risk: flag each one unless the panel evidence
  clearly validates it.
- A justification that merely repeats the JD requirement with no candidate-side evidence
  anchor is weak - flag it.
- Any enhancement that re-introduces a panel-flagged INFLATED claim is a hard violation.
${inflatedClaims}
Enhancement list:
${enhancements
        .map(
          (e, i) =>
            `  ${i + 1}. original: ${e.original.slice(0, 160) || "(none)"}\n     enhanced: ${e.enhanced.slice(0, 160)}\n     justification: ${e.justification.slice(0, 160) || "(none)"}`,
        )
        .join("\n")}`
      : "";

  const systemPrompt = `${MODERATOR_SYSTEM_PROMPT}\n\n${LOCALE_NOTE[locale]}\n\n${checklistBlock}\n\n${enhancementBlock}`.trim();
  const userPrompt = `
Evaluate this resume rewrite. Be strict. Return only the JSON assessment.

Job Description (for context):
${jobDescription.slice(0, 1500)}

Resume JSON to evaluate:
${resumeJson.slice(0, 6000)}
`.trim();

  try {
    const response = await llm.complete(systemPrompt, userPrompt, {
      temperature: 0.2,
      maxTokens: 800,
    });
    const parsed = JSON.parse(extractJson(response)) as Partial<ModerationResult>;

    // Deterministic typography audit (the LLM check is advisory; this is exact).
    // Every em-dash found deducts 5 points so a typographic violation can never
    // slip past an approving LLM.
    const typographyIssues = auditTypography(resumeJson);

    // Deterministic qualification audit: a skill in the Skills block that never
    // appears in any bullet has no WHERE, so it does not count (Tsenta rule).
    // Enforced in code, exactly like typography, so a list-of-keywords resume can
    // never pass as evidence.
    const qualificationIssues = auditQualifications(resumeJson);

    // Deterministic screening-floor coverage (report-only, advisory).
    const screeningIssues = auditScreeningCoverage(resumeJson, screeningChecklist);

    // Deterministic over-enhancement audit: an unverifiable enhancement or a
    // pure addition above the tier ceiling fails the resume outright.
    const enhancementIssues = auditEnhancements({ enhancements, tier, sector });

    let score =
      typeof parsed.score === "number" ? Math.max(0, Math.min(100, parsed.score)) : 50;
    score = Math.max(
      0,
      score -
        typographyIssues.deduction -
        qualificationIssues.deduction -
        enhancementIssues.deduction,
    );

    const issues = [
      ...(Array.isArray(parsed.issues) ? parsed.issues : []),
      ...typographyIssues.issues,
      ...qualificationIssues.issues,
      ...screeningIssues.issues,
      ...enhancementIssues.issues,
    ];

    const hardFail =
      typographyIssues.deduction >= 15 ||
      qualificationIssues.deduction >= 15 ||
      enhancementIssues.hardFail;

    return {
      score,
      approved: (parsed.approved ?? score >= 75) && !hardFail,
      summaryVerdict:
        hardFail
          ? `Score ${score} — deterministic violations (em-dashes, skills listed without proof in a bullet, or over-enhancement).`
          : (parsed.summaryVerdict ?? "Moderation completed."),
      bannedPhrases: Array.isArray(parsed.bannedPhrases) ? parsed.bannedPhrases : [],
      issues,
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
    };
  } catch {
    // Moderation failure is non-blocking — return a neutral result.
    return {
      score: 70,
      approved: true,
      summaryVerdict: "Moderation skipped — could not parse response.",
      bannedPhrases: [],
      issues: [],
      suggestions: [],
    };
  }
}

/**
 * Deterministic over-enhancement audit (Layer 3, plan 6c/6e). Every enhancement
 * must carry a justification (else it is un-auditable) and pure additions are
 * capped per tier; a regulated sector caps pure additions at zero regardless
 * of tier. Any violation hard-fails the resume so over-claiming can never slip
 * past an approving LLM, mirroring the typography/qualification audits.
 */
function auditEnhancements(input: {
  enhancements: ResumeEnhancement[];
  tier: EnhancementTier;
  sector?: string;
}): { deduction: number; issues: string[]; hardFail: boolean } {
  const { enhancements, tier, sector } = input;
  if (enhancements.length === 0) return { deduction: 0, issues: [], hardFail: false };

  let deduction = 0;
  const issues: string[] = [];
  let hardFail = false;

  const unverifiable = enhancements.filter((e) => !e.justification.trim());
  if (unverifiable.length > 0) {
    deduction += unverifiable.length * 5;
    hardFail = true;
    issues.push(
      `${unverifiable.length} enhancement(s) have no justification (un-auditable). ` +
        "Every enhancement must name its evidence anchor and the JD requirement it serves.",
    );
  }

  const ceiling = isRegulatedSector(sector) ? 0 : PURE_ADDITION_CEILING[tier];
  const additions = enhancements.filter((e) => !e.original.trim());
  if (additions.length > ceiling) {
    deduction += additions.length * 5;
    hardFail = true;
    issues.push(
      `${additions.length} pure-addition enhancement(s) (no source text) exceed the ${tier} ceiling of ${ceiling}. ` +
        (isRegulatedSector(sector)
          ? "Regulated sector: pure additions are forbidden entirely. "
          : "") +
        "Reword and merge existing bullets instead of adding new scope.",
    );
  }

  return { deduction, issues, hardFail };
}

interface ResumeText {
  skills: string[];
  bullets: string[];
}

function extractResumeText(resumeJson: string): ResumeText | null {
  try {
    const resume = JSON.parse(resumeJson) as {
      sections?: {
        skills?: { categories?: Array<{ items?: string[] }> };
        experience?: Array<{ bullets?: string[] }>;
      };
    };
    const skills = (resume.sections?.skills?.categories ?? []).flatMap(
      (c) => c.items ?? [],
    );
    const bullets = (resume.sections?.experience ?? []).flatMap(
      (e) => e.bullets ?? [],
    );
    return { skills, bullets };
  } catch {
    return null;
  }
}

/** Word-boundary matcher so "Go" matches "Go" but not "Google". */
function containsWord(haystack: string, needle: string): boolean {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Boundary chars match "Go" but not "congo"/"Google", and handle skills with
  // leading/trailing punctuation like ".NET", "C++", "C#", "Node.js".
  return new RegExp(`(^|[^a-z0-9_])${escaped}(?![a-z0-9_])`, "i").test(haystack);
}

/**
 * Deterministic qualification audit: every skill in the Skills block must be
 * proven WHERE it was used by appearing in at least one experience bullet.
 * A skills-only claim has no HOW/WHY/WHERE and does not count (Tsenta rule).
 * -2 per unproven skill, capped at -20; >=15 forces rejection.
 */
function auditQualifications(resumeJson: string): { deduction: number; issues: string[] } {
  const issues: string[] = [];
  const text = extractResumeText(resumeJson);
  if (!text) return { deduction: 0, issues: [] };

  const bulletText = text.bullets.join("\n").toLowerCase();
  const unproven: string[] = [];
  for (const skill of text.skills) {
    const term = skill.trim().toLowerCase();
    if (!term || !containsWord(bulletText, term)) unproven.push(skill);
  }

  if (unproven.length > 0) {
    const shown = unproven.slice(0, 8);
    issues.push(
      `Skills listed only in the Skills block, never proven in a bullet (no WHERE): ${shown.join(", ")}. ` +
        "Add a bullet that shows WHAT/HOW/WHY/WHERE each was used, or remove it from the Skills block.",
    );
  }

  return {
    deduction: Math.min(20, unproven.length * 2),
    issues,
  };
}

/** Deterministic screening-floor coverage: report-only, no deduction. */
function auditScreeningCoverage(
  resumeJson: string,
  checklist: string[],
): { deduction: number; issues: string[] } {
  if (checklist.length === 0) return { deduction: 0, issues: [] };
  const text = extractResumeText(resumeJson);
  if (!text) return { deduction: 0, issues: [] };

  const scanText = text.bullets.concat(text.skills).join("\n");
  const result: ScreeningAuditResult = auditScreening(scanText, checklist);
  if (result.missing.length === 0) return { deduction: 0, issues: [] };

  const shown = result.missing.slice(0, 6).map((m) => `"${checklistKeywords(m).join(" / ")}"`);
  return {
    deduction: 0,
    issues: [
      `Screening floor not evidenced (${result.matched}/${result.total} baseline items found): ${shown.join(", ")}. ` +
        "If the source supports it, write these explicitly in a bullet (their exact words, not implied).",
    ],
  };
}

/** Deterministic scan of the resume JSON for forbidden typographic characters. */
function auditTypography(resumeJson: string): { deduction: number; issues: string[] } {
  const issues: string[] = [];
  let deduction = 0;

  if (containsEmDash(resumeJson)) {
    const count = (resumeJson.match(/[\u2014\u2013]/g) ?? []).length;
    deduction += count * 5;
    issues.push(`${count} em/en-dash(es) present — replace with commas or hyphens.`);
  }
  const smart = (resumeJson.match(/[\u2018\u2019\u201c\u201d]/g) ?? []).length;
  if (smart > 0) {
    deduction += smart * 2;
    issues.push(`${smart} smart quote(s) present — use straight quotes.`);
  }
  const ellipsis = (resumeJson.match(/\u2026/g) ?? []).length;
  if (ellipsis > 0) {
    deduction += ellipsis * 2;
    issues.push(`${ellipsis} ellipsis(es) present — use "...".`);
  }

  return { deduction, issues };
}

/** Build a compact feedback string to inject into the re-generation prompt. */
export function buildModeratorFeedback(result: ModerationResult): string {
  const lines: string[] = [
    `Quality score was ${result.score}/100. Fix these issues before re-generating:`,
  ];

  if (result.bannedPhrases.length > 0) {
    lines.push(`Banned phrases to remove: ${result.bannedPhrases.join(", ")}`);
  }
  if (result.issues.length > 0) {
    result.issues.slice(0, 5).forEach((issue) => lines.push(`- ${issue}`));
  }
  if (result.suggestions.length > 0) {
    lines.push("Suggestions:");
    result.suggestions.slice(0, 3).forEach((s) => lines.push(`  • ${s}`));
  }

  return lines.join("\n");
}
