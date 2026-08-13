import { describe, expect, it } from "vitest";
import type { Blueprint, JobState } from "@rattlesnake/shared";
import type { LLMClient } from "../llm/types.js";
import { generateSophisticatedResume } from "./engine.js";

const JD =
  "Senior Backend Engineer. TypeScript, Go, distributed systems, microservices, Kafka, PostgreSQL, low-latency payments, on-call.";

const BASE_RESUME = `Rohan Mehta — Backend Engineer (6 years).
Senior Software Engineer — RetailWorks, 2021–Present.
Built inventory synchronization services. Improved API latency by refactoring
queries. Migrated a monolith to event-driven microservices using Kafka.
Skills: TypeScript, Go, PostgreSQL, Redis, Kafka, Docker, Kubernetes, AWS.`;

const BLUEPRINT: Blueprint = {
  objections: ["missing latency metric", "no PCI-DSS context"],
  strengths: ["monolith-to-Kafka migration evidence"],
  requiredChanges: ["quantify latency reduction"],
  sectorNotes: ["event streaming transfers to real-time payments"],
  pivotFactors: ["scale evidence"],
  verdicts: { Alex: "HIRE" },
  consensus: "SHORTLISTED",
};

const RESUME_JSON = JSON.stringify({
  role: "Software Engineer",
  slug: "swe",
  contact: { name: "Rohan Mehta", email: "rohan@example.com" },
  sections: {
    summary: {
      content:
        "Backend engineer with 6 years of experience in low-latency event-driven systems with TypeScript and Go.",
    },
    skills: {
      categories: [{ name: "Languages", items: ["TypeScript", "Go"] }],
    },
    experience: [
      {
        id: "e1",
        title: "Senior Software Engineer",
        company: "RetailWorks",
        bullets: [
          "Reduced API latency by 40% across 2M+ monthly orders using PostgreSQL query tuning and Redis caching.",
          "Migrated a monolith to event-driven microservices on Kafka.",
        ],
      },
    ],
  },
  ats_keywords: [],
  changed_sections: ["e1"],
});

const APPROVED_MODERATION = JSON.stringify({
  score: 92,
  approved: true,
  summaryVerdict: "Score 92 — strong bullets aligned to the JD.",
  bannedPhrases: [],
  issues: [],
  suggestions: [],
});

const REJECTED_MODERATION = JSON.stringify({
  score: 40,
  approved: false,
  summaryVerdict: "Score 40 — weak bullets.",
  bannedPhrases: ["seamlessly"],
  issues: ["bullets lack results"],
  suggestions: ["add outcomes"],
});

