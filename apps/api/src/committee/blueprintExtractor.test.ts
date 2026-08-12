import { describe, expect, it } from "vitest";
import type { JobState, TranscriptEntry } from "@rattlesnake/shared";
import type { LLMClient } from "../llm/client.js";
import { extractBlueprint } from "./blueprintExtractor.js";

function entry(text: string, sender = "Alex", decision?: "HIRE" | "REJECT"): TranscriptEntry {
  return {
    id: `${sender}-${Math.random().toString(36).slice(2)}`,
    sender,
    role: "Staff Software Architect",
    round: 1,
    text,
    decision,
    createdAt: new Date().toISOString(),
  };
}

function jobFor(transcript: TranscriptEntry[]): JobState {
  return {
    id: "job-bp",
    domain: "SWE",
    jobDescription: "A long enough job description for testing purposes.",
    baseResume: "A long enough base resume for testing purposes.",
    transcript,
    status: "completed",
    finalVerdict: "SHORTLISTED",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

const SECTION_TEXT = `[STRONG POSITIVES]
- Led a 12-service monolith migration to Kafka microservices
- Reduced API latency by 40% at 2M+ orders/month

[HIGH-RISK CONCERNS]
- No explicit numbers for scale or load in key projects
- Missing PCI-DSS compliance context for payments work

[SECTOR & TRANSFERABILITY]
- High-concurrency event processing translates to real-time payments

[PIVOT POINT]
- Scale evidence outweighs the compliance gap

[VERDICT]
[STRONG HIRE] — the evidence supports proceeding.`;

describe("extractBlueprint — rule-based fallback", () => {
  it("parses sections + verdict markers when the LLM returns unusable JSON", async () => {
    const badLLM: LLMClient = {
      provider: "stub",
      model: "stub",
      async complete() {
        return "not json at all";
      },
    };

    const transcript = [
      entry(SECTION_TEXT, "Alex", "HIRE"),
      entry(`[VERDICT]\n[STRONG REJECT] — not a fit`, "Priya", "REJECT"),
    ];
    const bp = await extractBlueprint(jobFor(transcript), transcript, badLLM);

    expect(bp.objections.length).toBeGreaterThanOrEqual(1);
    expect(bp.strengths.length).toBeGreaterThanOrEqual(1);
    expect(bp.sectorNotes.length).toBeGreaterThanOrEqual(1);
    expect(bp.pivotFactors.length).toBeGreaterThanOrEqual(1);
    expect(bp.verdicts["Alex"]).toBe("HIRE");
    expect(bp.verdicts["Priya"]).toBe("REJECT");
    expect(bp.consensus).toBe("SHORTLISTED");
    // Every objection maps to a required change.
    expect(bp.requiredChanges.length).toBe(bp.objections.length);
  });

  it("infers consensus from the verdicts when none is provided", async () => {
    const badLLM: LLMClient = {
      provider: "stub",
      model: "stub",
      async complete() {
        return "nope";
      },
    };
    const transcript = [
      entry("[STRONG HIRE] — yes", "A", "HIRE"),
      entry("[STRONG HIRE] — yes", "B", "HIRE"),
      entry("[STRONG REJECT] — no", "C", "REJECT"),
    ];
    const bp = await extractBlueprint(jobFor(transcript), transcript, badLLM);
    expect(bp.consensus).toBe("SHORTLISTED");
  });
});

describe("extractBlueprint — LLM path", () => {
  it("returns a Zod-valid blueprint from the LLM", async () => {
    const goodLLM: LLMClient = {
      provider: "stub",
      model: "stub",
      async complete() {
        return JSON.stringify({
          objections: ["missing scale numbers"],
          strengths: ["latency reduction evidence"],
          requiredChanges: ["quantify scale"],
          sectorNotes: ["transferable event-streaming skills"],
          pivotFactors: ["scale evidence"],
          verdicts: { Alex: "HIRE" },
          consensus: "SHORTLISTED",
        });
      },
    };
    const transcript = [entry("[STRONG HIRE] — ok", "Alex", "HIRE")];
    const bp = await extractBlueprint(jobFor(transcript), transcript, goodLLM);
    expect(bp.consensus).toBe("SHORTLISTED");
    expect(bp.objections).toContain("missing scale numbers");
  });

  it("strips JSON code fences before parsing", async () => {
    const fencedLLM: LLMClient = {
      provider: "stub",
      model: "stub",
      async complete() {
        return "```json\n{\"objections\":[],\"strengths\":[],\"requiredChanges\":[],\"sectorNotes\":[],\"pivotFactors\":[],\"verdicts\":{\"Alex\":\"REJECT\"},\"consensus\":\"REJECTED\"}\n```";
      },
    };
    const transcript = [entry("[STRONG REJECT] — no", "Alex", "REJECT")];
    const bp = await extractBlueprint(jobFor(transcript), transcript, fencedLLM);
    expect(bp.consensus).toBe("REJECTED");
    expect(bp.verdicts["Alex"]).toBe("REJECT");
  });
});
