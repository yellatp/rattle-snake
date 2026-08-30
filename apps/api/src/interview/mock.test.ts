import { describe, expect, it } from "vitest";
import type { JobState } from "@rattlesnake/shared";
import type { LLMClient } from "../llm/types.js";
import { buildInterviewMockPrompt, generateInterviewMock } from "./mock.js";

const JOB: JobState = {
  id: "job_im_1",
  domain: "SDE",
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

describe("interviewMock.generateInterviewMock", () => {
  it("returns a full 5-expert plan via the mock LLM", async () => {
    const { createMockClient } = await import("../llm/mock.js");
    const plan = await generateInterviewMock(JOB, createMockClient());
    expect(plan.roleLabel).toBe("Software Engineer");
    expect(plan.pipeline.length).toBeGreaterThanOrEqual(4);
    expect(plan.experts).toHaveLength(5);
    expect(plan.topics.length).toBeGreaterThan(0);
    expect(plan.prepTips.length).toBeGreaterThan(0);
    for (const expert of plan.experts) {
      expect(expert.expectations.length).toBeGreaterThan(0);
      expect(expert.drillQuestions.length).toBeGreaterThan(0);
      expect(expert.redFlags.length).toBeGreaterThan(0);
    }
  });

  it("falls back to rules-based phases/experts when the LLM is unavailable", async () => {
    const plan = await generateInterviewMock(JOB, brokenClient);
    expect(plan.roleLabel).toBe("Software Engineer");
    expect(plan.pipeline.length).toBeGreaterThanOrEqual(4);
    // 6 years of experience selects the mid-band committee: 4 expert seats.
    expect(plan.experts).toHaveLength(4);
    expect(plan.pipeline[0]!.name).toContain("Recruiter");
    expect(plan.summary).toContain("five phases");
    for (const str of [plan.summary, ...plan.topics, ...plan.prepTips]) {
      expect(str).not.toContain("—");
    }
  });
});

describe("interviewMock.buildInterviewMockPrompt", () => {
  it("embeds the committee seats and role in the system prompt", () => {
    const prompt = buildInterviewMockPrompt(JOB);
    expect(prompt).toContain("interview coach");
    expect(prompt).toContain("Software Engineer");
    expect(prompt).toContain("Lead Technical Recruiter");
    expect(prompt).toContain("Sector Specialist");
  });
});
