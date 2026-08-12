import type { AgentConfig, Decision, JobState, TranscriptEntry, Verdict } from "@rattlesnake/shared";
import { executeAgentTurn, type AgentTurn } from "./agentExecutor.js";
import type { LLMClient } from "../llm/client.js";

export interface DebateConfig {
  crossTalkRounds: number;
  agentMaxRetries: number;
  onEntry?: (entry: TranscriptEntry) => void | Promise<void>;
}

export interface DebateResult {
  entries: TranscriptEntry[];
  consensus: Verdict;
  tallies: Record<Decision, number>;
  /** Agent -> cast decision (each agent's most recent vote). */
  ballot: Record<string, Decision>;
}

/**
 * Multi-round committee debate engine.
 *
 *   Round 1  : opening arguments — every agent, full analysis + forced verdict
 *   Round 2+ : cross-talk — agents rebut/agree with named colleagues, 2 passes
 *   Final    : ballot — each agent casts a short, decisive final vote
 *
 * One isolated JobState per candidate evaluation; agents are stateless.
 */
export async function runDebate(
  job: JobState,
  agents: AgentConfig[],
  llm: LLMClient,
  config: DebateConfig,
): Promise<DebateResult> {
  const transcript: TranscriptEntry[] = [...job.transcript];
  const publish = async (entry: TranscriptEntry) => {
    transcript.push(entry);
    await config.onEntry?.(entry);
  };

  // Round 1 — openings
  for (const agent of agents) {
    const turn = await executeAgentTurn({
      llm,
      job: { ...job, transcript },
      agent,
      phase: "opening",
      maxRetries: config.agentMaxRetries,
    });
    await publish(turn.entry);
  }

  // Cross-talk rounds (alternate agent order each pass for diversity)
  for (let round = 1; round <= config.crossTalkRounds; round++) {
    const order = round % 2 === 1 ? agents : [...agents].reverse();
    for (const agent of order) {
      const turn = await executeAgentTurn({
        llm,
        job: { ...job, transcript },
        agent,
        phase: "crosstalk",
        crosstalkRound: round + 1,
        maxRetries: config.agentMaxRetries,
      });
      await publish(turn.entry);
    }
  }

  // Final ballot
  const ballotEntries: AgentTurn[] = [];
  for (const agent of agents) {
    const turn = await executeAgentTurn({
      llm,
      job: { ...job, transcript },
      agent,
      phase: "ballot",
      maxRetries: config.agentMaxRetries,
      temperature: 0.2,
    });
    ballotEntries.push(turn);
  }
  for (const turn of ballotEntries) {
    await publish(turn.entry);
  }

  const votes = aggregateVotes(agents, transcript);
  return { ...votes, entries: transcript };
}

/**
 * Weighted consensus synthesis.
 *   score = Σ(weight of HIRE votes) / Σ(all weights)
 *   > 0.5 => SHORTLISTED, < 0.5 => REJECTED
 *   == 0.5 => tie broken by the highest-weight seat (the hiring manager).
 */
export function aggregateVotes(
  agents: AgentConfig[],
  transcript: TranscriptEntry[],
): { consensus: Verdict; tallies: Record<Decision, number>; ballot: Record<string, Decision> } {
  const ballot: Record<string, Decision> = {};
  for (const agent of agents) {
    const vote = latestDecision(transcript, agent.name);
    if (vote) ballot[agent.name] = vote;
  }

  const totalWeight = agents.reduce((acc, a) => acc + (a.weight ?? 1), 0);
  const hireWeight = agents.reduce(
    (acc, a) => acc + (ballot[a.name] === "HIRE" ? (a.weight ?? 1) : 0),
    0,
  );
  const rejectWeight = agents.reduce(
    (acc, a) => acc + (ballot[a.name] === "REJECT" ? (a.weight ?? 1) : 0),
    0,
  );

  let consensus: Verdict;
  if (hireWeight / totalWeight > 0.5) consensus = "SHORTLISTED";
  else if (rejectWeight / totalWeight > 0.5) consensus = "REJECTED";
  else {
    const tiebreak = [...agents].sort((a, b) => (b.weight ?? 1) - (a.weight ?? 1))[0]!;
    consensus = ballot[tiebreak.name] === "HIRE" ? "SHORTLISTED" : "REJECTED";
  }

  return { consensus, tallies: { HIRE: hireWeight, REJECT: rejectWeight }, ballot };
}

function latestDecision(
  transcript: TranscriptEntry[],
  sender: string,
): Decision | undefined {
  for (let i = transcript.length - 1; i >= 0; i--) {
    const entry = transcript[i];
    if (entry?.sender === sender && entry.decision) return entry.decision;
  }
  return undefined;
}
