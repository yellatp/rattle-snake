import type { AgentConfig, Domain, TranscriptEntry } from "./types.js";

/** Phase of the debate an agent turn belongs to. */
export type Phase = "opening" | "crosstalk" | "ballot";

export interface PromptContext {
  domain: Domain;
  jobDescription: string;
  baseResume: string;
  transcript: TranscriptEntry[];
  /** Round number for cross-talk (1-based). */
  crosstalkRound?: number;
}

/** Render a transcript into the compact shared log included in prompts. */
export function formatTranscript(transcript: TranscriptEntry[]): string {
  if (transcript.length === 0) return "No prior statements — you are opening the debate.";
  return transcript
    .map(
      (e) =>
        `[${e.sender} (${e.role}) — Round ${e.round}]${e.decision ? ` <${e.decision}>` : ""}:\n${e.text}`,
    )
    .join("\n\n");
}

/**
 * Builds the system prompt for one agent turn.
 *
 * Implements the "Decisive Non-Neutrality" framework:
 *   Phase A — steel-man BOTH sides (top 2 hire + top 2 reject reasons)
 *   Phase B — forced pivot point (the single factor that tipped the decision)
 *   Phase C — unambiguous verdict ([STRONG HIRE] | [STRONG REJECT])
 */
export function buildAgentSystemPrompt(
  agent: AgentConfig,
  ctx: PromptContext,
  phase: Phase,
): string {
  const sectorBlock = agent.isSectorSpecialist
    ? `\n5. SECTOR & TRANSFERABILITY MANDATE: You are the Sector Specialist. You MUST explicitly assess:\n   - Industry fit: does the candidate's experience map to the target sector's protocols, compliance, and stack?\n   - Transferable skills: identify 1-2 prior-sector skills that translate to the target sector, AND 1-2 gaps that would require ramp-up.\n   Example: "Their high-concurrency e-commerce event processing translates to real-time patient telemetry, but they lack explicit HIPAA compliance context."\n   Do not be swayed by generic praise — concrete domain evidence or a clear transfer argument is required.`
    : "";

  const phaseBlock =
    phase === "opening"
      ? `PHASE — ROUND 1 OPENING ARGUMENT: Deliver your full initial assessment of the candidate against the job description.`
      : phase === "crosstalk"
        ? `PHASE — ROUND ${ctx.crosstalkRound ?? 2} CROSS-TALK: You are now responding to your colleagues' statements in the transcript. Challenge or explicitly agree with at least one named colleague. Re-examine your position in light of evidence others surfaced. Do not repeat your opening verbatim.`
        : `PHASE — FINAL BALLOT: Cast your final vote. Be brief (3-6 sentences). No new arguments — only weigh what the debate surfaced, reaffirm or flip your position with one concrete reason, and vote.`;

  return `You are ${agent.name}, acting as the ${agent.role} on the hiring committee.

IDENTITY & CONTEXT:
Domain Focus: ${agent.focus}
Evaluation Style: Sharp, analytical, empathetic yet uncompromising on standards.

JOB DESCRIPTION (target domain: ${ctx.domain}):
${ctx.jobDescription}

CANDIDATE BASE RESUME:
${ctx.baseResume}

COMMITTEE TRANSCRIPT SO FAR:
${formatTranscript(ctx.transcript)}

${phaseBlock}

CRITICAL ENGAGEMENT LAWS (non-negotiable):
1. NO NEUTRALITY ALLOWED: You are strictly forbidden from giving "neutral", "average", or "maybe" verdicts. You must end your evaluation with either [STRONG HIRE] or [STRONG REJECT].
2. BALANCED EVALUATION REQUIRED: Before deciding, you MUST evaluate both sides:
   - Identify the candidate's strongest evidence of capability (Steel-man the Hire case) — list your TOP 2 hire reasons.
   - Identify the candidate's highest-risk weaknesses or omissions (Steel-man the Reject case) — list your TOP 2 reject reasons.
3. THE PIVOT POINT: After stating both sides, explicitly declare which single factor tipped your decision to one side.
4. DEBATE ENGAGEMENT: Address fellow committee members by name, directly challenging or agreeing with their prior statements in the transcript.${sectorBlock}

OUTPUT FORMAT (strict):
[STRONG POSITIVES]
- top 2 hire reasons, concrete and evidence-based

[HIGH-RISK CONCERNS]
- top 2 reject reasons / skeptical areas

[DEBATE RESPONSE]
- address named colleague(s)${sectorBlock ? "\n\n[SECTOR & TRANSFERABILITY]\n- domain-fit assessment and transferable-skills mapping (Sector Specialist only)" : ""}

[PIVOT POINT]
- the single factor that decided you

[VERDICT]
[STRONG HIRE] or [STRONG REJECT] — followed by your primary reason in one sentence.`;
}

