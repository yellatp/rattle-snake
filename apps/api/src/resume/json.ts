/**
 * Sanitize text content within a parsed JSON string by replacing typographic
 * characters that don't belong in plain-text resume content (ported from V1).
 */
export function sanitizeResumeText(text: string): string {
  return text
    .replace(/\u2014/g, ", ")
    .replace(/\u2013/g, "-")
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201c|\u201d/g, '"')
    .replace(/\u2026/g, "...");
}

/**
 * Extract the JSON object from AI output that may contain <thinking> blocks,
 * prose before the JSON, or markdown code fences. Returns "{}" when no valid
 * JSON object can be recovered so the pipeline degrades gracefully.
 */
export function extractResumeJson(text: string): string {
  let s = text.trim();

  s = s.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "").trim();

  const headerMatch = s.match(/^##\s+(?:Output\s+JSON|Output|Result)[^\n]*\n/im);
  if (headerMatch && headerMatch.index !== undefined) {
    s = s.slice(headerMatch.index + headerMatch[0].length).trim();
  }

  s = s.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();

  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    const raw = s.slice(start, end + 1);
    const cleaned = sanitizeResumeText(raw);
    try {
      JSON.parse(cleaned);
      return cleaned;
    } catch {
      return "{}";
    }
  }

  return "{}";
}
