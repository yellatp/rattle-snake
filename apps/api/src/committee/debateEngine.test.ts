import { describe, expect, it } from "vitest";
import type { AgentConfig, Confidence, Decision, JobState, TranscriptEntry } from "@rattlesnake/shared";
import { getCommitteeForDomain } from "@rattlesnake/shared";
import { aggregateVotes, runDebate } from "./debateEngine.js";
import { createMockClient } from "../llm/client.js";

function entry(sender: string, decision: Decision, confidence?: Confidence): TranscriptEntry {
  return {
    id: `${sender}-${decision}-${Math.random().toString(36).slice(2)}`,
    sender,
    role: "role",
    round: "ballot",
    text: `[VERDICT]\n[STRONG ${decision}] — test`,
    decision,
    decisionReason: "test",
    confidence: confidence ?? "High",
    createdAt: new Date().toISOString(),
  };
}

function agentsWithWeights(weights: number[]): AgentConfig[] {
  return weights.map((weight, i) => ({
    name: `Agent${i}`,
    role: `Role${i}`,
    focus: `Focus${i}`,
    domain: "SDE" as const,
    weight,
  }));
}

function jobFor(transcript: TranscriptEntry[]): JobState {
  return {
    id: "job-test",
    domain: "SDE",
    jobDescription: "A long enough job description for testing purposes.",
    baseResume: "A long enough base resume for testing purposes.",
    transcript,
    status: "debating",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe("aggregateVotes — weighted consensus", () => {
  it("SHORTLISTED when hire weight share exceeds 0.5", () => {
    const agents = agentsWithWeights([0.8, 1.2, 1.0, 1.2, 1.0]); // total 5.2
    const transcript = [
      entry("Agent0", "HIRE"),   // 0.8
      entry("Agent1", "REJECT"), // 1.2
      entry("Agent2", "HIRE"),   // 1.0
      entry("Agent3", "HIRE"),   // 1.2
      entry("Agent4", "REJECT"), // 1.0
    ]; // hire = 3.0 / 5.2 ≈ 0.577
    const { consensus, tallies } = aggregateVotes(agents, transcript);
    expect(consensus).toBe("SHORTLISTED");
    expect(tallies.HIRE).toBeCloseTo(3.0);
    expect(tallies.REJECT).toBeCloseTo(2.2);
  });

  it("REJECTED when hire weight share is below 0.5", () => {
    const agents = agentsWithWeights([0.8, 1.2, 1.0, 1.2, 1.0]);
    const transcript = [
      entry("Agent0", "REJECT"), // 0.8
      entry("Agent1", "HIRE"),   // 1.2
      entry("Agent2", "REJECT"), // 1.0
      entry("Agent3", "REJECT"), // 1.2
      entry("Agent4", "HIRE"),   // 1.0
    ]; // hire = 2.2 / 5.2 ≈ 0.423
    expect(aggregateVotes(agents, transcript).consensus).toBe("REJECTED");
  });

  it("breaks an exact 0.5 tie by the highest-weight seat's vote", () => {
    const agents = agentsWithWeights([0.5, 0.5, 1.0, 1.0, 2.0]); // total 5.0
    // Hire = 2.0 (Agent4) + 0.5 (Agent0) = 2.5 ; Reject = 1.0 + 1.0 + 0.5 = 2.5
    const transcript = [
      entry("Agent0", "HIRE"),
      entry("Agent1", "REJECT"),
      entry("Agent2", "REJECT"),
      entry("Agent3", "REJECT"),
      entry("Agent4", "HIRE"),
    ];
    expect(aggregateVotes(agents, transcript).consensus).toBe("SHORTLISTED");

    // Flip the highest-weight seat -> verdict flips.
    const flipped = [
      entry("Agent0", "HIRE"),
      entry("Agent1", "REJECT"),
      entry("Agent2", "REJECT"),
      entry("Agent3", "REJECT"),
      entry("Agent4", "REJECT"),
    ];
    expect(aggregateVotes(agents, flipped).consensus).toBe("REJECTED");
  });

  it("uses each agent's most recent decision only", () => {
    const agents = agentsWithWeights([1, 1, 1, 1, 1]);
    const transcript = [
      entry("Agent0", "REJECT"),
      entry("Agent0", "HIRE"), // latest vote wins
      entry("Agent1", "REJECT"),
      entry("Agent2", "REJECT"),
      entry("Agent3", "REJECT"),
      entry("Agent4", "REJECT"),
    ];
    expect(aggregateVotes(agents, transcript).consensus).toBe("REJECTED");
  });

  it("scales each vote by the seat's stated confidence", () => {
    const agents = agentsWithWeights([1, 1]);
    // HIRE at High (1.0) vs REJECT at Low (0.4): hire share = 1.0/1.4 ≈ 0.714.
    const transcript = [entry("Agent0", "HIRE", "High"), entry("Agent1", "REJECT", "Low")];
    const { consensus, tallies } = aggregateVotes(agents, transcript);
    expect(consensus).toBe("SHORTLISTED");
    expect(tallies.HIRE).toBeCloseTo(1.0);
    expect(tallies.REJECT).toBeCloseTo(0.4);
  });

  it("lets confidence flip the verdict against the numerically stronger seat", () => {
    const agents = agentsWithWeights([0.5, 1.0]);
    // Numerically: REJECT 1.0 vs HIRE 0.5 -> reject share 0.667 -> REJECTED.
    // With confidence: the strong seat's REJECT is Low (0.4 -> 0.4), the weak
    // seat's HIRE is High (1.0 -> 0.5): hire share 0.5/0.9 ≈ 0.556 -> SHORTLISTED.
    const transcript = [entry("Agent0", "HIRE", "High"), entry("Agent1", "REJECT", "Low")];
    const { consensus, tallies } = aggregateVotes(agents, transcript);
    expect(consensus).toBe("SHORTLISTED");
    expect(tallies.HIRE).toBeCloseTo(0.5);
    expect(tallies.REJECT).toBeCloseTo(0.4);
  });
});

describe("runDebate — full pipeline with mock LLM", () => {
  it("runs openings → cross-talk → ballot and produces all entries, all decisive", async () => {
    const agents = getCommitteeForDomain("SDE");
    const job = jobFor([]);
    const result = await runDebate(job, agents, createMockClient(), {
      crossTalkRounds: 2,
      agentMaxRetries: 2,
    });

    // 6 openings + 2 cross-talk passes of 6 + 6 ballot votes.
    expect(result.entries).toHaveLength(agents.length * (2 + 2));

    const openings = result.entries.filter((e) => e.round === 1);
    const crosstalk = result.entries.filter((e) => typeof e.round === "number" && e.round >= 2);
    const ballot = result.entries.filter((e) => e.round === "ballot");

    expect(openings).toHaveLength(agents.length);
    expect(crosstalk).toHaveLength(agents.length * 2);
    expect(ballot).toHaveLength(agents.length);

    for (const entry of result.entries) {
      expect(entry.decision).toBeTruthy();
      expect(entry.decision).toMatch(/^(HIRE|REJECT)$/);
      expect(entry.text).toMatch(/\[STRONG (HIRE|REJECT)\]/);
    }

    expect(Object.keys(result.ballot).sort()).toEqual(agents.map((a) => a.name).sort());
  });

  it("alternates agent order between cross-talk passes", async () => {
    const agents = getCommitteeForDomain("SDE");
    const job = jobFor([]);
    const result = await runDebate(job, agents, createMockClient(), {
      crossTalkRounds: 2,
      agentMaxRetries: 0,
    });
    const rounds = result.entries.filter((e) => typeof e.round === "number" && e.round >= 2);
    const firstPass = rounds.slice(0, agents.length).map((e) => e.sender);
    const secondPass = rounds
      .slice(agents.length, 2 * agents.length)
      .map((e) => e.sender);
    expect(firstPass).toEqual(agents.map((a) => a.name));
    expect(secondPass).toEqual([...agents.map((a) => a.name)].reverse());
  });

  it("reports who is speaking before each agent turn", async () => {
    const agents = getCommitteeForDomain("SDE");
    const job = jobFor([]);
    const activity: string[] = [];
    await runDebate(job, agents, createMockClient(), {
      crossTalkRounds: 1,
      agentMaxRetries: 0,
      onActivity: (_phase, line) => {
        activity.push(line);
      },
    });
    expect(activity.length).toBe(agents.length * (1 + 1 + 1)); // opening + crosstalk + ballot
    expect(activity[0]).toContain(agents[0]!.name);
    expect(activity[0]).toContain("opening view");
    expect(activity[agents.length]).toContain("discussion so far");
    expect(activity[2 * agents.length]).toContain("final vote");
  });

  it("aborts early when shouldStop throws", async () => {
    const agents = getCommitteeForDomain("SDE");
    const job = jobFor([]);
    let turns = 0;
    await expect(
      runDebate(job, agents, createMockClient(), {
        crossTalkRounds: 2,
        agentMaxRetries: 0,
        shouldStop: () => {
          turns++;
          if (turns > 1) throw new Error("stop!");
        },
      }),
    ).rejects.toThrow("stop!");
    expect(turns).toBeLessThanOrEqual(2);
  });
});
