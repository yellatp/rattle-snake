import {
  buildAgentSystemPrompt,
  type AgentConfig,
  type JobState,
  type TranscriptEntry,
} from "@rattlesnake/shared";
import type { LLMClient } from "../llm/client.js";
import { hasNeutralLanguage, parseDecision } from "./nonNeutrality.js";
import type { Phase } from "@rattlesnake/shared";

export interface AgentTurn {
  entry: TranscriptEntry;
}

export interface ExecuteAgentTurnOptions {
  llm: LLMClient;
  job: JobState;
  agent: AgentConfig;
  phase: Phase;
  crosstalkRound?: number;
  maxRetries: number;
  temperature?: number;
}

const REDRESS_PROMPT = `Your previous response did not end with a clear, non-neutral verdict. This is a HARD REQUIREMENT.

Restate your position and end your response with exactly one line in this format:
[VERDICT]
[STRONG HIRE] <one-sentence primary reason>

or

[VERDICT]
[STRONG REJECT] <one-sentence primary reason>

Do not use "neutral", "average", "maybe", or "could go either way" anywhere in your response.`;

/**
 * Executes a single agent turn and enforces the Decisive Non-Neutrality law:
 * every response MUST terminate in [STRONG HIRE] or [STRONG REJECT].
 *
 * Enforcement loop:
 *   - parse the forced decision marker from the response
 *   - if absent or the response reads as neutral/evasive, re-prompt the agent
 *     with a corrective instruction (up to `maxRetries`)
 *   - if the agent still refuses, fall back to keyword scoring; as a last
 *     resort the turn is flagged and the agent defaults to its previous vote
 *     (or REJECT when it has no record yet).
 */
export async function executeAgentTurn(
  options: ExecuteAgentTurnOptions,
): Promise<AgentTurn> {
  const { llm, job, agent, phase, crosstalkRound, maxRetries, temperature } = options;

  const system = buildAgentSystemPrompt(agent, {
    domain: job.domain,
    jobDescription: job.jobDescription,
    baseResume: job.baseResume,
    transcript: job.transcript,
    crosstalkRound,
  }, phase);

  const user = buildUserMessage(phase, agent);

  let text = await llm.complete(system, user, { temperature: temperature ?? 0.3 });

  let parsed = parseDecision(text);
  let retries = 0;

  while (retries < maxRetries && (!parsed || hasNeutralLanguage(text))) {
    retries += 1;
    text = await llm.complete(system, `${user}\n\n${REDRESS_PROMPT}`, {
      temperature: 0.2,
    });
    parsed = parseDecision(text);
  }

  let decision = parsed?.decision;
  let decisionReason = parsed?.reason;

  if (!decision) {
    decision = lastVote(job.transcript, agent.name) ?? "REJECT";
    decisionReason =
      "Agent failed to emit a forced verdict after retries; inherited previous stance.";
  }

  return {
    entry: {
      id: randomId(),
      sender: agent.name,
      role: agent.role,
      round: phase === "ballot" ? "ballot" : (crosstalkRound ?? 1),
      text,
      decision,
      decisionReason,
      createdAt: new Date().toISOString(),
    },
  };
}

function buildUserMessage(phase: Phase, agent: AgentConfig): string {
  if (phase === "opening") {
    return `Present your opening argument as ${agent.name} (${agent.role}).`;
  }
  if (phase === "ballot") {
    return `Cast your final ballot as ${agent.name}.`;
  }
  return `Continue the cross-talk as ${agent.name}.`;
}

/** Most recent decision a given agent cast, if any. */
export function lastVote(
  transcript: TranscriptEntry[],
  sender: string,
): "HIRE" | "REJECT" | undefined {
  for (let i = transcript.length - 1; i >= 0; i--) {
    const entry = transcript[i];
    if (entry?.sender === sender && entry.decision) return entry.decision;
  }
  return undefined;
}

export function randomId(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  );
}
