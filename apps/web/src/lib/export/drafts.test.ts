import { describe, expect, it } from "vitest";
import type { JobState } from "@rattlesnake/shared";
import {
  coverLetterToJson,
  coverLetterToMarkdown,
  coverLetterToPlaintext,
  interviewToJson,
  interviewToMarkdown,
  interviewToPlaintext,
} from "./drafts";

function jobWith(partial: Partial<JobState>): JobState {
  return {
    id: "run-123",
    domain: "SDE",
    roleSlug: "swe",
    jobDescription: "JD",
    baseResume: "Resume",
    transcript: [],
    status: "completed",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    jdMeta: { company: "FinPay", role: "Backend Engineer", sector: "fintech", location: "US", team: "", roleSlug: "swe" },
    ...partial,
  };
}

describe("cover letter draft serializers", () => {
  const job = jobWith({
    coverLetterDraft: {
      subject: "Application for Backend Engineer",
      salutation: "Dear Hiring Manager,",
      body: "I am writing to apply.\n\nI bring six years of experience.",
      closing: "Best regards,\nRohan Mehta",
    },
  });

  it("builds a markdown letter with all four sections", () => {
    const md = coverLetterToMarkdown(job);
    expect(md).toContain("**Subject:** Application for Backend Engineer");
    expect(md).toContain("Dear Hiring Manager,");
    expect(md).toContain("six years of experience");
    expect(md).toContain("Best regards,");
  });

  it("builds a plaintext letter without markdown symbols", () => {
    const txt = coverLetterToPlaintext(job);
    expect(txt).not.toContain("**");
    expect(txt).toContain("Subject: Application for Backend Engineer");
    expect(txt).toContain("Dear Hiring Manager,");
  });

  it("builds pretty JSON", () => {
    const json = coverLetterToJson(job);
    expect(JSON.parse(json)).toMatchObject({ subject: "Application for Backend Engineer" });
  });
});

describe("interview plan serializers", () => {
  const job = jobWith({
    interviewPlan: {
      roleLabel: "Backend Engineer",
      summary: "A three-stage process.",
      pipeline: [
        {
          name: "Technical Screen",
          duration: "60 min",
          format: "Live coding",
          focus: "System design",
          typicalQuestions: ["Design a rate limiter"],
        },
      ],
      experts: [
        {
          seat: "Priya",
          role: "Lead Technical Recruiter",
          lens: "Culture fit",
          expectations: ["Collaboration stories"],
          drillQuestions: ["Tell me about a conflict"],
          redFlags: ["Vague answers"],
        },
      ],
      topics: ["Distributed systems", "SQL"],
      prepTips: ["Practice live coding"],
    },
  });

  it("builds a markdown plan with pipeline, experts, topics and tips", () => {
    const md = interviewToMarkdown(job);
    expect(md).toContain("A three-stage process.");
    expect(md).toContain("Technical Screen");
    expect(md).toContain("Design a rate limiter");
    expect(md).toContain("Priya - Lead Technical Recruiter");
    expect(md).toContain("Distributed systems");
    expect(md).toContain("Practice live coding");
  });

  it("builds a plaintext plan without markdown symbols", () => {
    const txt = interviewToPlaintext(job);
    expect(txt).not.toContain("**");
    expect(txt).toContain("Technical Screen (60 min, Live coding)");
    expect(txt).toContain("Red flags:");
  });

  it("builds pretty JSON", () => {
    const json = interviewToJson(job);
    expect(JSON.parse(json)).toMatchObject({ roleLabel: "Backend Engineer" });
  });
});
