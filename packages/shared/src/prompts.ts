import type {
  AgentConfig,
  Blueprint,
  Decision,
  Domain,
  ExecutivePersona,
  GapAnalysisResult,
  JdMeta,
  JobDecomposition,
  TranscriptEntry,
  Verdict,
} from "./types.js";
import { buildIcPersonaPrompt, buildSectorSpecialistPrompt } from "./personas.js";
import type { IcDiscipline } from "./personas.js";

/** Phase of the debate an agent turn belongs to. */
export type Phase = "opening" | "crosstalk" | "ballot";

export interface PromptContext {
  domain: Domain;
  jobDescription: string;
  baseResume: string;
  transcript: TranscriptEntry[];
  /** Round number for cross-talk (1-based). */
  crosstalkRound?: number;
  /** Structured job-decomposition brief shared by every seat (Phase 1). */
  jobDecomposition?: JobDecomposition;
  /** Target sector from JD metadata (renders the Sector Specialist persona). */
  sectorFocus?: string;
  /** True when a Sector Specialist seat sits on the panel. When false, sector/domain transferability becomes a mandatory lens on every seat. */
  hasSectorSpecialist?: boolean;
  /** Extra mandatory discussion topics forced by panel rules (e.g. level inflation). */
  forcedTopics?: string[];
}

/** Map a seat title to a discipline label for the IC persona template. */
function disciplineFor(role: string): IcDiscipline {
  const lower = role.toLowerCase();
  if (lower.includes("scientist")) return "Scientist";
  if (lower.includes("analyst")) return "Analyst";
  if (lower.includes("architect")) return "Architect";
  if (lower.includes("engineer") || lower.includes("developer")) return "Engineer";
  return "Specialist";
}