function jobFor(): JobState {
  return {
    id: "job-engine",
    domain: "SWE",
    jobDescription: JD,
    baseResume: BASE_RESUME,
    transcript: [],
    status: "rewriting",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function jobForUK(): JobState {
  return { ...jobFor(), jobLocation: "London, UK" };
}

function stubLLM(
  handlers: Array<(system: string) => string>,
): { llm: LLMClient; calls: string[] } {
  const calls: string[] = [];
  const responses = [...handlers];
  const llm: LLMClient = {
    provider: "stub",
    model: "stub",
    async complete(system) {
      calls.push(system);
      const next = responses.shift();
      if (!next) throw new Error("mock: no response left");
      return next(system);
    },
  };
  return { llm, calls };
}

function isModerator(system: string): boolean {
  return system.includes("resume quality auditor");
}

describe("generateSophisticatedResume", () => {
  it("detects the role, generates JSON, scores ATS and passes moderation", async () => {
    const { llm, calls } = stubLLM([
      () => RESUME_JSON,
      () => APPROVED_MODERATION,
    ]);

    const result = await generateSophisticatedResume(jobFor(), BLUEPRINT, llm);

    expect(result.meta.role).toBe("swe");
    expect(result.meta.roleLabel).toBe("Software Engineer");
    expect(result.meta.iterations).toBe(1);
    expect(result.meta.moderationApproved).toBe(true);
    expect(result.meta.moderationScore).toBe(92);
    expect(result.meta.atsScore).toBeGreaterThan(0);
    expect(result.meta.locale).toBe("us");
    expect(result.markdown.startsWith("# Rohan Mehta")).toBe(true);
    const parsed = JSON.parse(result.json);
    expect(parsed.sections.experience).toHaveLength(1);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toContain("resume quality auditor");
  });

  it("injects the committee blueprint into the generation system prompt", async () => {
    const probeCalls: string[] = [];
    const llm: LLMClient = {
      provider: "stub",
      model: "stub",
      async complete(system) {
        probeCalls.push(system);
        return isModerator(system) ? APPROVED_MODERATION : RESUME_JSON;
      },
    };
    await generateSophisticatedResume(jobFor(), BLUEPRINT, llm);

    expect(probeCalls[0]).toContain("senior resume writer");
    expect(probeCalls[0]).toContain("HIRING COMMITTEE FEEDBACK");
    expect(probeCalls[0]).toContain("GAP REPORT");
    expect(probeCalls[0]).toContain("monolith-to-Kafka migration evidence");
    expect(probeCalls[0]).toContain("quantify latency reduction");
  });

  it("regenerates once with moderator feedback when the first pass is rejected", async () => {
    const { llm, calls } = stubLLM([
      () => RESUME_JSON,
      () => REJECTED_MODERATION,
      () => RESUME_JSON,
      () => APPROVED_MODERATION,
    ]);

    const result = await generateSophisticatedResume(jobFor(), BLUEPRINT, llm);

    expect(result.meta.iterations).toBe(2);
    expect(result.meta.moderationApproved).toBe(true);
    // Second generation run carried the moderator feedback block.
    const genCalls = calls.filter((c) => c.includes("senior resume writer"));
    expect(genCalls).toHaveLength(2);
    expect(genCalls[1]).toContain("MODERATOR FEEDBACK");
    expect(genCalls[1]).toContain("Quality score was 40/100");
    expect(genCalls[1]).toContain("seamlessly");
  });

  it("regenerates when the LLM returns unparseable JSON", async () => {
    const { llm } = stubLLM([
      () => "Sure! Here is the resume:\nnot really json",
      () => RESUME_JSON,
      () => APPROVED_MODERATION,
    ]);

    const result = await generateSophisticatedResume(jobFor(), BLUEPRINT, llm);

    expect(result.meta.iterations).toBe(2);
    expect(result.meta.moderationApproved).toBe(true);
    expect(result.markdown).toContain("Rohan Mehta");
  });

  it("never regenerates past the iteration cap", async () => {
    // Always rejected: generator runs twice (cap) even though moderation fails.
    const { llm } = stubLLM([
      () => RESUME_JSON,
      () => REJECTED_MODERATION,
      () => RESUME_JSON,
      () => REJECTED_MODERATION,
    ]);

    const result = await generateSophisticatedResume(jobFor(), BLUEPRINT, llm);
    expect(result.meta.iterations).toBe(2);
    expect(result.meta.moderationApproved).toBe(false);
    expect(result.meta.moderationScore).toBe(40);
    expect(result.markdown).toContain("Rohan Mehta");
  });

  it("injects a US English directive when the job is based in the USA", async () => {
    const calls: string[] = [];
    const llm: LLMClient = {
      provider: "stub",
      model: "stub",
      async complete(system) {
        calls.push(system);
        return isModerator(system) ? APPROVED_MODERATION : RESUME_JSON;
      },
    };
    await generateSophisticatedResume(
      { ...jobFor(), jobLocation: "New York, USA" },
      BLUEPRINT,
      llm,
    );

    expect(calls[0]).toContain("ENGLISH VARIANT — US English");
    expect(calls[0]).toContain("organize, analyze, specialize");
    expect(calls[0]).not.toContain("UK English");
    // Moderator also checks the variant.
    expect(calls[1]).toContain("US English");
  });

  it("injects a UK English directive + moderator note for a UK-based job", async () => {
    const calls: string[] = [];
    const llm: LLMClient = {
      provider: "stub",
      model: "stub",
      async complete(system) {
        calls.push(system);
        return isModerator(system) ? APPROVED_MODERATION : RESUME_JSON;
      },
    };
    const result = await generateSophisticatedResume(jobForUK(), BLUEPRINT, llm);

    expect(result.meta.locale).toBe("uk");
    expect(calls[0]).toContain("ENGLISH VARIANT — UK English");
    expect(calls[0]).toContain("organise, analyse, specialise");
    expect(calls[0]).toContain("CV");
    expect(calls[0]).not.toContain("US English");
    expect(calls[1]).toContain("UK English");
  });
});
