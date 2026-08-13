import type { EnglishLocale } from "@rattlesnake/shared";
import type { LLMClient } from "../llm/types.js";

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
): Promise<ModerationResult> {
  const systemPrompt = `${MODERATOR_SYSTEM_PROMPT}\n\n${LOCALE_NOTE[locale]}`;
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

    return {
      score: typeof parsed.score === "number" ? Math.max(0, Math.min(100, parsed.score)) : 50,
      approved: parsed.approved ?? ((parsed.score ?? 50) >= 75),
      summaryVerdict: parsed.summaryVerdict ?? "Moderation completed.",
      bannedPhrases: Array.isArray(parsed.bannedPhrases) ? parsed.bannedPhrases : [],
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
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
