import type { Domain } from "@rattlesnake/shared";
import type { ResumeTemplateInfo } from "@rattlesnake/shared";
import type { ResumeTemplate } from "./types.js";

import aiAnalystTemplate from "./templates/ai_analyst.js";
import aiEngineerTemplate from "./templates/ai_engineer.js";
import aiSpecialistTemplate from "./templates/ai_specialist.js";
import biAnalystTemplate from "./templates/bi_analyst.js";
import businessAnalystTemplate from "./templates/business_analyst.js";
import businessStrategistTemplate from "./templates/business_strategist.js";
import cloudEngineerTemplate from "./templates/cloud_engineer.js";
import cloudSecurityEngineerTemplate from "./templates/cloud_security_engineer.js";
import computerVisionEngineerTemplate from "./templates/computer_vision_engineer.js";
import cybersecurityAnalystTemplate from "./templates/cybersecurity_analyst.js";
import dataAnalystTemplate from "./templates/data_analyst.js";
import dataArchitectTemplate from "./templates/data_architect.js";
import dataEngineerTemplate from "./templates/data_engineer.js";
import dataPlatformEngineerTemplate from "./templates/data_platform_engineer.js";
import dataScientistTemplate from "./templates/data_scientist.js";
import devopsTemplate from "./templates/devops.js";
import gtmAnalystTemplate from "./templates/gtm_analyst.js";
import marketingAnalystTemplate from "./templates/marketing_analyst.js";
import marketingStrategistTemplate from "./templates/marketing_strategist.js";
import marketResearchAnalystTemplate from "./templates/market_research_analyst.js";
import mlopsEngineerTemplate from "./templates/mlops_engineer.js";
import mlEngineerTemplate from "./templates/ml_engineer.js";
import nlpEngineerTemplate from "./templates/nlp_engineer.js";
import operationsAnalystTemplate from "./templates/operations_analyst.js";
import penetrationTesterTemplate from "./templates/penetration_tester.js";
import pricingAnalystTemplate from "./templates/pricing_analyst.js";
import productAnalystTemplate from "./templates/product_analyst.js";
import productManagerTemplate from "./templates/product_manager.js";
import qaEngineerTemplate from "./templates/qa_engineer.js";
import researchScientistTemplate from "./templates/research_scientist.js";
import socAnalystTemplate from "./templates/soc_analyst.js";
import sweTemplate from "./templates/swe.js";

import { AI_ANALYST_SYSTEM_PROMPT } from "./prompts/ai_analyst.js";
import { AI_ENGINEER_SYSTEM_PROMPT } from "./prompts/ai_engineer.js";
import { AI_SPECIALIST_SYSTEM_PROMPT } from "./prompts/ai_specialist.js";
import { BI_ANALYST_SYSTEM_PROMPT } from "./prompts/bi_analyst.js";
import { BUSINESS_ANALYST_SYSTEM_PROMPT } from "./prompts/business_analyst.js";
import { BUSINESS_STRATEGIST_SYSTEM_PROMPT } from "./prompts/business_strategist.js";
import { CLOUD_ENGINEER_SYSTEM_PROMPT } from "./prompts/cloud_engineer.js";
import { CLOUD_SECURITY_ENGINEER_SYSTEM_PROMPT } from "./prompts/cloud_security_engineer.js";
import { COMPUTER_VISION_ENGINEER_SYSTEM_PROMPT } from "./prompts/computer_vision_engineer.js";
import { CYBERSECURITY_ANALYST_SYSTEM_PROMPT } from "./prompts/cybersecurity_analyst.js";
import { DATA_ANALYST_SYSTEM_PROMPT } from "./prompts/data_analyst.js";
import { DATA_ARCHITECT_SYSTEM_PROMPT } from "./prompts/data_architect.js";
import { DATA_ENGINEER_SYSTEM_PROMPT } from "./prompts/data_engineer.js";
import { DATA_PLATFORM_ENGINEER_SYSTEM_PROMPT } from "./prompts/data_platform_engineer.js";
import { DATA_SCIENTIST_SYSTEM_PROMPT } from "./prompts/data_scientist.js";
import { DEVOPS_SYSTEM_PROMPT } from "./prompts/devops.js";
import { GTM_ANALYST_SYSTEM_PROMPT } from "./prompts/gtm_analyst.js";
import { MARKETING_ANALYST_SYSTEM_PROMPT } from "./prompts/marketing_analyst.js";
import { MARKETING_STRATEGIST_SYSTEM_PROMPT } from "./prompts/marketing_strategist.js";
import { MARKET_RESEARCH_ANALYST_SYSTEM_PROMPT } from "./prompts/market_research_analyst.js";
import { MLOPS_ENGINEER_SYSTEM_PROMPT } from "./prompts/mlops_engineer.js";
import { ML_ENGINEER_SYSTEM_PROMPT } from "./prompts/ml_engineer.js";
import { NLP_ENGINEER_SYSTEM_PROMPT } from "./prompts/nlp_engineer.js";
import { OPERATIONS_ANALYST_SYSTEM_PROMPT } from "./prompts/operations_analyst.js";
import { PENETRATION_TESTER_SYSTEM_PROMPT } from "./prompts/penetration_tester.js";
import { PRICING_ANALYST_SYSTEM_PROMPT } from "./prompts/pricing_analyst.js";
import { PRODUCT_ANALYST_SYSTEM_PROMPT } from "./prompts/product_analyst.js";
import { PRODUCT_MANAGER_SYSTEM_PROMPT } from "./prompts/product_manager.js";
import { QA_ENGINEER_SYSTEM_PROMPT } from "./prompts/qa_engineer.js";
import { RESEARCH_SCIENTIST_SYSTEM_PROMPT } from "./prompts/research_scientist.js";
import { SOC_ANALYST_SYSTEM_PROMPT } from "./prompts/soc_analyst.js";
import { SWE_SYSTEM_PROMPT } from "./prompts/swe.js";

