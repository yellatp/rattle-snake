/**
 * Core domain model for the Rattle-Snake V2 hiring committee.
 *
 * A "job" is one isolated candidate evaluation: one JD + one base resume
 * evaluated by a 5-member domain committee through a multi-round debate.
 */

export type Domain = "SWE" | "DATA_AI" | "FINANCE";

export const DOMAINS: readonly Domain[] = ["SWE", "DATA_AI", "FINANCE"] as const;

/** Forced non-neutral verdict cast by a single agent. */
export type Decision = "HIRE" | "REJECT";

/** Consensus outcome across the committee. */
export type Verdict = "SHORTLISTED" | "REJECTED";

export type JobStatus =
  | "pending"
  | "debating"
  | "rewriting"
  | "completed"
  | "failed";

/**
 * Pure-data description of one committee persona.
 *
 * Agents are data + prompt functions. No class holds memory — everything
 * lives in the shared JobState transcript.
 */
export interface AgentConfig {
  name: string;
  role: string;
  /** The lens this persona evaluates through (shown in prompts + UI). */
  focus: string;
  domain: Domain;
  /** Marks the Sector/Domain Transferability Specialist (5th seat). */
  isSectorSpecialist?: boolean;
  /** Ballot weight for the weighted consensus. Defaults to 1. */
  weight?: number;
  /** Short persona color/shade shown in the UI transcript. */
  tone?: string;
}

export interface TranscriptEntry {
  id: string;
  sender: string;
  role: string;
  /** 1 = opening, 2+ = cross-talk rounds, "ballot" = final vote pass. */
  round: number | "ballot";
  text: string;
  decision?: Decision;
  decisionReason?: string;
  createdAt: string;
}

/** Structured feedback blueprint extracted from the debate. */
export interface Blueprint {
  objections: string[];
  strengths: string[];
  requiredChanges: string[];
  sectorNotes: string[];
  pivotFactors: string[];
  /** agentName -> cast decision */
  verdicts: Record<string, Decision>;
  consensus: Verdict;
}

export interface JobState {
  id: string;
  domain: Domain;
  jobDescription: string;
  baseResume: string;
  /** Optional override for the sector specialist persona. */
  sectorFocus?: string;
  transcript: TranscriptEntry[];
  finalVerdict?: Verdict;
  blueprint?: Blueprint;
  rewrittenResume?: string;
  /** Non-secret record of which provider/model actually ran this evaluation. */
  llmUsed?: { provider: string; model: string };
  status: JobStatus;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

/** Event pushed to SSE subscribers during a live debate. */
export type JobEvent =
  | { type: "status"; jobId: string; status: JobStatus; message?: string }
  | { type: "entry"; jobId: string; entry: TranscriptEntry }
  | { type: "verdict"; jobId: string; verdict: Verdict; tallies: Record<string, number> }
  | { type: "blueprint"; jobId: string; blueprint: Blueprint }
  | { type: "resume"; jobId: string; rewrittenResume: string }
  | { type: "done"; jobId: string; job: JobState }
  | { type: "error"; jobId: string; message: string };
