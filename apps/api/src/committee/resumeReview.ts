import {
  resumeEvaluationSchema,
  type JobState,
  type ResumeComparison,
  type ResumeEvaluationInput,
} from "@rattlesnake/shared";
import type { LLMClient } from "../llm/types.js";
import { getTemplate } from "../resume/roleRegistry.js";
import { buildProfileBio } from "../resume/profile.js";

/**
 * Resume A/B review panel (design plan R2). Three lightweight reviewer seats
 * score a resume version against the SAME job description with the SAME
 * rubric; the comparison is computed deterministically in code, never by an
 * LLM. Reviewers are blind to the committee verdict (locked decision).
 *
 * A failed seat degrades to a neutral baseline with a synthetic issue so the
 * pipeline never blocks - the same policy as the executive review.
 */

export const COMPARISON_WEIGHTS = {
  jdCoverage: 0.35,
  credibility: 0.3,
  clarity: 0.2,
  atsReadiness: 0.15,
} as const;

const TIE_BAND = 3;
const FALLBACK_SCORE = 60;

interface ReviewerSeat {
  id: "ats_screener" | "hiring_manager" | "resume_editor";
  /** First-line marker the mock provider routes on. */
  marker: string;
  persona: string;
  emphasis: string;
}

const REVIEWER_SEATS: ReviewerSeat[] = [
  {
    id: "ats_screener",
    marker: "resume ats screener",
    persona: "an ATS screener",
    emphasis:
      "Judge keyword and requirement coverage against the job description, title alignment, and how reliably automated systems will parse the document.",
  },
  {
    id: "hiring_manager",
    marker: "resume hiring manager",
    persona: "the hiring manager for this role",
    emphasis:
      "Judge evidence density and credibility: would you trust every claim, does the resume clear the objections a panel would raise, is anything inflated?",
  },
  {
    id: "resume_editor",
    marker: "resume editor",
    persona: "a senior resume editor",
    emphasis:
      "Judge phrasing quality, structure, consistency, and typography: is every bullet sharp, parallel, and free of filler?",
  },
];

export function buildResumeEvaluationPrompt(
  seat: ReviewerSeat,
  job: JobState,
  resumeJson: string,
): string {
  const roleSlug =
    (job.roleSlug && getTemplate(job.roleSlug) ? job.roleSlug : undefined) ??
    undefined;
  const roleLabel = (roleSlug && getTemplate(roleSlug)?.role) ?? roleSlug ?? "the target role";

  return `You are ${seat.persona} reviewing a candidate resume against a job description. ${seat.emphasis}

## SCORING RUBRIC (all four, 0-100)
- jdCoverage: how completely the resume evidences the JD's hard requirements.
- credibility: how believable and defensible every claim is.
- clarity: phrasing quality, structure, scannability.
- atsReadiness: standard headings, parseability, keyword alignment.

## RULES
- Be calibrated: 50 is mediocre, 75 is good, 90+ is exceptional. Do not inflate.
- Findings must quote or point at the actual resume text. Never invent issues.
- You do not see the committee's verdict on purpose: judge this document on its own.
- Plain ASCII punctuation only - no em-dashes, smart quotes, or emoji.

## JOB DESCRIPTION
${job.jobDescription.slice(0, 3000)}

## RESUME UNDER REVIEW (structured JSON)
${resumeJson.slice(0, 8000)}

## OUTPUT FORMAT (strict JSON, no markdown fences, no prose)
{
  "scores": { "jdCoverage": number, "credibility": number, "clarity": number, "atsReadiness": number },
  "strengths": ["<specific strength>", ...],
  "issues": [ { "severity": "high" | "medium" | "low", "section": "<resume section>", "finding": "<what is wrong>", "fixHint": "<how to fix it>" }, ... ],
  "verdict": "ship" | "revise"
}`;
}

function fallbackEvaluation(reason: string): ResumeEvaluationInput {
  return {
    scores: {
      jdCoverage: FALLBACK_SCORE,
      credibility: FALLBACK_SCORE,
      clarity: FALLBACK_SCORE,
      atsReadiness: FALLBACK_SCORE,
    },
    strengths: [],
    issues: [
      {
        severity: "low",
        section: "Reviewer",
        finding: `This reviewer seat failed and fell back to a neutral baseline: ${reason}`,
        fixHint: "Re-run the A/B review to get a full panel verdict.",
      },
    ],
    verdict: "revise",
  };
}