const PROMPTS: Record<string, string> = {
  ai_analyst: AI_ANALYST_SYSTEM_PROMPT,
  ai_engineer: AI_ENGINEER_SYSTEM_PROMPT,
  ai_specialist: AI_SPECIALIST_SYSTEM_PROMPT,
  bi_analyst: BI_ANALYST_SYSTEM_PROMPT,
  business_analyst: BUSINESS_ANALYST_SYSTEM_PROMPT,
  business_strategist: BUSINESS_STRATEGIST_SYSTEM_PROMPT,
  cloud_engineer: CLOUD_ENGINEER_SYSTEM_PROMPT,
  cloud_security_engineer: CLOUD_SECURITY_ENGINEER_SYSTEM_PROMPT,
  computer_vision_engineer: COMPUTER_VISION_ENGINEER_SYSTEM_PROMPT,
  cybersecurity_analyst: CYBERSECURITY_ANALYST_SYSTEM_PROMPT,
  data_analyst: DATA_ANALYST_SYSTEM_PROMPT,
  data_architect: DATA_ARCHITECT_SYSTEM_PROMPT,
  data_engineer: DATA_ENGINEER_SYSTEM_PROMPT,
  data_platform_engineer: DATA_PLATFORM_ENGINEER_SYSTEM_PROMPT,
  data_scientist: DATA_SCIENTIST_SYSTEM_PROMPT,
  devops: DEVOPS_SYSTEM_PROMPT,
  gtm_analyst: GTM_ANALYST_SYSTEM_PROMPT,
  marketing_analyst: MARKETING_ANALYST_SYSTEM_PROMPT,
  marketing_strategist: MARKETING_STRATEGIST_SYSTEM_PROMPT,
  market_research_analyst: MARKET_RESEARCH_ANALYST_SYSTEM_PROMPT,
  mlops_engineer: MLOPS_ENGINEER_SYSTEM_PROMPT,
  ml_engineer: ML_ENGINEER_SYSTEM_PROMPT,
  nlp_engineer: NLP_ENGINEER_SYSTEM_PROMPT,
  operations_analyst: OPERATIONS_ANALYST_SYSTEM_PROMPT,
  penetration_tester: PENETRATION_TESTER_SYSTEM_PROMPT,
  pricing_analyst: PRICING_ANALYST_SYSTEM_PROMPT,
  product_analyst: PRODUCT_ANALYST_SYSTEM_PROMPT,
  product_manager: PRODUCT_MANAGER_SYSTEM_PROMPT,
  qa_engineer: QA_ENGINEER_SYSTEM_PROMPT,
  research_scientist: RESEARCH_SCIENTIST_SYSTEM_PROMPT,
  soc_analyst: SOC_ANALYST_SYSTEM_PROMPT,
  swe: SWE_SYSTEM_PROMPT,
};

