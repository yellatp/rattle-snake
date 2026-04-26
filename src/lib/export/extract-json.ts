/**
 * Sanitize text content within a parsed JSON string by replacing typographic
 * characters that don't belong in plain-text resume content.
 */
export function sanitizeResumeText(text: string): string {
  return text
    .replace(/—/g, ', ')   // em-dash → comma-space
    .replace(/–/g, '-')    // en-dash → hyphen
    .replace(/‘|’/g, "'") // smart single quotes
    .replace(/“|”/g, '"') // smart double quotes
    .replace(/…/g, '...');  // ellipsis
}

/**
 * Extract the JSON object from AI output that may contain:
 * - <thinking>...</thinking> reasoning blocks
 * - Prose / section headings before the JSON (e.g. "## Output JSON")
 * - Markdown code fences (```json ... ```)
 */
export function extractResumeJson(text: string): string {
  let s = text.trim();

  // Strip <thinking> blocks (Claude extended thinking)
  s = s.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();

  // If the AI added a header like "## Output JSON" or "## Output", take everything after it
  const headerMatch = s.match(/^##\s+(?:Output\s+JSON|Output|Result)[^\n]*\n/im);
  if (headerMatch && headerMatch.index !== undefined) {
    s = s.slice(headerMatch.index + headerMatch[0].length).trim();
  }

  // Strip markdown code fences
  s = s.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();

  // Extract the outermost JSON object { ... }
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    const raw = s.slice(start, end + 1);
    // Replace typographic characters inside JSON string values only
    // (sanitize the raw text before it reaches the parser)
    return sanitizeResumeText(raw);
  }

  return sanitizeResumeText(s);
}
