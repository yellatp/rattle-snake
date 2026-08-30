import { describe, expect, it } from "vitest";
import type { LLMClient } from "../llm/types.js";
import { moderateResume } from "./moderator.js";

const APPROVED = JSON.stringify({
  score: 92,
  approved: true,
  summaryVerdict: "Score 92 - strong bullets.",
  bannedPhrases: [],
  issues: [],
  suggestions: [],
});

function stubLLM(response: string): LLMClient {
  return {
    provider: "stub",
    model: "stub",
    async complete() {
      return response;
    },
  };
}

function resumeJson(overrides: {
  skills?: string[];
  bullets?: string[];
}): string {
  return JSON.stringify({
    role: "Software Engineer",
    slug: "swe",
    contact: { name: "Rohan Mehta" },
    sections: {
      summary: { content: "Backend engineer." },
      skills: { categories: [{ name: "Languages", items: overrides.skills ?? [] }] },
      experience: [
        {
          id: "e1",
          title: "Software Engineer",
          company: "RetailWorks",
          dates: "2021 - Present",
          bullets: overrides.bullets ?? [],
        },
      ],
    },
    ats_keywords: [],
  });
}

describe("moderateResume deterministic over-enhancement audit", () => {
  const verifiedEnhancement = (i: number) => ({
    original: "Built payment reconciliation in Java.",
    enhanced: `Built and scaled payment reconciliation across ${i} regions in Java.`,
    justification: "Extends proven Java work to the posting's preferred scale-up experience.",
  });

  // A pure addition has NO source text: the enhancement adds brand-new scope.
  const pureAddition = (i: number) => ({
    original: "",
    enhanced: `Scaled Java payment batch across ${i} regions.`,
    justification: "Posting's preferred scale-up experience, plausible from the Java work.",
  });

  it("hard-fails an enhancement with no justification (un-auditable)", async () => {
    const llm = stubLLM(APPROVED);
    const resume = resumeJson({
      skills: ["Java"],
      bullets: ["Built payment reconciliation in Java."],
    });
    const result = await moderateResume(
      resume,
      "Java engineer",
      llm,
      "us",
      [],
      [{ original: "", enhanced: "Led a team of 12 platform engineers.", justification: "" }],
      "balanced",
    );
    expect(result.score).toBe(87);
    expect(result.approved).toBe(false);
    expect(result.issues.some((i) => i.includes("no justification"))).toBe(true);
  });

  it("hard-fails pure additions above the balanced ceiling of 2", async () => {
    const llm = stubLLM(APPROVED);
    const resume = resumeJson({ skills: ["Java"], bullets: ["Built things in Java."] });
    const enhancements = [1, 2, 3].map(pureAddition);
    const result = await moderateResume(resume, "JD", llm, "us", [], enhancements, "balanced");
    expect(result.score).toBe(77);
    expect(result.approved).toBe(false);
    expect(result.issues.some((i) => i.includes("pure-addition enhancement"))).toBe(true);
  });

  it("allows pure additions at or below the tier ceiling", async () => {
    const calls: string[] = [];
    const llm: LLMClient = {
      provider: "stub",
      model: "stub",
      async complete(system) {
        calls.push(system);
        return APPROVED;
      },
    };
    const resume = resumeJson({ skills: ["Java"], bullets: ["Built things in Java."] });
    const enhancements = [1, 2].map(verifiedEnhancement);
    const result = await moderateResume(resume, "JD", llm, "us", [], enhancements, "balanced");
    expect(result.score).toBe(92);
    expect(result.approved).toBe(true);
    expect(calls[0]).toContain("OVER-ENHANCEMENT AUDIT");
    expect(calls[0]).toContain("Enhancement list:");
  });

  it("caps pure additions at zero for a regulated sector regardless of tier", async () => {
    const llm = stubLLM(APPROVED);
    const resume = resumeJson({ skills: ["Java"], bullets: ["Built things in Java."] });
    const result = await moderateResume(
      resume,
      "JD",
      llm,
      "us",
      [],
      [pureAddition(1)],
      "competitive",
      "fintech",
    );
    expect(result.score).toBe(87);
    expect(result.approved).toBe(false);
  });
});

describe("moderateResume deterministic qualification audit", () => {
  it("deducts for skills listed only in the Skills block (no WHERE)", async () => {
    const llm = stubLLM(APPROVED);
    const resume = resumeJson({
      skills: ["TypeScript", "Kubernetes", "Figma"],
      bullets: ["Built REST APIs in TypeScript on AWS."],
    });
    const result = await moderateResume(resume, "Software Engineer", llm);

    // Kubernetes and Figma are unproven -> -2 each = -4.
    expect(result.score).toBe(88);
    expect(result.approved).toBe(true);
    expect(result.issues.some((i) => i.includes("never proven in a bullet"))).toBe(true);
  });

  it("forces rejection when many skills are unproven (>=15 deduction)", async () => {
    const llm = stubLLM(APPROVED);
    const resume = resumeJson({
      skills: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"].map(
        (s) => `Skill${s}`,
      ),
      bullets: ["Built things in TypeScript."],
    });
    const result = await moderateResume(resume, "Software Engineer", llm);

    // 10 unproven skills -> capped at -20 -> hard fail.
    expect(result.score).toBe(72);
    expect(result.approved).toBe(false);
  });

  it("does not flag skills that are proven in a bullet", async () => {
    const llm = stubLLM(APPROVED);
    const resume = resumeJson({
      skills: ["TypeScript", "AWS", "PostgreSQL"],
      bullets: [
        "Built REST APIs in TypeScript on AWS.",
        "Tuned PostgreSQL query plans with Redis caching.",
      ],
    });
    const result = await moderateResume(resume, "Software Engineer", llm);
    expect(result.score).toBe(92);
    expect(result.approved).toBe(true);
  });

  it("passes the screening checklist into the system prompt", async () => {
    const calls: string[] = [];
    const llm: LLMClient = {
      provider: "stub",
      model: "stub",
      async complete(system) {
        calls.push(system);
        return APPROVED;
      },
    };
    await moderateResume(resumeJson({ bullets: ["Built things."] }), "JD", llm, "us", [
      "SQL",
      "Kubernetes",
    ]);
    expect(calls[0]).toContain("ROLE SCREENING CHECKLIST");
    expect(calls[0]).toContain("MINIMUM BAR");
    expect(calls[0]).toContain("- SQL");
    expect(calls[0]).toContain("- Kubernetes");
  });
});
