import type { Confidence, Decision } from "@rattlesnake/shared";

export interface ParsedDecision {
  decision: Decision;
  /** The sentence/line that stated the decision, marker stripped. */
  reason: string;
}

const DECISION_PATTERNS: RegExp[] = [
  /\[STRONG\s+(HIRE|REJECT)\]/i,
  /\[DECISION:\s*(HIRE|REJECT)\]/i,
  /\[VERDICT:\s*(HIRE|REJECT)\]/i,
  /STRONG\s+(HIRE|REJECT)/i,
];

/**
 * Extract a forced non-neutral decision from an agent response.
 *
 * Ordered strategy:
 *   1. explicit bracketed markers   -> highest confidence
 *   2. "STRONG HIRE / STRONG REJECT" -> high confidence
 *   3. decision keywords in the last 400 chars -> medium confidence
 *   4. whole-text keyword scoring   -> safety net (never returns undefined)
 *
 * Returns undefined ONLY if the text is genuinely too short to judge — in
 * that case the caller re-prompts the agent (retry loop).
 */
export function parseDecision(text: string): ParsedDecision | undefined {
  const trimmed = text.trim();
  if (trimmed.length < 20) return undefined;

  for (const pattern of DECISION_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) return buildParsedDecision(match[1]!.toUpperCase() as Decision, match[0], trimmed);
  }

  const tail = trimmed.slice(-400);
  const hireHits = (tail.match(/\bhire\b/gi) ?? []).length;
  const rejectHits = (tail.match(/\breject\b/gi) ?? []).length;
  if (hireHits !== rejectHits) {
    const decision = hireHits > rejectHits ? "HIRE" : "REJECT";
    const line = tail.split("\n").find((l) => /\b(hire|reject)\b/i.test(l));
    return { decision, reason: (line ?? tail.split("\n").pop() ?? "").trim() };
  }

  const full = trimmed.toLowerCase();
  const hireScore = count(full, [
    "strong hire",
    "should hire",
    "recommend hiring",
    "proceed",
    "yes",
    "good fit",
    "excellent fit",
  ]);
  const rejectScore = count(full, [
    "strong reject",
    "should reject",
    "do not hire",
    "not a fit",
    "reject",
    "no",
  ]);
  if (hireScore !== rejectScore) {
    return {
      decision: hireScore > rejectScore ? "HIRE" : "REJECT",
      reason: `keyword-weighted fallback (hire=${hireScore}, reject=${rejectScore})`,
    };
  }

  return undefined;
}

/** True when the response reads as passive/evasive rather than decisive. */
export function hasNeutralLanguage(text: string): boolean {
  return /(neutral|average|decent candidate|weak lean|maybe|could go either way|on the fence|undecided|not sure)/i.test(
    text,
  );
}

const CONFIDENCE_PATTERN = /\[CONFIDENCE\]\s*[:#-]?\s*(High|Medium|Low)/i;

/**
 * Extract the seat's evidence-strength confidence from a prose turn. Defaults
 * to "Medium" when the marker is absent (safe middle ground for the weight).
 */
export function parseConfidence(text: string): Confidence {
  const match = text.match(CONFIDENCE_PATTERN);
  if (match) {
    const value = match[1]!;
    if (value === "High" || value === "Medium" || value === "Low") return value;
  }
  return "Medium";
}

const INFLATED_CLAIM_PATTERN = /INFLATED_CLAIM\s*:\s*"?([^"\n]+)"?/gi;

/**
 * Extract every INFLATED_CLAIM: line from a prose turn. The captured text is
 * the claim itself (trailing "-> evidence:" context is trimmed). Returns []
 * when none were flagged.
 */
export function parseInflatedClaims(text: string): string[] {
  const claims: string[] = [];
  for (const match of text.matchAll(INFLATED_CLAIM_PATTERN)) {
    const claim = match[1]?.trim() ?? "";
    if (claim.length === 0) continue;
    claims.push(claim.replace(/\s*->.*$/i, "").trim());
  }
  return claims;
}

function buildParsedDecision(decision: Decision, marker: string, text: string): ParsedDecision {
  const lines = text.split("\n");
  const markerLine = lines.find((l) => l.includes(marker));
  const reason = (markerLine ?? text.slice(-200))
    .replace(marker, "")
    .replace(/^[\s\-:]+/, "")
    .replace(/[\[\]]/g, "")
    .trim();
  return { decision, reason };
}

function count(text: string, needles: string[]): number {
  return needles.reduce((acc, n) => {
    const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = /[a-z0-9]/.test(n)
      ? new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, "g")
      : new RegExp(escaped, "g");
    return acc + (pattern.test(text) ? 1 : 0);
  }, 0);
}
