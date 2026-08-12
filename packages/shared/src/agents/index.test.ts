import { describe, expect, it } from "vitest";
import { detectDomain, DOMAIN_COMMITTEES, getCommitteeForDomain } from "./index.js";
import { DOMAINS } from "../types.js";

const JD = {
  SWE: `Senior Backend Engineer at a distributed systems company.
We build microservices in TypeScript and Java with PostgreSQL at scale.
Strong system design, distributed systems, and concurrency required.
DevOps engineers and SDETs also welcome.`,

  DATA_AI: `Data Scientist / ML Engineer role.
You will build machine learning pipelines, feature engineering, and models.
Experience with data engineering (ETL, Spark) and SQL required.
We run A/B tests and need hypothesis-driven analysis and NLP experience.`,

  FINANCE: `Quantitative Analyst at an investment bank.
Capital markets, fixed income, derivatives, and portfolio risk.
CFA or financial modeling experience preferred. Treasury and compliance exposure.`,
};

describe("detectDomain", () => {
  it.each(DOMAINS)("detects the %s domain from a keyword-rich JD", (domain) => {
    expect(detectDomain(JD[domain])).toBe(domain);
  });

  it("returns null for an ambiguous JD (too few keyword hits)", () => {
    expect(detectDomain("We need a smart person to join our team. Great culture, snacks provided.")).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(detectDomain(JD.SWE.toLowerCase())).toBe("SWE");
  });

  it("prefers the highest-scoring domain on mixed keywords", () => {
    const mixed = "data scientist with machine learning experience applying financial models to risk";
    const detected = detectDomain(mixed);
    expect(detected === "DATA_AI" || detected === "FINANCE").toBe(true);
  });
});

describe("DOMAIN_COMMITTEES", () => {
  it("exposes exactly the three required domains", () => {
    expect(Object.keys(DOMAIN_COMMITTEES).sort()).toEqual(["DATA_AI", "FINANCE", "SWE"]);
  });

  it.each(DOMAINS)("provides a 5-member committee for %s", (domain) => {
    const committee = DOMAIN_COMMITTEES[domain];
    expect(committee).toHaveLength(5);
    expect(committee.filter((a) => a.isSectorSpecialist)).toHaveLength(1);
  });

  it("always reserves a Sector/Domain Transferability Specialist as the 5th seat", (domain) => {
    for (const d of DOMAINS) {
      const committee = DOMAIN_COMMITTEES[d]!;
      expect(committee[4]!.isSectorSpecialist).toBe(true);
    }
  });
});

describe("getCommitteeForDomain", () => {
  it("rewrites the Sector Specialist seat when sectorFocus is given", () => {
    const committee = getCommitteeForDomain("SWE", "HealthTech");
    const specialist = committee.find((a) => a.isSectorSpecialist)!;
    expect(specialist.role).toContain("HealthTech");
    expect(specialist.focus).toContain("HealthTech");
    expect(specialist.focus).toContain("transferable skills");
  });

  it("returns the template untouched without a sectorFocus", () => {
    const committee = getCommitteeForDomain("SWE");
    expect(committee).toEqual(DOMAIN_COMMITTEES.SWE);
  });
});
