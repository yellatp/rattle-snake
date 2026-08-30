import {
  CONFIDENCE_WEIGHT,
  type AgentConfig,
  type Confidence,
  type DebatePhase,
  type Decision,
  type JobState,
  type SmeAnalysis,
  type TranscriptEntry,
  type Verdict,
} from "@rattlesnake/shared";
import { executeAgentTurn, type AgentTurn } from "./agentExecutor.js";
import type { LLMClient } from "../llm/client.js";

export interface DebateConfig {
  crossTalkRounds: number;
  agentMaxRetries: number;
  onEntry?: (entry: TranscriptEntry) => void | Promise<void>;
  /** Called for each 360-degree analysis produced during the opening round. */
  onAnalysis?: (analysis: SmeAnalysis) => void | Promise<void>;
  /** Called before each agent turn so the UI can show who is speaking now. */
  onActivity?: (phase: DebatePhase, activity: string) => void | Promise<void>;
  /** Called before each agent turn; throw here to abort the debate early. */
  shouldStop?: () => void;
  /** Target sector from JD metadata (renders the Sector Specialist persona). */
  sectorFocus?: string;
  /** True when a Sector Specialist seat sits on the panel. */
  hasSectorSpecialist?: boolean;
  /** Extra mandatory discussion topics forced by the panel rules. */
  forcedTopics?: string[];
}

export interface DebateResult {
  entries: TranscriptEntry[];
  consensus: Verdict;
  tallies: Record<Decision, number>;
  /** Agent -> cast decision (each agent's most recent vote). */
  ballot: Record<string, Decision>;
  /** Per-seat 360-degree analyses from the opening round, in seat order. */
  analyses: SmeAnalysis[];
}

/**
 * Multi-round committee debate engine.
 *
 *   Round 1  : openings — every agent, 360-degree analysis + opening argument
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
  const analyses: SmeAnalysis[] = [];
  const publish = async (entry: TranscriptEntry) => {
    transcript.push(entry);
    await config.onEntry?.(entry);
  };
  const stop = () => config.shouldStop?.();

  // Round 1 — openings (360-degree analysis + opening argument)
  for (const agent of agents) {
    stop();
    await config.onActivity?.(
      "opening",
      `${agent.name} (${agent.role}) is sharing their opening view on the candidate`,
    );
    const turn = await executeAgentTurn({
      llm,
      job: { ...job, transcript },
      agent,
      phase: "opening",
      maxRetries: config.agentMaxRetries,
      sectorFocus: config.sectorFocus,
      hasSectorSpecialist: config.hasSectorSpecialist,
      forcedTopics: config.forcedTopics,
    });
    if (turn.analysis) {
      analyses.push(turn.analysis);
      await config.onAnalysis?.(turn.analysis);
    }
    await publish(turn.entry);
  }

  // Cross-talk rounds (alternate agent order each pass for diversity)
  for (let round = 1; round <= config.crossTalkRounds; round++) {
    const order = round % 2 === 1 ? agents : [...agents].reverse();
    for (const agent of order) {
      stop();
      await config.onActivity?.(
        "crosstalk",
        `${agent.name} (${agent.role}) is sharing their view on the discussion so far`,
      );
      const turn = await executeAgentTurn({
        llm,
        job: { ...job, transcript },
        agent,
        phase: "crosstalk",
        crosstalkRound: round + 1,
        maxRetries: config.agentMaxRetries,
        sectorFocus: config.sectorFocus,
        hasSectorSpecialist: config.hasSectorSpecialist,
        forcedTopics: config.forcedTopics,
      });
      await publish(turn.entry);
    }
  }

  // Final ballot
  const ballotEntries: AgentTurn[] = [];
  for (const agent of agents) {
    stop();
    await config.onActivity?.(
      "ballot",
      `${agent.name} (${agent.role}) is casting their final vote`,
    );
    const turn = await executeAgentTurn({
      llm,
      job: { ...job, transcript },
      agent,
      phase: "ballot",
      maxRetries: config.agentMaxRetries,
      temperature: 0.2,
      sectorFocus: config.sectorFocus,
      hasSectorSpecialist: config.hasSectorSpecialist,
      forcedTopics: config.forcedTopics,
    });
    ballotEntries.push(turn);
  }
  for (const turn of ballotEntries) {
    await publish(turn.entry);
  }

  const votes = aggregateVotes(agents, transcript);
  return { ...votes, entries: transcript, analyses };
}

/**
 * Weighted consensus synthesis (confidence-aware).
 *   score = Σ(weight × CONFIDENCE_WEIGHT[confidence] of HIRE votes)
 *           / Σ(all weight × CONFIDENCE_WEIGHT[confidence])
 *   > 0.5 => SHORTLISTED, < 0.5 => REJECTED
 *   == 0.5 => tie broken by the highest-weight seat (the hiring manager).
 *
 * Entries without a stored confidence (legacy jobs / fixtures) count as High
 * (weight factor 1.0), preserving the pre-confidence weighting exactly.
 */
export function aggregateVotes(
  agents: AgentConfig[],
  transcript: TranscriptEntry[],
): { consensus: Verdict; tallies: Record<Decision, number>; ballot: Record<string, Decision> } {
  const ballot: Record<string, Decision> = {};
  const confidence: Record<string, Confidence> = {};
  for (const agent of agents) {
    const vote = latestVote(transcript, agent.name);
    if (vote) {
      ballot[agent.name] = vote.decision;
      confidence[agent.name] = vote.confidence;
    }
  }

  const weightOf = (agent: AgentConfig): number => {
    const base = agent.weight ?? 1;
    const factor = CONFIDENCE_WEIGHT[confidence[agent.name] ?? "High"];
    return base * factor;
  };

  const totalWeight = agents.reduce((acc, a) => acc + weightOf(a), 0);
  const hireWeight = agents.reduce(
    (acc, a) => acc + (ballot[a.name] === "HIRE" ? weightOf(a) : 0),
    0,
  );
  const rejectWeight = agents.reduce(
    (acc, a) => acc + (ballot[a.name] === "REJECT" ? weightOf(a) : 0),
    0,
  );

  let consensus: Verdict;
  if (hireWeight / totalWeight > 0.5) consensus = "SHORTLISTED";
  else if (rejectWeight / totalWeight > 0.5) consensus = "REJECTED";
  else {
    // Tie: defer to the hiring manager seat when present, else the highest
    // weighted seat (Phase 1 derived weights make this deterministic).
    const manager = agents.find((a) => a.kind === "manager");
    const tiebreak =
      manager ?? [...agents].sort((a, b) => (b.weight ?? 1) - (a.weight ?? 1))[0]!;
    consensus = ballot[tiebreak.name] === "HIRE" ? "SHORTLISTED" : "REJECTED";
  }

  return { consensus, tallies: { HIRE: hireWeight, REJECT: rejectWeight }, ballot };
}

function latestVote(
  transcript: TranscriptEntry[],
  sender: string,
): { decision: Decision; confidence: Confidence } | undefined {
  for (let i = transcript.length - 1; i >= 0; i--) {
    const entry = transcript[i];
    if (entry?.sender === sender && entry.decision) {
      return { decision: entry.decision, confidence: entry.confidence ?? "High" };
    }
  }
  return undefined;
}
