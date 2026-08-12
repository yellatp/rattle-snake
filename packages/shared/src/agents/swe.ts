import type { AgentConfig } from "../types.js";

/**
 * SWE / SDE committee — 5 named personas.
 * The 5th seat is the Sector Specialist (defaults to FinTech here but is
 * overridable at job-creation time).
 */
export const SWE_COMMITTEE: AgentConfig[] = [
  {
    name: "Priya",
    role: "Lead Technical Recruiter",
    focus:
      "CS fundamentals, core DSA, code-bases and system scale, metric density, title alignment, screening realism.",
    domain: "SWE",
    weight: 0.8,
    tone: "recruiter",
  },
  {
    name: "Alex",
    role: "Staff Software Architect",
    focus:
      "Design patterns, concurrency, microservices, code quality, architectural trade-offs, production-scale engineering.",
    domain: "SWE",
    weight: 1.2,
    tone: "architect",
  },
  {
    name: "Marcus",
    role: "Engineering Team Lead",
    focus:
      "Sprint velocity, CI/CD, debugging capability, on-call readiness, team throughput, production stability.",
    domain: "SWE",
    weight: 1,
    tone: "lead",
  },
  {
    name: "Elena",
    role: "VP of Engineering",
    focus:
      "Technical debt, developer productivity, product impact, return on engineering investment, hiring ROI.",
    domain: "SWE",
    weight: 1.2,
    tone: "manager",
  },
  {
    name: "Liam",
    role: "FinTech Sector Specialist",
    focus:
      "Industry-specific fit: low-latency payment systems, PCI-DSS compliance, double-entry ledgers, plus cross-sector transferable skills.",
    domain: "SWE",
    isSectorSpecialist: true,
    weight: 1,
    tone: "sector",
  },
];