/** Synthesis prompt: convert the full debate into a structured hiring blueprint. */
export function buildBlueprintPrompt(
  job: { jobDescription: string; baseResume: string; domain: Domain },
  transcript: TranscriptEntry[],
): string {
  return `You are the Hiring Committee Scribe. Convert the complete debate transcript into a structured, action-oriented blueprint for a resume rewrite.

JOB DESCRIPTION (${job.domain}):
${job.jobDescription}

CANDIDATE BASE RESUME:
${job.baseResume}

FULL DEBATE TRANSCRIPT:
${formatTranscript(transcript)}

TASK:
Produce the blueprint as JSON matching EXACTLY this schema (no markdown fences, no prose):
{
  "objections": [string, ...],           // every concrete objection raised, deduplicated, ordered by severity
  "strengths": [string, ...],            // evidence-backed strengths the committee agreed on
  "requiredChanges": [string, ...],      // specific resume edits that resolve the objections
  "sectorNotes": [string, ...],          // Sector Specialist verdicts on industry fit / transferable skills
  "pivotFactors": [string, ...],         // the deciding factors agents cited
  "verdicts": { "<AgentName>": "HIRE" | "REJECT", ... },
  "consensus": "SHORTLISTED" | "REJECTED"
}

Rules: derive verdicts ONLY from the [VERDICT]/[STRONG HIRE]/[STRONG REJECT] markers in each agent's turn. Each objection must map to at least one required change.`;
}

/** Synthesis prompt: rewrite the resume so every committee objection is resolved. */
export function buildResumeRewriterPrompt(
  job: { jobDescription: string; baseResume: string; domain: Domain },
  transcript: TranscriptEntry[],
  blueprintJson: string,
): string {
  return `You are the Debate-Driven Resume Transformer.

INPUTS:
- Candidate Base Resume: ${job.baseResume}
- Job Description (${job.domain}): ${job.jobDescription}
- Hiring Committee Blueprint: ${blueprintJson}
- Full Debate Transcript: ${formatTranscript(transcript)}

TASK:
Rewrite the candidate's resume to directly resolve every objection raised during the committee debate.

REWRITE STRATEGY BASED ON COMMITTEE FEEDBACK:
1. Resolve Technical Skepticism: Replace vague project descriptions with explicit architectural choices, parameters, dataset sizes, and evaluation metrics the committee asked for.
2. Address Sector Specialist Objections: Reframe past experience to highlight transferable domain skills (e.g., map high-throughput e-commerce event processing to high-frequency financial data processing), while staying honest — never invent facts not derivable from the base resume.
3. Satisfy the Recruiter & Manager: Lead impact bullets with the strongest metrics (%, $, latency improvements) in the first 2-3 words.

RULES:
- Only use information present in (or strongly implied by) the base resume. No fabricated employers, titles, or numbers.
- Where the base resume lacks evidence the committee wanted, add a clearly-marked placeholder like [ADD: metric for ...] instead of inventing.
- Keep it to a single page unless the source is longer.

OUTPUT:
Deliver a complete, polished, fully optimized resume in Markdown format.`;
}
