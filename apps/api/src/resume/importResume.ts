import { profileUpdateSchema, type ProfileUpdateInput } from "@rattlesnake/shared";
import type { LLMClient } from "../llm/types.js";
import { extractResumeJson } from "./json.js";

/**
 * System prompt for converting a pasted/uploaded resume into a structured
 * candidate profile. All LLM configuration is resolved server-side (Settings
 * default connection or env client); the raw text is never persisted.
 */
const IMPORT_SYSTEM_PROMPT = `You are a resume parsing assistant. Convert the candidate's resume into a single JSON object with only these optional fields:

{
  "personalInfo": { "firstName", "middleName", "lastName", "email", "phone", "location", "linkedin", "github", "portfolio", "headline" },
  "summary": "string",
  "workAuthorization": "string",
  "employmentPreference": "string",
  "experience": [ { "title", "company", "location", "dates", "isCurrent", "bullets": [ "string" ] } ],
  "education": [ { "degree", "institution", "location", "dates" } ],
  "skills": [ { "name", "items": [ { "name", "isHighlighted" } ] } ],
  "certifications": [ "string" ],
  "projects": [ { "name", "description", "link" } ],
  "publications": [ "string" ],
  "languages": [ "string" ],
  "volunteer": [ "string" ],
  "coreCompetencies": [ "string" ],
  "workAreas": [ "string" ],
  "totalWorkExperience": "string"
}

Rules:
- Fill only fields present in the resume. Omit everything unknown; never invent facts.
- Keep personal info verbatim as written: name, email, phone, links. Do not normalize or guess.
- Order experience newest to oldest. Dates as written on the resume.
- "summary": a single condensed professional summary paragraph (2-3 sentences) written from the resume's own summary or objective section, or "" if the resume has none.
- "bullets" for each role: exactly one array element per bullet point. NEVER join multiple bullets with newlines inside a single string. Strip leading markers like "-", "*", bullet points, or numbers.
- Group skills sensibly (languages, frameworks, tools, platforms) with the candidate's strongest skills in the "items" list.
- Extract certifications, languages, and total work experience where stated.
- Return ONLY the JSON object. No prose, no markdown fences, no <thinking> blocks.`;

const BULLET_MARKER = /^\s*(?:[-*•▪◦]|\d+[.)])\s+/;

/**
 * Normalize extracted bullet lists. Some models join several bullets into one
 * string with newlines; split those back apart and strip bullet markers so each
 * bullet point stays its own array element.
 */
function normalizeBullets(value: unknown): string[] | undefined {
  const items = Array.isArray(value) ? value : [value];
  const out: string[] = [];
  for (const item of items) {
    if (typeof item !== "string") continue;
    for (const rawLine of item.split(/\r?\n/)) {
      const line = rawLine.replace(BULLET_MARKER, "").trim();
      if (line) out.push(line);
    }
  }
  return out.length ? out : undefined;
}

function normalizeParsed(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) return {};
  const obj = value as Record<string, unknown>;
  if (Array.isArray(obj.experience)) {
    obj.experience = obj.experience.map((entry) => {
      if (typeof entry !== "object" || entry === null) return entry;
      const item = entry as Record<string, unknown>;
      if (item.bullets !== undefined) item.bullets = normalizeBullets(item.bullets);
      return item;
    });
  }
  return obj;
}

/** Converts pasted/uploaded resume text into a structured profile (JSON). */
export async function extractProfileFromResume(
  resumeText: string,
  llm: LLMClient,
): Promise<ProfileUpdateInput> {
  const raw = await llm.complete(IMPORT_SYSTEM_PROMPT, resumeText, {
    temperature: 0.2,
    maxTokens: 3000,
  });

  const jsonText = extractResumeJson(raw);
  if (jsonText === "{}") return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return {};
  }

  const result = profileUpdateSchema.safeParse(normalizeParsed(parsed));
  return result.success ? result.data : {};
}