const TEMPLATES: Record<string, ResumeTemplate> = {
  ai_analyst: aiAnalystTemplate as ResumeTemplate,
  ai_engineer: aiEngineerTemplate as ResumeTemplate,
  ai_specialist: aiSpecialistTemplate as ResumeTemplate,
  bi_analyst: biAnalystTemplate as ResumeTemplate,
  business_analyst: businessAnalystTemplate as ResumeTemplate,
  business_strategist: businessStrategistTemplate as ResumeTemplate,
  cloud_engineer: cloudEngineerTemplate as ResumeTemplate,
  cloud_security_engineer: cloudSecurityEngineerTemplate as ResumeTemplate,
  computer_vision_engineer: computerVisionEngineerTemplate as ResumeTemplate,
  cybersecurity_analyst: cybersecurityAnalystTemplate as ResumeTemplate,
  data_analyst: dataAnalystTemplate as ResumeTemplate,
  data_architect: dataArchitectTemplate as ResumeTemplate,
  data_engineer: dataEngineerTemplate as ResumeTemplate,
  data_platform_engineer: dataPlatformEngineerTemplate as ResumeTemplate,
  data_scientist: dataScientistTemplate as ResumeTemplate,
  devops: devopsTemplate as ResumeTemplate,
  gtm_analyst: gtmAnalystTemplate as ResumeTemplate,
  marketing_analyst: marketingAnalystTemplate as ResumeTemplate,
  marketing_strategist: marketingStrategistTemplate as ResumeTemplate,
  market_research_analyst: marketResearchAnalystTemplate as ResumeTemplate,
  mlops_engineer: mlopsEngineerTemplate as ResumeTemplate,
  ml_engineer: mlEngineerTemplate as ResumeTemplate,
  nlp_engineer: nlpEngineerTemplate as ResumeTemplate,
  operations_analyst: operationsAnalystTemplate as ResumeTemplate,
  penetration_tester: penetrationTesterTemplate as ResumeTemplate,
  pricing_analyst: pricingAnalystTemplate as ResumeTemplate,
  product_analyst: productAnalystTemplate as ResumeTemplate,
  product_manager: productManagerTemplate as ResumeTemplate,
  qa_engineer: qaEngineerTemplate as ResumeTemplate,
  research_scientist: researchScientistTemplate as ResumeTemplate,
  soc_analyst: socAnalystTemplate as ResumeTemplate,
  swe: sweTemplate as ResumeTemplate,
};

/**
 * Alias slug -> source template slug (WS-7 reuse). The new role-driven slugs
 * reuse the closest existing template + prompt with a role-label override;
 * fresh templates are only written for roles with no existing equivalent.
 */
export const ROLE_ALIASES: Record<string, string> = {
  frontend_engineer: "swe",
  backend_engineer: "swe",
  fullstack_engineer: "swe",
  site_reliability_engineer: "devops",
  network_engineer: "cloud_engineer",
  ai_researcher: "research_scientist",
  ai_inference_engineer: "mlops_engineer",
  ai_developer: "ai_engineer",
  ai_implementation_engineer: "ai_engineer",
  project_manager: "product_manager",
};

/** Human role labels for the alias slugs (shown in resumes, cover letters, UI). */
export const ROLE_LABEL_OVERRIDES: Record<string, string> = {
  frontend_engineer: "Frontend Engineer",
  backend_engineer: "Backend Engineer",
  fullstack_engineer: "Full-Stack Engineer",
  site_reliability_engineer: "Site Reliability Engineer",
  network_engineer: "Network Engineer",
  ai_researcher: "AI Researcher",
  ai_inference_engineer: "AI Inference Engineer",
  ai_developer: "AI Developer",
  ai_implementation_engineer: "AI Implementations Engineer",
  project_manager: "Project Manager",
};

/**
 * Candidate roles per committee domain, ordered by relevance. The flagship
 * role (first entry) is the fallback when the JD gives no stronger signal.
 */
export const DOMAIN_ROLES: Record<Domain, string[]> = {
  AI_ENGINEERING: [
    "ai_engineer",
    "ai_researcher",
    "ai_inference_engineer",
    "ai_developer",
    "ai_implementation_engineer",
    "ai_specialist",
    "ai_analyst",
    "nlp_engineer",
    "computer_vision_engineer",
  ],
  ML_ENGINEERING: [
    "ml_engineer",
    "mlops_engineer",
    "research_scientist",
    "data_scientist",
  ],
  SDE: [
    "swe",
    "frontend_engineer",
    "backend_engineer",
    "fullstack_engineer",
    "qa_engineer",
  ],
  DATA_ENGINEERING: [
    "data_engineer",
    "data_platform_engineer",
    "data_architect",
  ],
  DATA_SCIENCE: [
    "data_analyst",
    "bi_analyst",
    "product_analyst",
    "gtm_analyst",
    "market_research_analyst",
    "pricing_analyst",
  ],
  CYBERSECURITY: [
    "cybersecurity_analyst",
    "penetration_tester",
    "soc_analyst",
    "cloud_security_engineer",
  ],
  NETWORKING: [
    "network_engineer",
    "cloud_engineer",
  ],
  DEVOPS: [
    "devops",
    "site_reliability_engineer",
  ],
  PROJECT_MANAGEMENT: [
    "product_manager",
    "project_manager",
    "business_analyst",
    "operations_analyst",
    "business_strategist",
    "marketing_analyst",
    "marketing_strategist",
  ],
};