function evaluateSeat(
  seat: ReviewerSeat,
  job: JobState,
  resumeJson: string,
  llm: LLMClient,
): Promise<ResumeEvaluationInput> {
  return llm
    .complete(
      buildResumeEvaluationPrompt(seat, job, resumeJson),
      "Produce the evaluation JSON only.",
      { temperature: 0.1, maxTokens: 1200 },
    )
    .then((raw) => {
      const json = raw
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/```\s*$/, "");
      const validated = resumeEvaluationSchema.safeParse(JSON.parse(json) as unknown);
      if (!validated.success) {
        console.warn(
          `[pipeline] resume reviewer ${seat.id} failed schema validation for job ${job.id}; using neutral baseline`,
        );
        return fallbackEvaluation("schema validation failed");
      }
      return validated.data;
    })
    .catch((err) => {
      console.warn(
        `[pipeline] resume reviewer ${seat.id} failed for job ${job.id}; using neutral baseline:`,
        err,
      );
      return fallbackEvaluation("reviewer call failed");
    });
}

/** Runs the three reviewer seats sequentially (bounded LLM spend, D5). */
export async function evaluateResume(
  job: JobState,
  resumeJson: string,
  llm: LLMClient,
): Promise<ResumeEvaluationInput> {
  const results: ResumeEvaluationInput[] = [];
  for (const seat of REVIEWER_SEATS) {
    results.push(await evaluateSeat(seat, job, resumeJson, llm));
  }

  const mean = (key: keyof ResumeEvaluationInput["scores"]) =>
    Math.round(results.reduce((acc, r) => acc + r.scores[key], 0) / results.length);

  const strengths = [
    ...new Set(results.flatMap((r) => r.strengths)),
  ].slice(0, 8);
  const issues = results
    .flatMap((r) => r.issues)
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
    .slice(0, 12);
  const verdict = results.some((r) => r.verdict === "revise") ? "revise" : "ship";

  return {
    scores: {
      jdCoverage: mean("jdCoverage"),
      credibility: mean("credibility"),
      clarity: mean("clarity"),
      atsReadiness: mean("atsReadiness"),
    },
    strengths,
    issues,
    verdict,
  };
}

function severityRank(severity: "high" | "medium" | "low"): number {
  return severity === "high" ? 3 : severity === "medium" ? 2 : 1;
}

/** Weighted total with the locked weights (D10). */
export function weightedTotal(scores: ResumeEvaluationInput["scores"]): number {
  const raw =
    scores.jdCoverage * COMPARISON_WEIGHTS.jdCoverage +
    scores.credibility * COMPARISON_WEIGHTS.credibility +
    scores.clarity * COMPARISON_WEIGHTS.clarity +
    scores.atsReadiness * COMPARISON_WEIGHTS.atsReadiness;
  return Math.round(raw * 10) / 10;
}

/** Deterministic comparison - the LLM never picks the winner (D10). */
export function computeComparison(
  v1: ResumeEvaluationInput,
  v2: ResumeEvaluationInput,
): ResumeComparison {
  const v1Total = weightedTotal(v1.scores);
  const v2Total = weightedTotal(v2.scores);
  const dimensionDeltas: Record<string, number> = {
    jdCoverage: round1(v2.scores.jdCoverage - v1.scores.jdCoverage),
    credibility: round1(v2.scores.credibility - v1.scores.credibility),
    clarity: round1(v2.scores.clarity - v1.scores.clarity),
    atsReadiness: round1(v2.scores.atsReadiness - v1.scores.atsReadiness),
  };
  const diff = round1(v2Total - v1Total);
  const recommendation: ResumeComparison["recommendation"] =
    Math.abs(diff) <= TIE_BAND ? "tie" : diff > 0 ? "v2" : "v1";

  const biggestMove = Object.entries(dimensionDeltas).sort(
    (a, b) => Math.abs(b[1]) - Math.abs(a[1]),
  )[0];
  const rationale =
    recommendation === "tie"
      ? `Both versions score within ${TIE_BAND} points (v1 ${v1Total} vs v2 ${v2Total}); pick whichever reads better to you.`
      : `Version ${recommendation === "v2" ? "2" : "1"} leads by ${Math.abs(diff)} points overall; the largest move is ${biggestMove?.[0]} (${biggestMove?.[1]! > 0 ? "+" : ""}${biggestMove?.[1]}).`;

  return { v1Total, v2Total, dimensionDeltas, recommendation, rationale };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Warn-only fabrication guard (locked decision): flags tokens that appear in
 * v2 but not in v1. Never blocks; the warning is appended to EVAL(v2) issues.
 */
export function checkNetNewClaims(
  v1Markdown: string,
  v2Markdown: string,
): string[] {
  const tokenize = (text: string) =>
    new Set(
      text
        .split(/[^A-Za-z0-9.+#]+/)
        .filter((t) => t.length > 3)
        .map((t) => t.toLowerCase()),
    );
  const v1Tokens = tokenize(v1Markdown);
  const v2Tokens = tokenize(v2Markdown);
  const netNew = [...v2Tokens].filter((t) => !v1Tokens.has(t)).slice(0, 8);
  return netNew;
}
