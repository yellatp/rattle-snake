import type { AgentConfig } from "../types.js";

/**
 * Data & AI committee — 5 named personas.
 * Sector Specialist defaults to HealthTech / Retail AI and is overridable.
 */
export const DATA_AI_COMMITTEE: AgentConfig[] = [
  {
    name: "Sarah",
    role: "Data & AI Technical Recruiter",
    focus:
      "Math background, ML stack fluency, data pipelines, SQL proficiency, background-to-role alignment.",
    domain: "DATA_AI",
    weight: 0.8,
    tone: "recruiter",
  },
  {
    name: "Dr. Aris",
    role: "Principal ML / Data Scientist",
    focus:
      "Algorithmic depth, model metrics, data drift, feature engineering, evaluation rigor, experimental design.",
    domain: "DATA_AI",
    weight: 1.2,
    tone: "architect",
  },
  {
    name: "Vikram",
    role: "Data Platform Lead",
    focus:
      "ETL pipelines, data governance, latency, infrastructure cost, reliability of the data platform.",
    domain: "DATA_AI",
    weight: 1,
    tone: "lead",
  },
  {
    name: "Karen",
    role: "Head of AI & Data",
    focus:
      "Strategic AI adoption, data monetization, business ROI, team execution, org-level feasibility.",
    domain: "DATA_AI",
    weight: 1.2,
    tone: "manager",
  },
  {
    name: "Maya",
    role: "HealthTech / Domain Specialist",
    focus:
      "Regulatory frameworks (HIPAA, GDPR), domain metrics, clinical/retail domain nuance, transferable skills across sectors.",
    domain: "DATA_AI",
    isSectorSpecialist: true,
    weight: 1,
    tone: "sector",
  },
];
