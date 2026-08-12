import type { AgentConfig } from "../types.js";

/**
 * Finance & Banking committee — 5 named personas.
 * Sector Specialist defaults to Energy / Real Estate and is overridable.
 */
export const FINANCE_COMMITTEE: AgentConfig[] = [
  {
    name: "David",
    role: "Finance Talent Partner",
    focus:
      "Licenses (CFA / CPA), financial modeling, pedigree, risk exposure, compensation realism.",
    domain: "FINANCE",
    weight: 0.8,
    tone: "recruiter",
  },
  {
    name: "Elena",
    role: "VP Quantitative Analytics",
    focus:
      "Financial mathematics, Monte Carlo methods, valuation models, market risk, quant rigor.",
    domain: "FINANCE",
    weight: 1.2,
    tone: "architect",
  },
  {
    name: "Michael",
    role: "Portfolio / Desk Lead",
    focus:
      "Deal execution, trade velocity, PnL impact, operational risk, regulatory audit trails.",
    domain: "FINANCE",
    weight: 1,
    tone: "lead",
  },
  {
    name: "Chen",
    role: "Managing Director, Head of Finance",
    focus:
      "Capital allocation, regulatory risk, bottom-line growth, franchise impact, leadership depth.",
    domain: "FINANCE",
    weight: 1.2,
    tone: "manager",
  },
  {
    name: "Sophia",
    role: "Energy / Real Estate Sector Expert",
    focus:
      "Asset-class nuances, macroeconomic drivers, sector-specific compliance, transferable skills across industries.",
    domain: "FINANCE",
    isSectorSpecialist: true,
    weight: 1,
    tone: "sector",
  },
];
