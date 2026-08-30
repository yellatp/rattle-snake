import {
  buildJdMetaPrompt,
  jdMetaSchema,
  type Domain,
  type JdMeta,
} from "@rattlesnake/shared";
import type { LLMClient } from "../llm/client.js";
import { getTemplate, resolveRoleSlug } from "../resume/roleRegistry.js";

/**
 * JD metadata extraction. The SME committee needs concrete metadata about the
 * role it is evaluating (company, role, sector, location, team) so the seats
 * are selected from it and the panel is framed correctly.
 *
 * Strategy:
 *   1. LLM extraction via the job-description metadata extractor prompt
 *      (best quality: reads company/role/sector/location/team naturally).
 *   2. Deterministic rule-based fallback (company/role from the JD's header
 *      lines, sector/location/team left empty) — works offline against mock.
 * Always validates/repairs against the shared Zod jdMeta schema.
 */
export async function extractJdMeta(
  job: {
    jobDescription: string;
    domain: Domain;
    roleSlug?: string;
  },
  llm: LLMClient,
): Promise<JdMeta> {
  const llmResult = await extractViaLLM(job, llm).catch((err) => {
    console.warn(`[pipeline] JD-meta LLM extraction failed for ${job.roleSlug ?? "role"}; using rule-based fallback:`, err);
    return null;
  });
  if (llmResult) return llmResult;
  return extractViaRules(job);
}

async function extractViaLLM(
  job: { jobDescription: string; domain: Domain; roleSlug?: string },
  llm: LLMClient,
): Promise<JdMeta | null> {
  const prompt = buildJdMetaPrompt(job);
  const raw = await llm.complete(prompt, "Produce the JD metadata JSON only.", {
    temperature: 0.2,
    maxTokens: 500,
  });
  const json = stripCodeFences(raw);
  const parsed = JSON.parse(json) as unknown;
  const validated = jdMetaSchema.safeParse(parsed);
  if (!validated.success) return null;
  return repair(validated.data, job);
}

/**
 * Deterministic rule-based JD metadata: the first non-empty line of the JD is
 * usually the posting's company/header line, and the role resolves from the JD
 * keywords via the role registry.
 */
export function extractViaRules(job: {
  jobDescription: string;
  domain: Domain;
  roleSlug?: string;
}): JdMeta {
  const lines = job.jobDescription
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const company = lines[0] && lines[0]!.length <= 100 ? lines[0]! : "";
  const slug = job.roleSlug ?? resolveRoleSlug(job.domain, job.jobDescription);
  const role = getTemplate(slug)?.role ?? slug;

  return repair({ company, role, sector: "", location: "", team: "" }, job);
}

/**
 * Guarantee every required field exists and attach the resolved role slug when
 * one is known (job-level override wins, else the deterministic JD resolution).
 */
function repair(meta: JdMeta, job: { domain: Domain; jobDescription: string; roleSlug?: string }): JdMeta {
  const slug = job.roleSlug ?? resolveRoleSlug(job.domain, job.jobDescription);
  return {
    company: meta.company ?? "",
    role: meta.role ?? "",
    sector: meta.sector ?? "",
    location: meta.location ?? "",
    team: meta.team ?? "",
    ...(slug ? { roleSlug: slug } : {}),
  };
}

function stripCodeFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "");
}
