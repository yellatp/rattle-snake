import type { AgentConfig, Domain } from "../types.js";
import { DOMAINS } from "../types.js";
import {
  applySectorOverride,
  filterByBand,
  getCommitteeForRole,
  ROLE_COMMITTEES,
} from "./roleCommittees.js";

export * from "./roleCommittees.js";

/** Flagship role slug used to build the domain-level committee. */
const DEFAULT_ROLE_BY_DOMAIN: Record<Domain, string> = {
  AI_ENGINEERING: "ai_engineer",
  ML_ENGINEERING: "ml_engineer",
  SDE: "swe",
  DATA_ENGINEERING: "data_engineer",
  DATA_SCIENCE: "data_analyst",
  CYBERSECURITY: "cybersecurity_analyst",
  NETWORKING: "cloud_engineer",
  DEVOPS: "devops",
  PROJECT_MANAGEMENT: "product_manager",
};

/** Domain -> 6-seat committee built from the flagship role of the domain. Pure data. */
export const DOMAIN_COMMITTEES: Record<Domain, AgentConfig[]> = Object.fromEntries(
  DOMAINS.map((d) => [d, ROLE_COMMITTEES[DEFAULT_ROLE_BY_DOMAIN[d]] ?? []]),
) as Record<Domain, AgentConfig[]>;

export const DOMAIN_LABELS: Record<Domain, string> = {
  AI_ENGINEERING: "AI Engineering & Research & AIOps",
  ML_ENGINEERING: "ML Engineering & MLOps",
  SDE: "SDE/SWE",
  DATA_ENGINEERING: "Data Engineering",
  DATA_SCIENCE: "Data Science & Analytics",
  CYBERSECURITY: "Cybersecurity",
  NETWORKING: "Networking",
  DEVOPS: "DevOps",
  PROJECT_MANAGEMENT: "Project & Product Management",
};

/** Keyword fingerprints used to auto-detect the domain from a job description. */
const DOMAIN_KEYWORDS: Record<Domain, string[]> = {
  AI_ENGINEERING: [
    "ai engineer",
    "artificial intelligence",
    "llm",
    "agentic",
    "rag",
    "prompt engineer",
    "ai developer",
    "ai researcher",
    "generative ai",
    "openai",
    "inference",
    "machine vision",
    "nlp",
  ],
  ML_ENGINEERING: [
    "machine learning",
    "ml engineer",
    "data scientist",
    "mlops",
    "model training",
    "feature engineering",
    "deep learning",
    "pytorch",
    "tensorflow",
    "classification",
  ],
  SDE: [
    "software engineer",
    "sde",
    "backend engineer",
    "frontend engineer",
    "fullstack",
    "full-stack",
    "web developer",
    "typescript",
    "java",
    "python engineer",
    "distributed systems",
    "system design",
    "microservice",
  ],
  DATA_ENGINEERING: [
    "data engineer",
    "data platform",
    "etl",
    "elt",
    "warehouse",
    "airflow",
    "spark",
    "data pipeline",
    "lakehouse",
  ],
  DATA_SCIENCE: [
    "data analyst",
    "business intelligence",
    "bi analyst",
    "analytics",
    "product analyst",
    "a/b test",
    "sql",
    "pricing analyst",
    "market research",
  ],
  CYBERSECURITY: [
    "cybersecurity",
    "security engineer",
    "penetration test",
    "pentest",
    "soc analyst",
    "security analyst",
    "iam",
    "threat",
    "vulnerability",
    "incident response",
  ],
  NETWORKING: [
    "network engineer",
    "networking",
    "routing",
    "switching",
    "dns",
    "load balancer",
    "sd-wan",
    "cloud engineer",
  ],
  DEVOPS: [
    "devops",
    "site reliability",
    "sre",
    "ci/cd",
    "kubernetes",
    "docker",
    "terraform",
    "infrastructure as code",
    "observability",
  ],
  PROJECT_MANAGEMENT: [
    "project manager",
    "product manager",
    "program manager",
    "business analyst",
    "operations analyst",
    "stakeholder",
    "roadmap",
    "scrum",
    "agile",
  ],
};

/**
 * Best-effort domain detection from a job description.
 * Returns the highest-scoring domain by keyword hits, or null when the JD
 * is too ambiguous. Callers fall back to the flagship domain (SDE).
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
 *
 * Role-first (WS-4): when a role slug is known it selects a role-driven
 * committee (Senior · Manager · Staff · Principal · Recruiter · Sector), else
 * it falls back to the domain committee (built from the domain's flagship role).
 *
 * The committee is filtered to the candidate's experience band (WS-7) and the
 * optional sector-focus override is applied to the Sector Specialist seat.
 */
export function getCommitteeForDomain(
  domain: Domain,
  sectorFocus?: string,
  roleSlug?: string,
  experienceYears?: number,
): AgentConfig[] {
  const roleCommittee = roleSlug
    ? getCommitteeForRole(roleSlug, sectorFocus, experienceYears)
    : undefined;
  if (roleCommittee) return roleCommittee;

  const committee = DOMAIN_COMMITTEES[domain] ?? DOMAIN_COMMITTEES.SDE;
  return applySectorOverride(filterByBand(committee, experienceYears), sectorFocus);
}
