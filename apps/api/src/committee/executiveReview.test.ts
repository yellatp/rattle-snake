import { describe, expect, it } from "vitest";
import type { LLMClient } from "../llm/client.js";
import {
  executiveForRole,
  EXEC_PERSONA_FOR_DOMAIN,
  EXEC_PERSONA_FOR_SLUG,
  runExecutiveReview,
  type ExecutiveReviewInput,
} from "./executiveReview.js";

function goodInput(overrides: Partial<ExecutiveReviewInput> = {}): ExecutiveReviewInput {
  return {
    persona: "CTO",
    company: "FinPay",
    domain: "SDE",
    jobDescription: "Senior Backend Engineer",
    baseResume: "Resume",
    transcript: [],
    consensus: "SHORTLISTED",
    tallies: { HIRE: 5, REJECT: 2 },
    blueprint: {
      verdict: "SHORTLISTED",
      objections: [],
      strengths: [],
      requiredChanges: [],
      pivotFactors: [],
      sectorNotes: [],
      verdictReason: "solid",
    },
    ...overrides,
  };
}

describe("executiveForRole", () => {
  it("maps role slugs to function personas", () => {
    expect(executiveForRole("product_manager")).toBe("CPO");
    expect(executiveForRole("marketing_analyst")).toBe("CMO");
    expect(executiveForRole("operations_analyst")).toBe("COO");
    expect(executiveForRole("business_strategist")).toBe("CEO");
  });

  it("falls back to the domain default persona", () => {
    expect(executiveForRole(undefined, "SDE")).toBe("CTO");
    expect(executiveForRole(undefined, "DATA_SCIENCE")).toBe("CDO");
    expect(executiveForRole(undefined, "CYBERSECURITY")).toBe("CISO");
    expect(executiveForRole("unknown_slug", "PROJECT_MANAGEMENT")).toBe("COO");
  });

  it("last resort is the CEO", () => {
    expect(executiveForRole()).toBe("CEO");
  });

  it("the role slug wins over the domain", () => {
    expect(executiveForRole("product_manager", "SDE")).toBe("CPO");
  });

  it("every domain has a mapped persona", () => {
    const domains = [
      "AI_ENGINEERING",
      "ML_ENGINEERING",
      "SDE",
      "DATA_ENGINEERING",
      "DATA_SCIENCE",
      "CYBERSECURITY",
      "NETWORKING",
      "DEVOPS",
      "PROJECT_MANAGEMENT",
    ] as const;
    for (const d of domains) {
      expect(EXEC_PERSONA_FOR_DOMAIN[d], d).toBeTruthy();
    }
    for (const slug of Object.keys(EXEC_PERSONA_FOR_SLUG)) {
      expect(EXEC_PERSONA_FOR_SLUG[slug], slug).toBeTruthy();
    }
  });
});

describe("runExecutiveReview", () => {
  it("produces a repaired, advisory review from the LLM", async () => {
    const llm: LLMClient = {
      provider: "stub",
      model: "stub",
      async complete() {
        return JSON.stringify({
          debateRelevance: { score: 8, note: "debate hit the must-haves" },
          roleAlignment: { score: 7, note: "senior scope covered" },
          growthAlignment: { score: 6, note: "growth path implied" },
          requirementAssessment: "Covers TypeScript and Kafka.",
          conditionsToHire: ["want one more reference"],
          opinion: "FAVORABLE",
          opinionReason: "Strong fit with a clear caveat.",
          summary: "Advisory recommendation.",
        });
      },
    };
    const review = await runExecutiveReview(goodInput(), llm);
    expect(review).not.toBeNull();
    expect(review!.persona).toBe("CTO");
    expect(review!.company).toBe("FinPay");
    expect(review!.opinion).toBe("FAVORABLE");
    expect(review!.debateRelevance.score).toBe(8);
    expect(review!.conditionsToHire).toEqual(["want one more reference"]);
  });

  it("repairs missing persona and company back to the inputs", async () => {
    const llm: LLMClient = {
      provider: "stub",
      model: "stub",
      async complete() {
        return JSON.stringify({ opinion: "NEUTRAL", opinionReason: "mixed" });
      },
    };
    const review = await runExecutiveReview(
      goodInput({ persona: "CISO", company: "SecCo" }),
      llm,
    );
    expect(review!.persona).toBe("CISO");
    expect(review!.company).toBe("SecCo");
    expect(review!.debateRelevance).toEqual({ score: 0, note: "" });
    expect(review!.conditionsToHire).toEqual([]);
  });

  it("returns null when the LLM returns unusable JSON", async () => {
    const llm: LLMClient = {
      provider: "stub",
      model: "stub",
      async complete() {
        return "definitely not json";
      },
    };
    expect(await runExecutiveReview(goodInput(), llm)).toBeNull();
  });

  it("returns null when the LLM throws", async () => {
    const llm: LLMClient = {
      provider: "stub",
      model: "stub",
      async complete() {
        throw new Error("upstream down");
      },
    };
    expect(await runExecutiveReview(goodInput(), llm)).toBeNull();
  });

  it("strips JSON code fences before parsing", async () => {
    const llm: LLMClient = {
      provider: "stub",
      model: "stub",
      async complete() {
        return '```json\n{"opinion":"UNFAVORABLE","opinionReason":"poor fit"}\n```';
      },
    };
    const review = await runExecutiveReview(goodInput(), llm);
    expect(review!.opinion).toBe("UNFAVORABLE");
  });
});
