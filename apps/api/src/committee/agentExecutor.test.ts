import { describe, expect, it, vi } from "vitest";
import type { JobState, TranscriptEntry } from "@rattlesnake/shared";
import type { LLMClient } from "../llm/client.js";
import { executeAgentTurn } from "./agentExecutor.js";
import { getCommitteeForDomain } from "@rattlesnake/shared";

function jobWith(transcript: TranscriptEntry[] = []): JobState {
  return {
    id: "job-agent",
    domain: "SWE",
    jobDescription: "A long enough job description for testing purposes.",
    baseResume: "A long enough base resume for testing purposes.",
    transcript,
    status: "debating",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function openingJson(opening: string): string {
  return JSON.stringify({
    analysis: {
      fitScore: 8,
      factors: [
        { factor: "Experience", score: 5, note: "matches the target level" },
        { factor: "Education", score: 4, note: "supports the bar" },
        { factor: "Technical Skills", score: 5, note: "exact JD stack" },
        { factor: "Projects & Real-Time Experience", score: 4, note: "production evidence" },
        { factor: "Domain Knowledge", score: 4, note: "recent coverage" },
        { factor: "Sector Knowledge", score: 3, note: "transferable" },
        { factor: "Product Thinking & Problem Solving", score: 4, note: "concrete trade-offs" },
        { factor: "Role-Specific Signals", score: 4, note: "ownership signals" },
      ],
      strengths: ["strong keyword alignment", "metric-dense history"],
      concerns: ["thin metric density", "unexplained scope gaps"],
    },
    opening,
    decision: "HIRE",
    decisionReason: "the evidence outweighs the concerns",
    pivotFactor: "metric density",
  });
}

describe("executeAgentTurn — non-neutrality enforcement", () => {
  const agent = getCommitteeForDomain("SWE")[1]!; // Alex, Staff Architect

  it("accepts a compliant response on the first attempt (no retries)", async () => {
    const llm: LLMClient = {
      provider: "stub",
      model: "stub",
      async complete() {
        return `[STRONG POSITIVES]\n- evidence\n[HIGH-RISK CONCERNS]\n- gap\n[PIVOT POINT]\n- evidence wins\n[VERDICT]\n[STRONG HIRE] — the evidence supports it`;
      },
    };
    const turn = await executeAgentTurn({
      llm,
      job: jobWith(),
      agent,
      phase: "opening",
      maxRetries: 2,
    });
    expect(turn.entry.decision).toBe("HIRE");
    expect(turn.entry.text).toContain("[STRONG HIRE]");
  });

  it("re-prompts (redress) when the response is neutral, then enforces a verdict", async () => {
    const complete = vi
      .fn<LLMClient["complete"]>()
      .mockResolvedValueOnce("A decent candidate overall, could go either way.")
      .mockResolvedValueOnce("[STRONG REJECT] — critical gaps remain.");

    const turn = await executeAgentTurn({
      llm: { provider: "stub", model: "stub", complete },
      job: jobWith(),
      agent,
      phase: "crosstalk",
      crosstalkRound: 2,
      maxRetries: 2,
    });
    expect(complete).toHaveBeenCalledTimes(2);
    expect(turn.entry.decision).toBe("REJECT");
  });

  it("falls back to the agent's prior vote when it keeps refusing", async () => {
    const complete = vi
      .fn<LLMClient["complete"]>()
      .mockResolvedValue("I remain unsure, maybe yes, maybe no, hard to say.");

    const prior = {
      id: "prior-1",
      sender: agent.name,
      role: agent.role,
      round: 1,
      text: "[VERDICT]\n[STRONG HIRE] — earlier",
      decision: "HIRE" as const,
      createdAt: new Date().toISOString(),
    };

    const turn = await executeAgentTurn({
      llm: { provider: "stub", model: "stub", complete },
      job: jobWith([prior]),
      agent,
      phase: "ballot",
      maxRetries: 2,
    });
    expect(turn.entry.decision).toBe("HIRE");
    expect(turn.entry.decisionReason).toContain("inherited previous stance");
  });

  it("defaults to REJECT when the agent has no prior vote and keeps refusing", async () => {
    const complete = vi.fn<LLMClient["complete"]>().mockResolvedValue("On the fence, undecided.");
    const turn = await executeAgentTurn({
      llm: { provider: "stub", model: "stub", complete },
      job: jobWith(),
      agent,
      phase: "ballot",
      maxRetries: 1,
    });
    expect(turn.entry.decision).toBe("REJECT");
  });
});

describe("executeAgentTurn — opening 360-degree analysis", () => {
  const agent = getCommitteeForDomain("SWE")[1]!; // Alex, Staff Architect

  it("parses a JSON opening into a structured analysis + prose entry", async () => {
    const complete = vi.fn<LLMClient["complete"]>().mockResolvedValue(
      openingJson("[STRONG POSITIVES]\n- strong evidence\n[VERDICT]\n[STRONG HIRE] — yes"),
    );

    const turn = await executeAgentTurn({
      llm: { provider: "stub", model: "stub", complete },
      job: jobWith(),
      agent,
      phase: "opening",
      maxRetries: 2,
    });

    expect(complete).toHaveBeenCalledTimes(1);
    expect(turn.analysis).toBeDefined();
    expect(turn.analysis!.fitScore).toBe(8);
    expect(turn.analysis!.factors).toHaveLength(8);
    expect(turn.analysis!.decision).toBe("HIRE");
    expect(turn.analysis!.seat).toBe(agent.name);
    expect(turn.analysis!.role).toBe(agent.role);
    // The transcript entry holds the prose opening, not the raw JSON.
    expect(turn.entry.text).toContain("[STRONG HIRE]");
    expect(turn.entry.text).not.toContain("fitScore");
    expect(turn.entry.decision).toBe("HIRE");
    expect(turn.entry.decisionReason).toBe("the evidence outweighs the concerns");
  });

  it("skips the neutrality re-prompt when the decision came from structured JSON", async () => {
    // The prose can read as hedged, but the structured decision is decisive.
    const complete = vi.fn<LLMClient["complete"]>().mockResolvedValue(
      openingJson("The candidate is average but the evidence could go either way."),
    );

    const turn = await executeAgentTurn({
      llm: { provider: "stub", model: "stub", complete },
      job: jobWith(),
      agent,
      phase: "opening",
      maxRetries: 2,
    });

    expect(complete).toHaveBeenCalledTimes(1);
    expect(turn.analysis).toBeDefined();
    expect(turn.entry.decision).toBe("HIRE");
  });

  it("falls back to the prose enforcement path when the opening is not valid JSON", async () => {
    const complete = vi
      .fn<LLMClient["complete"]>()
      .mockResolvedValueOnce("Opening prose without any decision marker.")
      .mockResolvedValueOnce("[STRONG REJECT] — evidence does not support the role.");

    const turn = await executeAgentTurn({
      llm: { provider: "stub", model: "stub", complete },
      job: jobWith(),
      agent,
      phase: "opening",
      maxRetries: 2,
    });

    expect(complete).toHaveBeenCalledTimes(2);
    expect(turn.analysis).toBeUndefined();
    expect(turn.entry.decision).toBe("REJECT");
  });
});
