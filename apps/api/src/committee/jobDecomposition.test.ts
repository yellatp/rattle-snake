import { describe, expect, it } from "vitest";
import type { LLMClient } from "../llm/client.js";
import {
  extractJobDecomposition,
  extractViaRules,
} from "./jobDecomposition.js";

const JD = `FinPay
Senior Backend Engineer (Payments Platform)
5-8 years of professional experience building low-latency, event-driven systems.

Requirements:
- TypeScript or Go at production scale
- Kafka, event-driven architecture
- PostgreSQL and Redis
- Production reliability ownership and on-call
- Experience with payment processing and PCI-DSS compliance

Nice to have:
- Kubernetes and Terraform
- Idempotent retry patterns

This is NOT a dashboards or ops role. You will own settlement reliability for 2M+ monthly orders.`;

describe("extractJobDecomposition — LLM path", () => {
  it("returns a Zod-valid decomposition from the LLM", async () => {
    const goodLLM: LLMClient = {
      provider: "stub",
      model: "stub",
      async complete() {
        return JSON.stringify({
          level: "Senior IC (Applied Scientist III)",
          seniorityExpectation: "5-8 yrs, system-level ownership",
          screeningFilters: ["not a dashboards or ops role"],
          mustHave: ["TypeScript or Go", "Kafka"],
          niceToHave: ["Kubernetes"],
          stackWords: ["Kafka", "PostgreSQL", "Redis"],
          businessProblems: [
            {
              problem: "realtime settlement reliability",
              detail: "2M+ monthly orders",
              mappedRequirement: "production reliability ownership",
            },
          ],
          domainConstraints: ["payments / fintech", "PCI-DSS compliance"],
          businessContext: "FinPay processes payment settlements for merchants.",
        });
      },
    };
    const result = await extractJobDecomposition(
      { jobDescription: JD, domain: "SDE", roleSlug: "backend_engineer" },
      goodLLM,
    );
    expect(result.level).toContain("Senior IC");
    expect(result.screeningFilters).toContain("not a dashboards or ops role");
    expect(result.stackWords).toContain("Kafka");
    expect(result.businessProblems[0]?.problem).toBe("realtime settlement reliability");
  });

  it("strips JSON code fences before parsing", async () => {
    const fencedLLM: LLMClient = {
      provider: "stub",
      model: "stub",
      async complete() {
        return "```json\n{\"level\":\"Senior\",\"seniorityExpectation\":\"5-8 yrs\",\"screeningFilters\":[],\"mustHave\":[],\"niceToHave\":[],\"stackWords\":[],\"businessProblems\":[],\"domainConstraints\":[],\"businessContext\":\"\"}\n```";
      },
    };
    const result = await extractJobDecomposition(
      { jobDescription: JD, domain: "SDE" },
      fencedLLM,
    );
    expect(result.level).toBe("Senior");
  });

  it("falls back to rules when the LLM returns unusable JSON", async () => {
    const badLLM: LLMClient = {
      provider: "stub",
      model: "stub",
      async complete() {
        return "not json at all";
      },
    };
    const result = await extractJobDecomposition(
      { jobDescription: JD, domain: "SDE" },
      badLLM,
    );
    expect(result.level).toBe("Senior");
    expect(result.seniorityExpectation).toBe("5-8 yrs");
    expect(result.stackWords).toContain("kafka");
    expect(result.stackWords).toContain("redis");
    expect(result.mustHave.length).toBeGreaterThanOrEqual(1);
    expect(result.screeningFilters).toContain(
      "not a dashboards or ops role",
    );
  });
});

describe("extractViaRules — deterministic fallback", () => {
  it("derives level, years, stack words, and constraints from the JD", () => {
    const result = extractViaRules({ jobDescription: JD, domain: "SDE" });
    expect(result.level).toBe("Senior");
    expect(result.seniorityExpectation).toBe("5-8 yrs");
    expect(result.stackWords).toContain("kafka");
    expect(result.stackWords).toContain("postgresql");
    expect(result.domainConstraints.some((c) => c.includes("payments"))).toBe(true);
    expect(result.domainConstraints.some((c) => c.includes("compliance"))).toBe(true);
  });

  it("never throws on a minimal JD and leaves unknown fields empty", () => {
    const result = extractViaRules({ jobDescription: "Hiring.", domain: "SDE" });
    expect(result.level).toBe("");
    expect(result.seniorityExpectation).toBe("");
    expect(result.stackWords).toEqual([]);
    expect(result.mustHave).toEqual([]);
    expect(result.businessProblems).toEqual([]);
  });

  it("uses the extracted sector as the business-context fallback", () => {
    const result = extractViaRules({
      jobDescription: JD,
      domain: "SDE",
      jdMeta: { sector: "FinTech payments" },
    });
    expect(result.businessContext).toContain("FinTech payments");
  });
});
