import {
  buildAgentSystemPrompt,
  smeAnalysisSchema,
  smeOpeningResponseSchema,
  type AgentConfig,
  type Confidence,
  type JobState,
  type SmeAnalysis,
  type TranscriptEntry,
} from "@rattlesnake/shared";
import type { LLMClient } from "../llm/client.js";
import {
  hasNeutralLanguage,
  parseConfidence,
  parseDecision,
  parseInflatedClaims,
} from "./nonNeutrality.js";
import type { Phase } from "@rattlesnake/shared";
import { sanitizeText } from "../resume/sanitize.js";

export interface AgentTurn {
  entry: TranscriptEntry;
  /** 360-degree analysis produced by an opening turn, when it parsed as JSON. */
  analysis?: SmeAnalysis;
}

export interface ExecuteAgentTurnOptions {
  llm: LLMClient;
  job: JobState;
  agent: AgentConfig;
  phase: Phase;
  crosstalkRound?: number;
  maxRetries: number;
  temperature?: number;
  /** Target sector from JD metadata (renders the Sector Specialist persona). */
  sectorFocus?: string;
  /** True when a Sector Specialist seat sits on the panel. */
  hasSectorSpecialist?: boolean;
  /** Extra mandatory discussion topics forced by the panel rules. */
  forcedTopics?: string[];
  /** Extra directive appended to the user message (e.g. a Director re-ballot). */
  instruction?: string;
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
 * Opening turns additionally carry a 360-degree candidate analysis: the LLM
 * returns one JSON object (analysis + opening prose + forced decision). When
 * the JSON parses cleanly, the analysis is surfaced on the turn and the prose
 * opening is kept as the transcript entry (no neutrality scan needed — the
 * decision came from the structured output). When JSON parsing fails, the
 * turn falls back to plain prose and the enforcement loop below applies.
 *
 * Enforcement loop (prose path):
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
  const {
    llm,
    job,
    agent,
    phase,
    crosstalkRound,
    maxRetries,
    temperature,
    sectorFocus,
    hasSectorSpecialist,
    forcedTopics,
  } = options;

  const system = buildAgentSystemPrompt(agent, {
    domain: job.domain,
    jobDescription: job.jobDescription,
    baseResume: job.baseResume,
    transcript: job.transcript,
    crosstalkRound,
    jobDecomposition: job.jobDecomposition,
    sectorFocus,
    hasSectorSpecialist,
    forcedTopics,
  }, phase);

  let user = buildUserMessage(phase, agent);
  if (options.instruction) {
    user = `${user}\n\nDIRECTOR RE-BALLOT DIRECTIVE:\n${options.instruction}`;
  }

  let text = await llm.complete(system, user, { temperature: temperature ?? 0.3 });

  let analysis: SmeAnalysis | undefined;
  let decision: "HIRE" | "REJECT" | undefined;
  let decisionReason: string | undefined;
  let confidence: Confidence | undefined;
  let inflatedClaims: string[] = [];

  if (phase === "opening") {
    const parsedOpening = parseOpeningResponse(text, agent);
    if (parsedOpening) {
      // Structured output is authoritative: the decision came from the JSON, so
      // the prose enforcement loop is unnecessary (its re-prompts ask for prose
      // verdict lines, which would corrupt the structured-opening flow).
      analysis = parsedOpening;
      text = parsedOpening.opening;
      decision = parsedOpening.decision;
      decisionReason = parsedOpening.decisionReason;
      confidence = parsedOpening.confidence ?? parseConfidence(parsedOpening.opening);
      inflatedClaims = parsedOpening.inflatedClaims ?? [];
    } else {
      // Fallback: the LLM returned JSON that didn't fully match the schema
      // (e.g. deepseek). Extract the opening prose so the transcript doesn't
      // display raw JSON.
      try {
        const raw = JSON.parse(stripCodeFences(text));
        if (raw && typeof raw.opening === "string") {
          text = raw.opening;
        }
        // Extract decision/reason from JSON fields even when schema validation failed
        if (raw && typeof raw.decision === "string" && (raw.decision === "HIRE" || raw.decision === "REJECT")) {
          decision = raw.decision;
          decisionReason = typeof raw.decisionReason === "string" ? raw.decisionReason : undefined;
          if (typeof raw.pivotFactor === "string") {
            inflatedClaims = parseInflatedClaims(raw.opening ?? "");
          }
        }
      } catch {
        // Not valid JSON — prose enforcement path handles it below.
      }
    }
  }

  // Prose enforcement path (openings that did not parse as JSON, cross-talk,
  // and ballots): re-prompt until the response carries a forced verdict.
  if (!decision) {
    let parsed = parseDecision(text);
    decision = parsed?.decision;
    decisionReason = parsed?.reason;
    confidence = parseConfidence(text);
    inflatedClaims = parseInflatedClaims(text);

    let retries = 0;
    while (retries < maxRetries && (!decision || hasNeutralLanguage(text))) {
      retries += 1;
      text = await llm.complete(system, `${user}\n\n${REDRESS_PROMPT}`, {
        temperature: 0.2,
      });
      parsed = parseDecision(text);
      if (!decision) decision = parsed?.decision;
      if (!decisionReason) decisionReason = parsed?.reason;
      confidence = parseConfidence(text);
      inflatedClaims = [...inflatedClaims, ...parseInflatedClaims(text)];
    }

    if (!decision) {
      decision = lastVote(job.transcript, agent.name) ?? "REJECT";
      decisionReason =
        "Agent failed to emit a forced verdict after retries; inherited previous stance.";
    }
  }

  if (analysis && !analysis.confidence) {
    analysis = { ...analysis, confidence: confidence ?? "Medium" };
  }
  if (analysis && analysis.inflatedClaims?.length === 0 && inflatedClaims.length > 0) {
    analysis = { ...analysis, inflatedClaims };
  }

  return {
    entry: {
      id: randomId(),
      sender: agent.name,
      role: agent.role,
      round: phase === "ballot" ? "ballot" : (crosstalkRound ?? 1),
      text: sanitizeText(text),
      decision,
      decisionReason: decisionReason ? sanitizeText(decisionReason) : undefined,
      confidence,
      createdAt: new Date().toISOString(),
    },
    ...(analysis ? { analysis } : {}),
  };
}

/**
 * Parse the opening turn's structured 360-degree response. Returns null when
 * the model did not produce valid JSON matching the expected shape (the caller
 * then falls back to the prose enforcement path).
 */
export function parseOpeningResponse(
  text: string,
  agent: AgentConfig,
): (SmeAnalysis & { opening: string }) | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFences(text));
  } catch {
    return null;
  }
  const validated = smeOpeningResponseSchema.safeParse(parsed);
  if (!validated.success) return null;

  const analysisValidated = smeAnalysisSchema.safeParse({
    seat: agent.name,
    role: agent.role,
    ...validated.data.analysis,
    decision: validated.data.decision,
    decisionReason: validated.data.decisionReason,
    pivotFactor: validated.data.pivotFactor,
  });
  if (!analysisValidated.success) return null;

  return {
    ...analysisValidated.data,
    opening: validated.data.opening,
  };
}

function stripCodeFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "");
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
