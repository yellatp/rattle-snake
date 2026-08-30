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
  it("returns a first-person draft with an ask via the mock LLM", async () => {
    const { createMockClient } = await import("../llm/mock.js");
    const draft = await generateColdEmail(JOB, createMockClient(), { audience: "founder" });
    expect(draft.subject.length).toBeGreaterThan(0);
    expect(draft.body.length).toBeGreaterThan(0);
    expect(draft.cta).toBeTruthy();
    expect(draft.angleUsed).toBe("transferable");
    expect(draft.body).toMatch(/\bI\b/);
    expect(draft.body).not.toContain("\u2014");
    expect(draft.subject).not.toContain("\u2014");
  });

  it("keeps the mock on the LLM path (voice gate passes)", async () => {
    const { createMockClient } = await import("../llm/mock.js");
    const draft = await generateColdEmail(JOB, createMockClient(), {});
    expect(draft.body).toContain("stay fast under real production load");
  });

  it("falls back to a deterministic first-person draft when the LLM is unavailable", async () => {
    const draft = await generateColdEmail(JOB, brokenClient, { audience: "recruiter" });
    expect(draft.subject).toContain("Rohan Mehta");
    expect(draft.body).toContain("Hi,");
    expect(draft.body).toMatch(/\bI\b/);
    expect(draft.cta).toBeTruthy();
    expect(draft.body).not.toContain("A few facts about me");
    expect(draft.body).not.toContain("\u2014");
  });

  it("honors the target name and cta style options", async () => {
    const draft = await generateColdEmail(JOB, brokenClient, {
      audience: "hiring_manager",
      targetName: "Priya",
      ctaStyle: "reply",
    });
    expect(draft.body).toContain("Hi Priya,");
    expect(draft.cta).toContain("reply");
  });
});

describe("coldEmail.buildColdEmailPrompt (v2)", () => {
  it("embeds the role, JD, audience, and the selection contract", () => {
    const prompt = buildColdEmailPrompt(JOB, undefined, {
      audience: "recruiter",
      angle: "scale",
      length: "short",
      ctaStyle: "coffee_chat",
      tone: "bold",
    });
    expect(prompt).toContain("cold outreach writer");
    expect(prompt).toContain("Software Engineer");
    expect(prompt).toContain("FinTech");
    expect(prompt).toContain("Narrative angle: scale");
    expect(prompt).toContain("70-100 words");
    expect(prompt).toContain("virtual coffee");
    expect(prompt).toContain("first-person");
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

  it("includes strong matches when a gap analysis exists", () => {
    const job: JobState = {
      ...JOB,
      gapAnalysis: {
        gapAnalysis: {
          mustHaveGaps: [],
          niceToHaveGaps: [],
          strongMatches: [{ item: "event-driven systems", notes: "committee confirmed" }],
          inflatedClaims: [],
          overallReadiness: "Strong Match",
          summary: "ok",
        },
        suggestions: [],
        priorityActions: [],
      },
    };
    const prompt = buildColdEmailPrompt(job, undefined, {});
    expect(prompt).toContain("event-driven systems");
  });
});
