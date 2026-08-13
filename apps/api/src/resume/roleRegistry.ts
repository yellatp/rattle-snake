import type { Domain } from "@rattlesnake/shared";
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
 * Candidate roles per committee domain, ordered by relevance. The flagship
 * role (first entry) is the fallback when the JD gives no stronger signal.
 */
export const DOMAIN_ROLES: Record<Domain, string[]> = {
  SWE: [
    "swe",
    "ai_engineer",
    "cloud_engineer",
    "devops",
    "qa_engineer",
    "data_engineer",
    "data_architect",
    "mlops_engineer",
    "computer_vision_engineer",
    "nlp_engineer",
    "research_scientist",
    "cloud_security_engineer",
    "soc_analyst",
    "cybersecurity_analyst",
    "penetration_tester",
  ],
  DATA_AI: [
    "data_scientist",
    "data_analyst",
    "ml_engineer",
    "ai_engineer",
    "data_engineer",
    "mlops_engineer",
    "data_architect",
    "data_platform_engineer",
    "bi_analyst",
    "ai_analyst",
    "ai_specialist",
    "research_scientist",
    "nlp_engineer",
    "computer_vision_engineer",
    "business_analyst",
    "product_analyst",
  ],
  FINANCE: [
    "business_analyst",
    "pricing_analyst",
    "operations_analyst",
    "gtm_analyst",
    "marketing_analyst",
    "market_research_analyst",
    "product_analyst",
    "data_analyst",
    "business_strategist",
    "marketing_strategist",
  ],
};

export const ALL_ROLE_SLUGS: readonly string[] = Object.keys(TEMPLATES);

export function getTemplate(slug: string): ResumeTemplate | undefined {
  return TEMPLATES[slug];
}

export function getRolePrompt(slug: string): string | undefined {
  return PROMPTS[slug];
}

/** All 32 role slugs a JD could be matched against, regardless of domain. */
export function allTemplates(): ResumeTemplate[] {
  return ALL_ROLE_SLUGS.map((slug) => TEMPLATES[slug]!).filter(Boolean);
}

/** Role-title signals looked up in the JD, in order of preference per slug. */
const TITLE_PHRASES: Record<string, string[]> = {
  swe: ["software engineer", "backend engineer", "frontend engineer", "full stack engineer", "fullstack engineer", "sde", "developer"],
  cloud_engineer: ["cloud engineer", "cloud infrastructure engineer"],
  devops: ["devops engineer", "devops", "platform engineer", "site reliability"],
  qa_engineer: ["qa engineer", "test engineer", "quality assurance"],
  data_engineer: ["data engineer"],
  data_platform_engineer: ["data platform engineer"],
  data_architect: ["data architect"],
  mlops_engineer: ["mlops engineer", "mlops"],
  data_scientist: ["data scientist", "data science"],
  data_analyst: ["data analyst"],
  ml_engineer: ["machine learning engineer", "ml engineer", "deep learning engineer"],
  ai_engineer: ["ai engineer", "artificial intelligence engineer"],
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
  const candidates = DOMAIN_ROLES[domain] ?? DOMAIN_ROLES.SWE;
  const jd = jobDescription.toLowerCase();

  for (const slug of candidates) {
    const phrases = TITLE_PHRASES[slug];
    if (!phrases) continue;
    if (phrases.some((phrase) => jd.includes(phrase))) return slug;
  }

  let bestSlug = candidates[0]!;
  let bestScore = 0;
  for (const slug of candidates) {
    const template = TEMPLATES[slug];
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
