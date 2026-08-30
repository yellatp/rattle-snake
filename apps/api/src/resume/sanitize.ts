/**
 * Shared text hygiene for resumes AND debate transcripts.
 *
 * Guarantees the two explicit output rules: no em-dashes / en-dashes, and no
 * unprofessional emojis. Also normalizes smart quotes and ellipses so plain
 * text stays portable (PDF, DOCX, ATS parsers).
 *
 * The V1 generator relied on a single sanitizer at JSON-extraction time; V2
 * centralizes the rules here so the resume path AND the debate path share one
 * source of truth.
 */

/** Em-dash (U+2014) and en-dash (U+2013) — banned everywhere in output. */
export function containsEmDash(text: string): boolean {
  return text.includes("\u2014") || text.includes("\u2013");
}

/** Detect emojis and other symbols outside the printable ASCII + Latin-1 + common punctuation set. */
export function containsUnprofessionalEmoji(text: string): boolean {
  return /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u.test(text);
}

/**
 * Replace typographic characters that don't belong in plain-text content.
 * Em-dash becomes ", ", en-dash becomes "-" (mirrors V1's sanitizeResumeText).
 */
export function sanitizeTypography(text: string): string {
  return text
    .replace(/\u2014/g, ", ")
    .replace(/\u2013/g, "-")
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201c|\u201d/g, '"')
    .replace(/\u2026/g, "...");
}

/** Remove emojis / pictographs entirely (keeps text, drops decorative symbols). */
export function stripEmoji(text: string): string {
  return text.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "");
}

/**
 * Full hygiene pass for any user-visible content: typography normalization,
 * then emoji stripping, then a final safety pass for leftover em-dashes.
 * `stripEmoji` removes the char; emojis that are part of sequences (ZWJ,
 * variation selectors) are also removed by the unicode property class.
 */
export function sanitizeText(text: string): string {
  return sanitizeTypography(stripEmoji(text))
    .replace(/\uFE0F/g, "")
    .replace(/\u200D/g, "")
    .replace(/\u{1F3FB}-\u{1F3FF}/gu, "");
}

/**
 * Standardized instruction block injected into every role system prompt
 * (mirrors V1's cover-letter "PUNCTUATION — STRICT" rule, applied to ALL
 * resume output). Kept here next to the enforcement code so the prompt rule
 * and the deterministic sanitizer can never drift apart.
 */
export function buildTypographyDirective(): string {
  return [
    "## PUNCTUATION — STRICT",
    'NEVER use em-dashes (—) or en-dashes (–) anywhere in the output. Not once.',
    'NEVER use smart quotes, typographic apostrophes, ellipses ("..."), middle dots (·), or emojis.',
    'Use plain ASCII only: hyphen "-", straight quotes (\'), and standard punctuation.',
    'BAD:  "I led the team — delivering a 40% improvement"',
    'BAD:  "three tools — Python, SQL, and Spark"',
    'GOOD: "I led the team, delivering a 40% improvement"',
    'GOOD: "three tools: Python, SQL, and Spark"',
  ].join("\n");
}
