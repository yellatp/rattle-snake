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
      .mockResolvedValue("I remain unsure, maybe we proceed, not sure.");

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
