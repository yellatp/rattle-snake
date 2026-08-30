import { describe, expect, it } from "vitest";
import type { JobState } from "@rattlesnake/shared";
import type { LLMClient } from "../llm/types.js";
import { buildColdEmailPrompt, generateColdEmail } from "./coldEmail.js";

const JOB: JobState = {
  id: "job_ce_1",
  domain: "SWE",
  roleSlug: "swe",
  jobDescription:
    "Senior Backend Engineer, FinTech. 5+ years in TypeScript, Go, or Java. Distributed systems, Kafka, PostgreSQL at scale, production debugging, PCI-DSS awareness.",
  baseResume: `Rohan Mehta - Backend Engineer (6 years)\nSenior Software Engineer - RetailWorks\n- Reduced order API latency by 40% at 2M+ monthly orders\n- Migrated monolith to Kafka microservices, deploy time 45min to 5min\nSkills: TypeScript, Go, PostgreSQL, Kafka, AWS, Terraform`,
  transcript: [],
  status: "completed",
  finalVerdict: "SHORTLISTED",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const brokenClient = {
  provider: "broken",
  model: "none",
  async complete() {
    throw new Error("llm down");
  },
} as unknown as LLMClient;

describe("coldEmail.generateColdEmail", () => {
  it("returns a sanitized subject + body via the mock LLM", async () => {
    const { createMockClient } = await import("../llm/mock.js");
    const draft = await generateColdEmail(JOB, createMockClient(), { audience: "founder" });
    expect(draft.subject.length).toBeGreaterThan(0);
    expect(draft.body.length).toBeGreaterThan(0);
    expect(draft.subject).toContain("Rohan Mehta");
    expect(draft.subject).not.toContain("—");
    expect(draft.body).not.toContain("—");
  });

  it("falls back to a deterministic draft when the LLM is unavailable", async () => {
    const draft = await generateColdEmail(JOB, brokenClient, { audience: "recruiter" });
    expect(draft.subject).toContain("Rohan Mehta");
    expect(draft.body).toContain("Rohan Mehta");
    expect(draft.body).toContain("Software Engineer");
    expect(draft.subject).not.toContain("—");
    expect(draft.body).not.toContain("—");
  });

  it("honors the target name and tone options", async () => {
    const draft = await generateColdEmail(JOB, brokenClient, {
      audience: "hiring_manager",
      targetName: "Priya",
      tone: "direct",
    });
    expect(draft.body).toContain("Hi Priya,");
  });
});

describe("coldEmail.buildColdEmailPrompt", () => {
  it("embeds the role, JD, and audience in the system prompt", () => {
    const prompt = buildColdEmailPrompt(JOB, undefined, { audience: "recruiter" });
    expect(prompt).toContain("cold outreach writer");
    expect(prompt).toContain("Software Engineer");
    expect(prompt).toContain("FinTech");
  });

  it("sources vetted strengths from the SME panel's 360-degree analyses", () => {
    const job: JobState = {
      ...JOB,
      analyses: [
        {
          seat: "Alex",
          role: "Staff Architect",
          fitScore: 8,
          factors: [],
          strengths: ["shows real architectural ownership with scale numbers"],
          concerns: [],
          decision: "HIRE",
          decisionReason: "scale evidence wins",
          pivotFactor: "scale evidence",
        },
        {
          seat: "Meera",
          role: "Lead Technical Recruiter",
          fitScore: 8,
          factors: [],
          strengths: ["strong keyword alignment with the JD"],
          concerns: [],
          decision: "HIRE",
          decisionReason: "metric density",
          pivotFactor: "metric density",
        },
      ],
    };
    const prompt = buildColdEmailPrompt(job, undefined, { audience: "recruiter" });
    expect(prompt).toContain("real architectural ownership with scale numbers");
    expect(prompt).toContain("strong keyword alignment with the JD");
  });
});
