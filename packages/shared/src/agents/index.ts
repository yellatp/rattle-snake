import type { AgentConfig, Domain } from "../types.js";
import { SWE_COMMITTEE } from "./swe.js";
import { DATA_AI_COMMITTEE } from "./dataAi.js";
import { FINANCE_COMMITTEE } from "./finance.js";

/** Domain -> 5-member committee. Pure data, trivially extensible. */
export const DOMAIN_COMMITTEES: Record<Domain, AgentConfig[]> = {
  SWE: SWE_COMMITTEE,
  DATA_AI: DATA_AI_COMMITTEE,
  FINANCE: FINANCE_COMMITTEE,
};

export const DOMAIN_LABELS: Record<Domain, string> = {
  SWE: "Software Engineering",
  DATA_AI: "Data & AI",
  FINANCE: "Finance & Banking",
};

/** Keyword fingerprints used to auto-detect the domain from a job description. */
const DOMAIN_KEYWORDS: Record<Domain, string[]> = {
  SWE: [
    "software engineer",
    "backend engineer",
    "frontend engineer",
    "fullstack",
    "full-stack",
    "sdet",
    "web developer",
    "microservice",
    "typescript",
    "java",
    "python engineer",
    "distributed systems",
    "infrastructure engineer",
    "devops engineer",
    "system design",
  ],
  DATA_AI: [
    "data scientist",
    "data engineer",
    "machine learning",
    "ml engineer",
    "artificial intelligence",
    "llm",
    "data analyst",
    "data platform",
    "etl",
    "pipeline",
    "model",
    "nlp",
    "computer vision",
    "sql",
    "spark",
    "hypothesis",
    "a/b test",
  ],
  FINANCE: [
    "quant",
    "quantitative",
    "portfolio",
    "trader",
    "investment",
    "banking",
    "risk",
    "cfa",
    "cpa",
    "financial",
    "equity",
    "fixed income",
    "derivatives",
    "asset management",
    "treasury",
    "compliance",
    "capital markets",
  ],
};

/**
 * Best-effort domain detection from a job description.
 * Returns the highest-scoring domain by keyword hits, or null when the JD
 * is too ambiguous. The UI uses this to pre-select a domain, user can override.
 */
export function detectDomain(jobDescription: string): Domain | null {
  const text = jobDescription.toLowerCase();
  const scores = (Object.keys(DOMAIN_KEYWORDS) as Domain[]).map((domain) => {
    const hits = DOMAIN_KEYWORDS[domain]!.filter((k) => text.includes(k)).length;
    return { domain, hits };
  });

  const best = scores.reduce((acc, s) => (s.hits > acc.hits ? s : acc), {
    domain: null as Domain | null,
    hits: 0,
  });

  return best.hits >= 2 ? best.domain : null;
}

/**
 * Resolve the active committee for a job.
 * Applies the optional sector-focus override to the Sector Specialist seat,
 * which lets one template serve arbitrary target industries.
 */
export function getCommitteeForDomain(
  domain: Domain,
  sectorFocus?: string,
): AgentConfig[] {
  const committee = DOMAIN_COMMITTEES[domain] ?? SWE_COMMITTEE;
  if (!sectorFocus) return committee;

  return committee.map((agent) =>
    agent.isSectorSpecialist
      ? {
          ...agent,
          role: `${sectorFocus} Sector Specialist`,
          focus: `Industry-specific fit for ${sectorFocus}: domain protocols, compliance, industry stack, plus cross-sector transferable skills.`,
        }
      : agent,
  );
}