/** Render the structured job-decomposition brief for agent prompts. */
export function formatJobDecomposition(d?: JobDecomposition): string {
  if (!d) return "No structured decomposition was produced.";
  const lines = [
    `Level: ${d.level || "not stated"}`,
    `Seniority expectation: ${d.seniorityExpectation || "not stated"}`,
  ];
  if (d.screeningFilters.length > 0) {
    lines.push(`Screening filters: ${d.screeningFilters.join("; ")}`);
  }
  if (d.mustHave.length > 0) {
    lines.push(`Must-haves: ${d.mustHave.join(", ")}`);
  }
  if (d.niceToHave.length > 0) {
    lines.push(`Nice-to-haves: ${d.niceToHave.join(", ")}`);
  }
  if (d.stackWords.length > 0) {
    lines.push(`Exact stack words: ${d.stackWords.join(", ")}`);
  }
  if (d.businessProblems.length > 0) {
    lines.push(`Company's stated problems:`);
    for (const p of d.businessProblems) {
      lines.push(`  - ${p.problem}${p.detail ? `: ${p.detail}` : ""}`);
    }
  }
  if (d.domainConstraints.length > 0) {
    lines.push(`Domain constraints: ${d.domainConstraints.join("; ")}`);
  }
  if (d.businessContext) {
    lines.push(`Business context: ${d.businessContext}`);
  }
  return lines.join("\n");
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
 * Builds the system prompt for one agent turn (Layer 1 - persona / SME layer).
 *
 * Implements the structured pure-evaluation persona contract:
 *   IDENTITY (level-aware) -> EVALUATION LENS -> MANDATORY DISCUSSION TOPICS ->
 *   INFLATED-CLAIM PROTOCOL -> FORBIDDEN -> JD -> resume -> transcript ->
 *   phase block -> engagement laws -> confidence anchors -> OUTPUT
 *
 * The "Decisive Non-Neutrality" output contract is preserved (tests + the
 * rule-based blueprint fallback parse it): [STRONG POSITIVES],
 * [HIGH-RISK CONCERNS] (with INFLATED_CLAIM: lines), [DEBATE RESPONSE],
 * [PIVOT POINT], [VERDICT] [STRONG HIRE] | [STRONG REJECT]. New additions:
 * [CONFIDENCE] (High/Medium/Low with objective anchors), [SECTOR &
 * TRANSFERABILITY] (every seat when no Sector Specialist is present), and a
 * forced-decision JSON with confidence + inflatedClaims for openings.
 */
export function buildAgentSystemPrompt(
  agent: AgentConfig,
  ctx: PromptContext,
  phase: Phase,
): string {
  const personaBlock = agent.isSectorSpecialist
    ? buildSectorSpecialistPrompt({
        sector: ctx.sectorFocus ?? "the target industry",
        domain: ctx.domain,
        persona: agent.focus,
      })
    : buildIcPersonaPrompt({
        level: (agent.level as
          | "Senior"
          | "Staff"
          | "Principal"
          | "Manager"
          | "Recruiter") ?? "Senior",
        discipline: disciplineFor(agent.role),
        domain: ctx.domain,
        focus: agent.focus,
        name: agent.name,
        role: agent.role,
      });

  const specialistBlock = agent.isSectorSpecialist
    ? `5. SECTOR & TRANSFERABILITY MANDATE: You are the Sector Specialist. You MUST explicitly assess:\n   - Industry fit: does the candidate's experience map to the target sector's protocols, compliance, and stack?\n   - Transferable skills: identify 1-2 prior-sector skills that translate to the target sector, AND 1-2 gaps that would require ramp-up.\n   Example: "Their high-concurrency e-commerce event processing translates to real-time patient telemetry, but they lack explicit HIPAA compliance context."\n   Do not be swayed by generic praise - concrete domain evidence or a clear transfer argument is required.`
    : "";

  const transferabilityLens =
    !agent.isSectorSpecialist && !ctx.hasSectorSpecialist
      ? `- Sector / domain transferability (no Sector Specialist sits on this panel; every seat answers it, weighted lightly)`
      : "";

  const mandatoryTopics = [
    "- Level calibration (title vs. actual scope)",
    "- Sector / domain transferability",
    "- Achievement density & verifiability (flag bloated claims structurally)",
    "- Missing critical experiences for THIS JD",
    "- Risk of under- or over-weighting any single factor",
    ...(ctx.forcedTopics?.map((t) => `- ${t}`) ?? []),
    ...(transferabilityLens ? [transferabilityLens] : []),
  ].join("\n");

  const openingBlock =
    phase === "opening"
      ? [
          `PHASE — ROUND 1 OPENING: 360-DEGREE CANDIDATE ANALYSIS + OPENING ARGUMENT. Before arguing, produce a complete 360-degree assessment of the candidate against THIS role, THIS JD, and the company's stated problems from the job decomposition brief. Then deliver your opening argument.`,
          ``,
          `360-DEGREE ANALYSIS MANDATE (opening only):`,
          `Score the candidate on EVERY factor below, role-specifically (judge each factor against THIS role and its JD, never in the abstract):`,
          `1. Profile Understanding — reconstruct the candidate's true career arc: seniority, trajectory, real years, what each role actually was. Score how well the person (not the bullets) fits the target level.`,
          `2. Missing Skills for the Role — an explicit ranked gap list: required-but-absent. Score the severity: ramp-up cost vs. disqualifying gap.`,
          `3. Business Understanding — does the candidate reason about business outcomes (cost/access/revenue levers, trade-offs, prioritization), mapped to the JD's stated problems? Score the evidence of it.`,
          `4. Authenticity — does the experience read genuine (specific, coherent, verifiable, date/logic consistent) or padded/AI-generated (vague, implausibly precise, generic)? Score how trustworthy the evidence reads.`,
          `5. Experience (years + seniority for this role)`,
          `6. Technical Skills (the exact tools/languages/stack the JD names — the stack words)`,
          `7. Product Thinking & Problem Solving (judgment, trade-offs, customer impact)`,
          `8. Role-Specific Signals (1-2 additional factors you judge decisive for THIS role)`,
          `For each factor give a 0-5 score and a one-line note. Then list your top strengths, top concerns, reasons to hire, reasons not to hire, missing skills, authenticity flags, credibility findings, a one-line business assessment, and your overall fit score (0-10).`,
        ].join("\n")
      : phase === "crosstalk"
        ? `PHASE — ROUND ${ctx.crosstalkRound ?? 2} CROSS-TALK: You are now responding to your colleagues' statements in the transcript. Challenge or explicitly agree with at least one named colleague. Re-examine your position in light of evidence others surfaced. Do not repeat your opening verbatim.`
        : `PHASE — FINAL BALLOT: Cast your final vote. Be brief (3-6 sentences). No new arguments — only weigh what the debate surfaced, reaffirm or flip your position with one concrete reason, and vote.`;

  const sectorOutputSection =
    !agent.isSectorSpecialist && !ctx.hasSectorSpecialist
      ? `\n\n[SECTOR & TRANSFERABILITY]\n- domain-fit assessment and transferable-skills mapping (every seat, no Sector Specialist present)`
      : agent.isSectorSpecialist
        ? `\n\n[SECTOR & TRANSFERABILITY]\n- domain-fit assessment and transferable-skills mapping (Sector Specialist only)`
        : "";

  const outputBlock =
    phase === "opening"
      ? `OUTPUT FORMAT (strict JSON, no markdown fences, no prose outside the JSON):
{
  "analysis": {
    "fitScore": <0-10 number>,
    "factors": [
      { "factor": "Profile Understanding", "score": <0-5>, "note": "<one-line role-specific assessment>" },
      { "factor": "Missing Skills for the Role", "score": <0-5>, "note": "<one-line role-specific assessment>" },
      { "factor": "Business Understanding", "score": <0-5>, "note": "<one-line role-specific assessment>" },
      { "factor": "Authenticity", "score": <0-5>, "note": "<one-line role-specific assessment>" },
      { "factor": "Experience", "score": <0-5>, "note": "<one-line role-specific assessment>" },
      { "factor": "Technical Skills", "score": <0-5>, "note": "<one-line role-specific assessment>" },
      { "factor": "Product Thinking & Problem Solving", "score": <0-5>, "note": "<one-line role-specific assessment>" },
      { "factor": "<your role-specific factor>", "score": <0-5>, "note": "<one-line role-specific assessment>" }
    ],
    "strengths": ["<evidence-backed strength>", ...],
    "concerns": ["<highest-risk gap>", ...],
    "hireReasons": ["<top concrete reasons to hire>", ...],
    "rejectReasons": ["<top concrete reasons not to hire>", ...],
    "missingSkills": ["<required-but-absent skills, ranked>", ...],
    "authenticityFlags": [{ "flag": "<reads-like concern>", "severity": "low" | "medium" | "high" }],
    "credibilityFindings": ["<dates/overlaps/title/claims inconsistencies>", ...],
    "businessAssessment": "<one line: does the candidate move the company's stated problems forward>",
    "confidence": "High" | "Medium" | "Low",
    "inflatedClaims": ["<un-evidenced claims flagged on the resume, verbatim claim text>", ...]
  },
  "opening": "<your prose opening argument. Include the [STRONG POSITIVES], [HIGH-RISK CONCERNS] (with INFLATED_CLAIM: lines for any inflated claim), [DEBATE RESPONSE], [PIVOT POINT], and [CONFIDENCE] sections as required by the laws below, ending with [VERDICT]\\n[STRONG HIRE] or [VERDICT]\\n[STRONG REJECT].>",
  "decision": "HIRE" | "REJECT",
  "decisionReason": "<one sentence>",
  "pivotFactor": "<the single factor that decided you>"
}`
      : `OUTPUT FORMAT (strict):
[STRONG POSITIVES]
- **top 2 hire reasons, concrete and evidence-based** (bold the strongest claim)

[HIGH-RISK CONCERNS]
- **top 2 reject reasons / skeptical areas** (bold the most critical risk)
- any inflated / un-evidenced claim as an INFLATED_CLAIM: "<claim>" -> evidence: <what actually supports it> -> severity: High|Medium|Low line${sectorOutputSection}

[DEBATE RESPONSE]
- address named colleague(s)

[PIVOT POINT]
- **the single factor that decided you** (bold it)

[CONFIDENCE]
- High | Medium | Low (see CONFIDENCE ANCHORS above; name the evidence anchor you used)

[VERDICT]
[STRONG HIRE] or [STRONG REJECT] (followed by your primary reason in one sentence)`;

  const decompositionBrief =
    ctx.jobDecomposition
      ? `JOB DECOMPOSITION BRIEF (shared by the whole committee):
${formatJobDecomposition(ctx.jobDecomposition)}
`
      : "";

  return `You are ${agent.name}, acting as the ${agent.role}.

${personaBlock}

EVALUATION LENS:
- Level calibration for THIS JD (candidate scope vs. claimed title vs. the JD level)
- Technical depth vs. claimed title
- Sector / domain transferability
- Achievement density and verifiability

MANDATORY DISCUSSION TOPICS:
${mandatoryTopics}

INFLATED-CLAIM PROTOCOL:
- Any claim not backed by concrete, role-specific evidence MUST be flagged as an INFLATED_CLAIM: "<claim>" -> evidence: <what actually supports it> -> severity: High|Medium|Low line inside [HIGH-RISK CONCERNS]. Bloating / elevated claims are never accepted silently.
- Use "reads like" framing only - never an accusation.

FORBIDDEN:
- Soft language ("maybe", "could be", "borderline", "on the fence")
- Accepting claims without evidence
- Discussing how the resume should be rewritten (debate language never leaks into rewrite instructions)

JOB DESCRIPTION (target domain: ${ctx.domain}):
${ctx.jobDescription}

${decompositionBrief}CANDIDATE BASE RESUME:
${ctx.baseResume}

COMMITTEE TRANSCRIPT SO FAR:
${formatTranscript(ctx.transcript)}

${openingBlock}

CRITICAL ENGAGEMENT LAWS (non-negotiable):
1. NO NEUTRALITY ALLOWED: You are strictly forbidden from giving "neutral", "average", or "maybe" verdicts. You must end your evaluation with either [STRONG HIRE] or [STRONG REJECT].
2. BALANCED EVALUATION REQUIRED: Before deciding, you MUST evaluate both sides:
   - Identify the candidate's strongest evidence of capability (Steel-man the Hire case) — list your TOP 2 hire reasons.
   - Identify the candidate's highest-risk weaknesses or omissions (Steel-man the Reject case) — list your TOP 2 reject reasons.
3. THE PIVOT POINT: After stating both sides, explicitly declare which single factor tipped your decision to one side.
4. DEBATE ENGAGEMENT: Address fellow committee members by name, directly challenging or agreeing with their prior statements in the transcript.${specialistBlock}

5. BUSINESS & SYSTEMS REASONING LAW: Assess the candidate as a working senior practitioner, not a checklist auditor. Weigh business impact (cost, access, revenue, risk), systems thinking (how the work integrates across teams and products), and decision quality. Judge the candidate against the company's stated problems from the job decomposition brief, never generic best practices.

6. AUTHENTICITY LAW: Explicitly scrutinize whether the experience reads genuine or AI-generated/padded. Flag every vague-but-implausibly-precise claim, generic bullet, and unverifiable date/scope inconsistency as an authenticity flag with a severity. Use "reads like" framing only — never an accusation.

7. TYPOGRAPHY & FORMATTING: Plain ASCII punctuation only. NEVER use em-dashes (—) or en-dashes (–) anywhere — use commas, colons, or hyphens instead. No emoji, smart quotes, or ellipses. Wrap your top evidence and your most pointed criticism in **double asterisks** so the key strengths and concerns stand out.

CONFIDENCE ANCHORS (state the anchor you used with [CONFIDENCE]):
- High: evidence directly names the exact tool, scope, metric, or responsibility the JD requires
- Medium: strong related evidence requiring one reasonable inference
- Low: only analogical or thin evidence; significant interpretation required

${outputBlock}`;
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
  "consensus": "SHORTLISTED" | "REJECTED",
  "credibilityFindings": [string, ...],  // dates/overlaps/title/claims inconsistencies the committee surfaced
  "authenticityFlags": [ { "flag": string, "severity": "low" | "medium" | "high" } ],
  "missingSkillsRanked": [ { "skill": string, "severity": "low" | "medium" | "high" } ],
  "requirementMap": [ { "requirement": string, "evidence": string, "status": "proven" | "partial" | "missing" | "unverifiable", "action": string } ],
  "inflatedClaims": [ { "claim": string, "evidence": string, "severity": "low" | "medium" | "high" } ], // every INFLATED_CLAIM: line from the debate, deduplicated
  "jdRequirements": [ { "requirement": string, "tier": "must" | "preferred" | "aspirational" } ]    // the JD wish-list triaged by tier; "must" = hard requirement, "preferred" = strong want, "aspirational" = stretch wish-list
}

Rules: derive verdicts ONLY from the [VERDICT]/[STRONG HIRE]/[STRONG REJECT] markers in each agent's turn. Each objection must map to at least one required change. Each entry in the requirementMap must reference a JD requirement and the evidence the debate surfaced for it. Inflated claims must come only from INFLATED_CLAIM: lines in the transcript; the resume agent MUST soften each one. Tier each JD requirement as "must" when the posting frames it as required, "preferred" when it is a nice-to-have, "aspirational" when it is clearly a stretch wish-list.`;
}