/** Every role slug a JD could resolve to: the 32 source templates + 10 aliases. */
export const ALL_ROLE_SLUGS: readonly string[] = [
  ...Object.keys(TEMPLATES),
  ...Object.keys(ROLE_ALIASES),
];

/** Browse category per template slug, used by the template library. */
export const TEMPLATE_CATEGORIES: Record<string, string> = {
  ai_engineer: "AI & Machine Learning",
  ml_engineer: "AI & Machine Learning",
  ai_specialist: "AI & Machine Learning",
  ai_analyst: "AI & Machine Learning",
  research_scientist: "AI & Machine Learning",
  nlp_engineer: "AI & Machine Learning",
  computer_vision_engineer: "AI & Machine Learning",
  data_scientist: "Data Science & Analytics",
  data_analyst: "Data Science & Analytics",
  bi_analyst: "Data Science & Analytics",
  swe: "Software Engineering",
  cloud_engineer: "Software Engineering",
  devops: "Software Engineering",
  qa_engineer: "Software Engineering",
  data_engineer: "Cloud & Data Engineering",
  data_platform_engineer: "Cloud & Data Engineering",
  data_architect: "Cloud & Data Engineering",
  mlops_engineer: "Cloud & Data Engineering",
  product_manager: "Product & Business",
  product_analyst: "Product & Business",
  business_analyst: "Product & Business",
  business_strategist: "Product & Business",
  operations_analyst: "Product & Business",
  marketing_analyst: "Marketing & Strategy",
  marketing_strategist: "Marketing & Strategy",
  market_research_analyst: "Marketing & Strategy",
  gtm_analyst: "Marketing & Strategy",
  pricing_analyst: "Marketing & Strategy",
  penetration_tester: "Security",
  soc_analyst: "Security",
  cybersecurity_analyst: "Security",
  cloud_security_engineer: "Security",
  // Alias slugs share the browse category of their source template.
  frontend_engineer: "Software Engineering",
  backend_engineer: "Software Engineering",
  fullstack_engineer: "Software Engineering",
  site_reliability_engineer: "Software Engineering",
  network_engineer: "Software Engineering",
  ai_researcher: "AI & Machine Learning",
  ai_inference_engineer: "AI & Machine Learning",
  ai_developer: "AI & Machine Learning",
  ai_implementation_engineer: "AI & Machine Learning",
  project_manager: "Product & Business",
};

const DOMAIN_SLUGS: Record<Domain, readonly string[]> = {
  AI_ENGINEERING: DOMAIN_ROLES.AI_ENGINEERING,
  ML_ENGINEERING: DOMAIN_ROLES.ML_ENGINEERING,
  SDE: DOMAIN_ROLES.SDE,
  DATA_ENGINEERING: DOMAIN_ROLES.DATA_ENGINEERING,
  DATA_SCIENCE: DOMAIN_ROLES.DATA_SCIENCE,
  CYBERSECURITY: DOMAIN_ROLES.CYBERSECURITY,
  NETWORKING: DOMAIN_ROLES.NETWORKING,
  DEVOPS: DOMAIN_ROLES.DEVOPS,
  PROJECT_MANAGEMENT: DOMAIN_ROLES.PROJECT_MANAGEMENT,
};

/**
 * Public catalog for the template library: every role, its browse category,
 * the domains it can serve, and its ATS keyword set.
 */
export function listTemplateInfo(): ResumeTemplateInfo[] {
  return ALL_ROLE_SLUGS.map((slug) => {
    const template = getTemplate(slug)!;
    const domains = (Object.keys(DOMAIN_SLUGS) as Domain[]).filter((d) =>
      DOMAIN_SLUGS[d].includes(slug),
    );
    return {
      slug,
      role: template.role,
      category: TEMPLATE_CATEGORIES[slug] ?? "General",
      domains,
      atsKeywords: template.ats_keywords ?? [],
    };
  });
}

/** Resolve a template for a role slug, following aliases to the source template. */
export function getTemplate(slug: string): ResumeTemplate | undefined {
  const source = TEMPLATES[slug] ?? TEMPLATES[ROLE_ALIASES[slug] ?? ""];
  if (!source) return undefined;
  const label = ROLE_LABEL_OVERRIDES[slug];
  return label && label !== source.role ? { ...source, role: label, slug } : source;
}

