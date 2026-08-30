import type { Domain } from "@rattlesnake/shared";
import type { LLMClient } from "../llm/types.js";
import { extractResumeJson } from "./json.js";
import {
  ALL_ROLE_SLUGS,
  DOMAIN_ROLES,
  getTemplate,
  resolveRoleSlug,
} from "./roleRegistry.js";

const ROLE_DETECTION_SYSTEM_PROMPT = `You are a hiring analyst classifying a job description into the single best-fit role template.
Return ONLY a JSON object with two fields:
{
  "role": "<slug>",
  "reason": "<one short sentence explaining the choice>"
}
Rules:
- Pick the role whose day-to-day duties dominate the posting, not just the title.
- When the posting names a role title (e.g. "data engineer", "product manager"), prefer it unless the described work clearly belongs to a different allowed role.
- Only use slugs from the allowed list. Never invent a slug or add a slug not listed.
- If nothing fits well, pick the first allowed slug.`;

/**
 * AI role detection: have the LLM classify the job description into the best
 * template slug for the domain. Falls back to the keyword/title detector when
 * the model reply is missing, malformed, or names an unknown slug.
 */
export async function detectRoleWithLlm(
  domain: Domain,
  jobDescription: string,
  llm: LLMClient,
): Promise<string> {
  const candidates = DOMAIN_ROLES[domain] ?? DOMAIN_ROLES.SDE;
  const catalog = candidates
    .map((slug) => {
      const template = getTemplate(slug);
      const keywords = (template?.ats_keywords ?? []).slice(0, 8).join(", ");
      return `- ${slug}: ${template?.role ?? slug}${keywords ? ` (keywords: ${keywords})` : ""}`;
    })
    .join("\n");

  const userPrompt = `Allowed roles for the ${domain} domain:\n${catalog}\n\nJOB DESCRIPTION:\n${jobDescription}\n\nReturn the best-fit role JSON.`;

  try {
    const raw = await llm.complete(ROLE_DETECTION_SYSTEM_PROMPT, userPrompt, {
      temperature: 0,
      maxTokens: 200,
    });
    const parsed = JSON.parse(extractResumeJson(raw)) as { role?: unknown };
    const slug = typeof parsed.role === "string" ? parsed.role.trim().toLowerCase() : "";
    if (slug && ALL_ROLE_SLUGS.includes(slug)) return slug;
  } catch (err) {
    console.warn(`[pipeline] LLM role detection failed for domain ${domain}; falling back to keyword detection:`, err);
  }
  return resolveRoleSlug(domain, jobDescription);
}