/**
 * Gap Analysis prompt (Phase O). Runs after the executive review and before
 * resume generation. Produces a structured gap analysis with defensible
 * enhancement suggestions for the resume.
 */
export function buildGapAnalysisPrompt(input: {
  jobDescription: string;
  baseResume: string;
  blueprint: Blueprint;
  amendmentNotes?: string;
}): string {
  const amendmentSection = input.amendmentNotes
    ? `\n\nCANDIDATE AMENDMENT NOTES:\n${input.amendmentNotes}\nIncorporate these notes into your suggestions if they are defensible and honest.`
    : "";

  return `You are the Gap Analyst, a career strategist specializing in structured resume tailoring for the ${input.blueprint.consensus === "SHORTLISTED" ? "shortlisted" : "non-shortlisted"} candidate.

You receive:
1. The job description
2. The candidate's current resume
3. The Hiring Committee blueprint (objections, strengths, required changes, missing skills, inflated claims, requirement map)
${input.amendmentNotes ? "4. Candidate-provided amendment notes" : ""}

TASK:
Produce strict JSON matching EXACTLY this schema (no markdown fences, no prose):
{
  "gapAnalysis": {
    "mustHaveGaps": [
      { "item": string, "evidenceStatus": "Missing" | "Weak" | "Partial", "impact": "High" | "Medium" | "Low", "notes": string }
    ],
    "niceToHaveGaps": [
      { "item": string, "evidenceStatus": "Missing" | "Weak" | "Transferable", "transferableFrom": string | null, "notes": string }
    ],
    "strongMatches": [
      { "item": string, "notes": string }
    ],
    "inflatedClaims": [
      { "claim": string, "severity": "High" | "Medium" | "Low", "panelNote": string }
    ],
    "overallReadiness": "Strong Match" | "Partial Match" | "Significant Gaps",
    "summary": string
  },
  "suggestions": [
    {
      "id": string,
      "category": "Reframe Early Role" | "Elevate Theme" | "Transferable Skill" | "Add Specificity" | "Soften Claim" | "Move Skill to Proof" | "Other",
      "suggestion": string,
      "justification": string,
      "risk": "Low" | "Medium" | "High",
      "targetSection": "Most Recent Role" | "Second Role" | "Earlier Role" | "Summary" | "Skills" | "Other",
      "proposedChange": string,
      "jdThemeAddressed": string
    }
  ],
  "priorityActions": [string, ...]
}

RULES:
- mustHaveGaps: Essential requirements the JD treats as non-negotiable that are missing or weakly evidenced. Use "Missing" when nothing in the resume addresses it, "Weak" when there is tangential evidence, "Partial" when there is some evidence but not at the level the JD demands.
- niceToHaveGaps: Preferred qualifications. Use "Transferable" when the candidate has adjacent experience that could be reframed. Set transferableFrom to the specific resume entry.
- strongMatches: Areas where the candidate has solid, panel-validated evidence. Include the strongest 3-5.
- inflatedClaims: Every claim the blueprint flagged as inflated or un-evidenced. Mirror the blueprint's findings.
- suggestions: 5-9 defensible enhancement suggestions. Each must map to a JD theme. Risk "High" means the suggestion adds unverifiable claims. Risk "Low" means it reframes existing evidence. Risk "Medium" is in between.
- priorityActions: 3-5 ordered actions the resume agent must take first.
- overallReadiness: "Strong Match" if 0-1 must-have gaps and 3+ strong matches. "Partial Match" if 2-4 must-have gaps. "Significant Gaps" if 5+ must-have gaps.
- Summary must be 2-3 sentences.
- Never invent experience. Never claim skills not in the resume. Never hide gaps.
- Plain ASCII punctuation only — no em-dashes, smart quotes, or emoji.${amendmentSection}

BLUEPRINT:
${JSON.stringify(input.blueprint)}

JOB DESCRIPTION:
${input.jobDescription}

CANDIDATE RESUME:
${input.baseResume}`;
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

/**
 * JD metadata extraction prompt. The SME panel needs concrete metadata about
 * the role it is evaluating (company, role, sector, location, team) so the
 * committee seats are selected from it and the panel is framed correctly.
 */
export function buildJdMetaPrompt(job: {
  jobDescription: string;
  domain: Domain;
  roleSlug?: string;
}): string {
  const roleLine = job.roleSlug ? `, roleSlug: ${job.roleSlug}` : "";
  return `You are a job-description metadata extractor. Read the job description and extract the concrete metadata an SME hiring committee needs.

JOB DESCRIPTION (${job.domain}${roleLine}):
${job.jobDescription}

TASK:
Produce strict JSON matching EXACTLY this schema (no markdown fences, no prose):
{
  "company": string,   // the hiring company/organization name; "" if not stated
  "role": string,      // the role title as the posting names it, e.g. "Senior Backend Engineer"
  "sector": string,    // the company's sector/industry, e.g. "FinTech payments"
  "location": string,  // office/city/remote basis, e.g. "New York, USA" or "Remote (US)"
  "team": string       // the team/group the role sits in; "" if not stated
}

Rules: prefer the exact wording the posting uses. Never invent metadata that is not in the JD. Plain ASCII punctuation only — no em-dashes, smart quotes, or emoji.`;
}

/**
 * Job-decomposition prompt (Phase 1, plan §5). Produces the structured brief
 * every committee seat shares, so the panel evaluates the candidate against the
 * same role model: the real level, the named screening filters, the exact stack,
 * and the company's actual near-term problems.
 */
export function buildJobDecompositionPrompt(job: {
  jobDescription: string;
  domain: Domain;
  roleSlug?: string;
  jdMeta?: JdMeta;
}): string {
  const companyLine = job.jdMeta?.company ? ` Company: ${job.jdMeta.company}.` : "";
  const sectorLine = job.jdMeta?.sector ? ` Sector: ${job.jdMeta.sector}.` : "";
  const roleLine = job.jdMeta?.role
    ? ` Role title: ${job.jdMeta.role}.`
    : job.roleSlug
      ? ` Role slug: ${job.roleSlug}.`
      : "";
  return `You are a job-decomposition analyst. Read the job description and decompose the role into the structured brief a senior hiring committee needs to evaluate a candidate against the company's actual priorities.

JOB DESCRIPTION (${job.domain}${roleLine})${companyLine}${sectorLine}:
${job.jobDescription}

TASK:
Produce strict JSON matching EXACTLY this schema (no markdown fences, no prose):
{
  "level": string,            // the role level the posting names, e.g. "Senior IC (Applied Scientist III)"
  "seniorityExpectation": string, // the years/level the posting implies, e.g. "5-8 yrs, system-level ownership"
  "screeningFilters": [string],   // explicit filters/disclaimers, e.g. "not a dashboards role", titles that auto-filter
  "mustHave": [string],           // required skills the posting names
  "niceToHave": [string],         // preferred skills the posting names
  "stackWords": [string],         // the exact tool/stack names the posting names, e.g. Snowflake, Pandas
  "businessProblems": [ { "problem": string, "detail": string, "mappedRequirement": string } ], // the company's 2-4 concrete near-term problems/projects the posting implies
  "domainConstraints": [string],  // constraints like healthcare/claims, compliance, regulation
  "businessContext": string       // what the company sells and how it makes money (from the JD, or the sector if unknown)
}

Rules: derive everything strictly from the JD; never invent companies, products, or problems not stated (or strongly implied by the sector). Plain ASCII punctuation only — no em-dashes, smart quotes, or emoji.`;
}

/**
 * Executive-review prompt (Phase 1, plan §3.6). A function-aware C-suite
 * reviewer reads the JD, the resume, the full debate and the committee verdict,
 * then gives an ADVISORY opinion on whether the debate and the candidate
 * fairly benefit the organization. It never overrides `finalVerdict`.
 */
export function buildExecutiveReviewPrompt(input: {
  persona: ExecutivePersona;
  company: string;
  domain: Domain;
  jobDescription: string;
  baseResume: string;
  jobDecomposition?: JobDecomposition;
  transcript: TranscriptEntry[];
  consensus: Verdict;
  tallies: Record<Decision, number>;
  blueprint: Blueprint;
}): string {
  const personaRole = input.company
    ? `${input.persona} at ${input.company}`
    : `${input.persona} (hiring company)`;
  const talliesLine = Object.entries(input.tallies)
    .map(([v, n]) => `${v}: ${n}`)
    .join(", ");
  const decompositionBrief = input.jobDecomposition
    ? `\nJOB DECOMPOSITION BRIEF:\n${formatJobDecomposition(input.jobDecomposition)}`
    : "";
  return `You are an executive hiring reviewer. You are the ${personaRole}. You own the company's growth outcomes, not just this one hire. Read the job description, the candidate's resume, the full committee debate, and the committee's verdict, then give YOUR OPINION on whether the debate and the candidate fairly benefit the organization.

Your opinion is advisory: it does not change the committee's final verdict, and you must say so.

JOB DESCRIPTION (${input.domain}):${decompositionBrief}
${input.jobDescription}

CANDIDATE BASE RESUME:
${input.baseResume}

COMMITTEE VERDICT:
${input.consensus} (tallies: ${talliesLine || "none"})

HIRING COMMITTEE BLUEPRINT:
${JSON.stringify(input.blueprint)}

FULL DEBATE TRANSCRIPT:
${formatTranscript(input.transcript)}

TASK:
Review as the ${personaRole}. Produce strict JSON matching EXACTLY this schema (no markdown fences, no prose):
{
  "persona": "${input.persona}",
  "company": "${input.company}",
  "debateRelevance": { "score": <0-10>, "note": "<did the debate focus on what actually matters for the company?>" },
  "roleAlignment": { "score": <0-10>, "note": "<does the candidate fit the role and its demands?>" },
  "growthAlignment": { "score": <0-10>, "note": "<does the candidate move the company's growth/strategy forward?>" },
  "requirementAssessment": "<how well did the committee treat the JD's hard requirements?>",
  "conditionsToHire": ["<conditions the company would require to proceed with this hire>", ...],
  "opinion": "FAVORABLE" | "NEUTRAL" | "UNFAVORABLE",
  "opinionReason": "<why you reached this opinion>",
  "summary": "<2-3 sentence summary>"
}

Rules: evaluate the DEBATE QUALITY (relevance and fairness) as much as the candidate. Never override or appear to override the committee verdict. Plain ASCII punctuation only — no em-dashes, smart quotes, or emoji.`;
}

/**
 * Layer-2 Director / Architect fairness-audit prompt. Runs AFTER the ballot and
 * BEFORE the verdict is finalized. The Director reviews whether the committee
 * applied the same evidence bar everywhere, calibrated level correctly,
 * considered transferability fairly, avoided groupthink, kept confidence
 * consistent with the evidence anchors, and accepted/rejected evidence
 * appropriately. It can force ONE targeted re-ballot on a single material
 * factor, but can never unilaterally flip the final HIRE/REJECT.
 */
export function buildDirectorPrompt(input: {
  domain: Domain;
  jobDescription: string;
  baseResume: string;
  sectorFocus?: string;
  jobDecomposition?: JobDecomposition;
  transcript: TranscriptEntry[];
  consensus: Verdict;
  tallies: Record<Decision, number>;
}): string {
  const talliesLine = Object.entries(input.tallies)
    .map(([v, n]) => `${v}: ${n}`)
    .join(", ");
  const sectorLine = input.sectorFocus ? ` Target sector: ${input.sectorFocus}.` : "";
  const decompositionBrief = input.jobDecomposition
    ? `\nJOB DECOMPOSITION BRIEF:\n${formatJobDecomposition(input.jobDecomposition)}`
    : "";
  return `You are the Director / Architect on this hiring committee. You do not re-judge the candidate - you audit the FAIRNESS of the debate that already happened.

JOB DESCRIPTION (${input.domain})${sectorLine}:${decompositionBrief}
${input.jobDescription}

CANDIDATE BASE RESUME:
${input.baseResume}

COMMITTEE CONSENSUS:
${input.consensus} (tallies: ${talliesLine || "none"})

FULL DEBATE TRANSCRIPT:
${formatTranscript(input.transcript)}

TASK:
Run the fairness checklist below against the actual debate and produce strict JSON matching EXACTLY this schema (no markdown fences, no prose):
{
  "fair": true | false,                 // overall fairness verdict
  "items": [
    { "factor": "evidence bar consistency", "passed": true | false, "note": "<what the debate did well or failed at>" },
    { "factor": "level calibration", "passed": true | false, "note": "<was the JD level vs. candidate scope calibrated correctly?>" },
    { "factor": "transferability", "passed": true | false, "note": "<were transferable skills fairly considered, and did the sector lens hold everyone to the same bar?>" },
    { "factor": "groupthink", "passed": true | false, "note": "<did any single voice dominate, or did agents challenge each other by name?>" },
    { "factor": "confidence consistency", "passed": true | false, "note": "<were confidence levels consistent with the evidence anchors (High = exact tool/scope/metric, Medium = one inference, Low = thin/analogical)?>" },
    { "factor": "evidence acceptance", "passed": true | false, "note": "<did any seat reject evidence-backed claims or accept unsupported ones?>" }
  ],
  "revoteFactor": "<the SINGLE factor a targeted re-ballot must re-test, or empty string when the debate was fair>",
  "needsHumanReview": true | false       // report-only escalation for extreme unresolved inconsistency
}

RULES:
- Base every finding on concrete turns in the transcript; quote what you saw. Never invent items.
- Set "fair" to false (and name exactly ONE "revoteFactor") ONLY when at least one checklist item materially failed. The re-ballot re-tests that single factor only.
- "needsHumanReview" is advisory and report-only.
- You can NEVER change the committee's HIRE/REJECT yourself - the re-ballot is the committee's to re-cast. Plain ASCII punctuation only — no em-dashes, smart quotes, or emoji.`;
}