export function getRolePrompt(slug: string): string | undefined {
  return PROMPTS[slug] ?? PROMPTS[ROLE_ALIASES[slug] ?? ""];
}

/** All role slugs a JD could be matched against, regardless of domain. */
export function allTemplates(): ResumeTemplate[] {
  return ALL_ROLE_SLUGS.map((slug) => getTemplate(slug)!).filter(Boolean);
}

/** Role-title signals looked up in the JD, in order of preference per slug. */
const TITLE_PHRASES: Record<string, string[]> = {
  swe: ["software engineer", "software developer", "sde", "developer"],
  frontend_engineer: ["frontend engineer", "front-end engineer", "front end engineer", "frontend developer", "react developer", "ui engineer"],
  backend_engineer: ["backend engineer", "back-end engineer", "back end engineer", "backend developer"],
  fullstack_engineer: ["full stack engineer", "full-stack engineer", "fullstack engineer", "full stack developer"],
  cloud_engineer: ["cloud engineer", "cloud infrastructure engineer"],
  devops: ["devops engineer", "devops", "platform engineer"],
  site_reliability_engineer: ["site reliability engineer", "site reliability", "sre"],
  network_engineer: ["network engineer"],
  qa_engineer: ["qa engineer", "test engineer", "quality assurance"],
  data_engineer: ["data engineer"],
  data_platform_engineer: ["data platform engineer"],
  data_architect: ["data architect"],
  mlops_engineer: ["mlops engineer", "mlops"],
  data_scientist: ["data scientist", "data science"],
  data_analyst: ["data analyst"],
  ml_engineer: ["machine learning engineer", "ml engineer", "deep learning engineer"],
  ai_engineer: ["ai engineer", "artificial intelligence engineer"],
  ai_researcher: ["ai researcher", "ai research scientist"],
  ai_inference_engineer: ["inference engineer", "ai inference"],
  ai_developer: ["ai developer", "ai application developer"],
  ai_implementation_engineer: ["implementation engineer", "ai implementation"],
  ai_analyst: ["ai analyst"],
  ai_specialist: ["ai specialist"],
  research_scientist: ["research scientist", "researcher"],
  nlp_engineer: ["nlp engineer", "natural language processing"],
  computer_vision_engineer: ["computer vision engineer"],
  bi_analyst: ["bi analyst", "business intelligence analyst", "business intelligence"],
  business_analyst: ["business analyst", "business analysis"],
  pricing_analyst: ["pricing analyst"],
  operations_analyst: ["operations analyst"],
  gtm_analyst: ["gtm analyst", "go to market", "growth analyst"],
  marketing_analyst: ["marketing analyst"],
  market_research_analyst: ["market research analyst"],
  product_analyst: ["product analyst"],
  product_manager: ["product manager", "product management"],
  project_manager: ["project manager", "project management", "program manager"],
  business_strategist: ["business strategist", "strategy analyst"],
  marketing_strategist: ["marketing strategist"],
  penetration_tester: ["penetration tester", "pentester", "security tester"],
  soc_analyst: ["soc analyst", "security operations"],
  cybersecurity_analyst: ["cybersecurity analyst", "cyber security analyst", "security analyst"],
  cloud_security_engineer: ["cloud security engineer", "cloud security"],
};

/**
 * Detect the best role for a job.
 *
 * 1. Title signal: if the JD names a role title that maps to a candidate in the
 *    job's domain, use it (most reliable "role-targeted" signal).
 * 2. Keyword signal: otherwise score every role in the domain by how many of
 *    its `ats_keywords` appear in the JD.
 * 3. Fallback: the domain's flagship role.
 */
export function resolveRoleSlug(domain: Domain, jobDescription: string): string {
  const candidates = DOMAIN_ROLES[domain] ?? DOMAIN_ROLES.SDE;
  const jd = jobDescription.toLowerCase();

  for (const slug of candidates) {
    const phrases = TITLE_PHRASES[slug];
    if (!phrases) continue;
    if (phrases.some((phrase) => jd.includes(phrase))) return slug;
  }

  let bestSlug = candidates[0]!;
  let bestScore = 0;
  for (const slug of candidates) {
    const template = getTemplate(slug);
    if (!template) continue;
    const score = (template.ats_keywords ?? []).reduce((acc, kw) => {
      return acc + (jd.includes(kw.toLowerCase()) ? 1 : 0);
    }, 0);
    if (score > bestScore) {
      bestScore = score;
      bestSlug = slug;
    }
  }
  return bestSlug;
}
