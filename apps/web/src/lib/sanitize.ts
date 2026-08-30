import DOMPurify from "dompurify";

const PURIFY_CONFIG = { USE_PROFILES: { html: true } } as const;

export function sanitizeHtml(rawHtml: string): string {
  return DOMPurify.sanitize(rawHtml, PURIFY_CONFIG);
}

export function sanitizeMarkdownHtml(markdownHtml: string): string {
  return DOMPurify.sanitize(markdownHtml, {
    ...PURIFY_CONFIG,
    FORBID_TAGS: ["style", "form", "input", "iframe"],
    FORBID_ATTR: ["onerror", "onclick", "onload"],
  });
}
