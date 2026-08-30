import { describe, expect, it } from "vitest";
import { detectDomain, DOMAIN_COMMITTEES, getCommitteeForDomain } from "./index.js";
import { DOMAINS } from "../types.js";

const JD = {
  AI_ENGINEERING: `AI Engineer building LLM and agentic systems.
Prompt engineering, RAG pipelines, model inference, generative AI with OpenAI APIs.
We need someone who can ship AI features with guardrails.`,

  ML_ENGINEERING: `Machine Learning Engineer role: model training, feature engineering,
deep learning with PyTorch. Data scientist with strong statistical rigor and
classification experience.`,

  SDE: `Senior Backend Engineer at a distributed systems company.
We build microservices in TypeScript and Java with PostgreSQL at scale.
Strong system design, distributed systems, and concurrency required.
DevOps engineers also welcome.`,

  DATA_ENGINEERING: `Data Engineer building ETL and ELT pipelines with Airflow and Spark.
Data platform, data warehouse, lakehouse architecture, and data pipeline
orchestration are the core of this role.`,

  DATA_SCIENCE: `Data Analyst / Business Intelligence Analyst role.
Heavy SQL, product analytics, A/B testing, analytics dashboards.
Pricing analyst and market research experience a plus.`,

  CYBERSECURITY: `Cybersecurity Analyst role: security analyst, threat hunting,
incident response, vulnerability management, IAM, pentest and penetration testing.`,

  NETWORKING: `Network Engineer role: routing and switching, DNS, load balancing,
SD-WAN, cloud networking. Cloud engineer with strong networking fundamentals.`,

  DEVOPS: `DevOps Engineer / Site Reliability Engineer role:
CI/CD, Kubernetes, Docker, Terraform, infrastructure as code, observability, on-call.`,

  PROJECT_MANAGEMENT: `Project Manager / Product Manager role: roadmap, stakeholder
management, scrum and agile delivery. Business analyst and operations analyst
support the program.`,
};

describe("detectDomain", () => {
  it.each(DOMAINS)("detects the %s domain from a keyword-rich JD", (domain) => {
    expect(detectDomain(JD[domain])).toBe(domain);
  });

  it("returns null for an ambiguous JD (too few keyword hits)", () => {
    expect(detectDomain("We need a smart person to join our team. Great culture, snacks provided.")).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(detectDomain(JD.SDE.toLowerCase())).toBe("SDE");
  });

  it("prefers the highest-scoring domain on mixed keywords", () => {
    const mixed = "data scientist with machine learning experience applying financial models to risk";
    expect(detectDomain(mixed)).toBe("ML_ENGINEERING");
  });
});

describe("DOMAIN_COMMITTEES", () => {
  it("exposes exactly the nine required domains", () => {
    expect(Object.keys(DOMAIN_COMMITTEES).sort()).toEqual([...DOMAINS].sort());
  });

  it.each(DOMAINS)("provides a 6-member committee for %s", (domain) => {
    const committee = DOMAIN_COMMITTEES[domain];
    expect(committee).toHaveLength(6);
    expect(committee.filter((a) => a.isSectorSpecialist)).toHaveLength(1);
  });

  it("always reserves a Sector Specialist as the 6th seat", () => {
    for (const d of DOMAINS) {
      const committee = DOMAIN_COMMITTEES[d]!;
      expect(committee[5]!.isSectorSpecialist).toBe(true);
    }
  });
});

describe("getCommitteeForDomain", () => {
  it("rewrites the Sector Specialist seat when sectorFocus is given", () => {
    const committee = getCommitteeForDomain("SDE", "HealthTech");
    const specialist = committee.find((a) => a.isSectorSpecialist)!;
    expect(specialist.role).toContain("HealthTech");
    expect(specialist.focus).toContain("HealthTech");
    expect(specialist.focus).toContain("transferable skills");
  });

  it("returns the template untouched without a sectorFocus", () => {
    const committee = getCommitteeForDomain("SDE");
    expect(committee).toEqual(DOMAIN_COMMITTEES.SDE);
  });

  it.each([
    [1, ["senior", "recruiter", "sector"]],
    [5, ["senior", "manager", "recruiter", "sector"]],
    [8, ["senior", "manager", "staff", "recruiter", "sector"]],
    [15, ["manager", "staff", "principal", "recruiter", "sector"]],
  ])("filters seats to the %i-year band", (years, expectedKinds) => {
    const committee = getCommitteeForDomain("SDE", undefined, undefined, years);
    expect(committee.map((a) => a.kind).sort()).toEqual([...expectedKinds].sort());
  });

  it("keeps all six seats when the experience years are unknown", () => {
    expect(getCommitteeForDomain("SDE", undefined, undefined, undefined)).toHaveLength(6);
  });
});
