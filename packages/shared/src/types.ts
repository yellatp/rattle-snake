/**
 * Core domain model for the Rattle-Snake V2 hiring committee.
 *
 * A "job" is one isolated candidate evaluation: one JD + one base resume
 * evaluated by a 5-member domain committee through a multi-round debate.
 */

/**
 * Role-driven domains. A job is grouped into exactly one bucket by the role the
 * JD targets; the bucket drives the committee build, the detection keywords and
 * the label shown in the UI. This replaces the old SWE / DATA_AI / FINANCE
 * groupings entirely.
 */
export type Domain =
  | "AI_ENGINEERING"
  | "ML_ENGINEERING"
  | "SDE"
  | "DATA_ENGINEERING"
  | "DATA_SCIENCE"
  | "CYBERSECURITY"
  | "NETWORKING"
  | "DEVOPS"
  | "PROJECT_MANAGEMENT";

export const DOMAINS: readonly Domain[] = [
  "AI_ENGINEERING",
  "ML_ENGINEERING",
  "SDE",
  "DATA_ENGINEERING",
  "DATA_SCIENCE",
  "CYBERSECURITY",
  "NETWORKING",
  "DEVOPS",
  "PROJECT_MANAGEMENT",
] as const;

/** Forced non-neutral verdict cast by a single agent. */
export type Decision = "HIRE" | "REJECT";

/** Consensus outcome across the committee. */
export type Verdict = "SHORTLISTED" | "REJECTED";

export type JobStatus =
  | "pending"
  | "debating"
  | "completed"
  | "failed"
  | "cancelled";

/**
 * Live stage of a committee run, streamed to clients for the phase tracker.
 * `activity` carries a human line such as "Marcus (Senior Backend Engineer) is
 * sharing their opening view on the candidate".
 */
export type DebatePhase =
  | "queued"
  | "jdMeta"
  | "decomposition"
  | "panel"
  | "opening"
  | "crosstalk"
  | "ballot"
  | "blueprint"
  | "director"
  | "executive"
  | "gapAnalysis"
  | "chain"
  | "done";

/**
 * The six committee seat kinds. A committee is built from a per-role spec and
 * then filtered by the candidate's experience band (entry/mid/senior/principal)
 * so early-career debates run without Manager/Staff/Principal seats and
 * principal-level debates drop the Senior seat.
 */
export type AgentSeat =
  | "senior"
  | "manager"
  | "staff"
  | "principal"
  | "recruiter"
  | "sector";

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
  /** Which of the six committee seats this persona fills. */
  kind?: AgentSeat;
  /** Marks the Sector/Industry Fit specialist seat. */
  isSectorSpecialist?: boolean;
  /** Ballot weight for the weighted consensus. Defaults to 1. */
  weight?: number;
  /** Persona level rendered in the IDENTITY block ("Senior", "Staff", "Principal", "Manager", "Recruiter", "Sector Specialist"). */
  level?: string;
  /** Short persona color/shade shown in the UI transcript. */
  tone?: string;
}

/**
 * How strongly the seat's evidence anchors its decision. The value multiplies
 * the seat weight in the weighted consensus (High 1.0 / Medium 0.7 / Low 0.4).
 */
export type Confidence = "High" | "Medium" | "Low";

/** Multiplier applied to a seat's weight based on the confidence it declared. */
export const CONFIDENCE_WEIGHT: Record<Confidence, number> = {
  High: 1.0,
  Medium: 0.7,
  Low: 0.4,
};

export interface TranscriptEntry {
  id: string;
  sender: string;
  role: string;
  /** 1 = opening, 2+ = cross-talk rounds, "ballot" = final vote pass. */
  round: number | "ballot";
  text: string;
  decision?: Decision;
  decisionReason?: string;
  /** Evidence strength backing this turn's decision (High/Medium/Low). */
  confidence?: Confidence;
  createdAt: string;
}

/** One requirement-to-evidence mapping row in the blueprint's requirement map. */
export interface BlueprintRequirementMapEntry {
  /** The JD requirement, e.g. "production ML at 2M+ events/day". */
  requirement: string;
  /** Evidence found in the resume / debate. */
  evidence: string;
  /** Whether the requirement is met, partially met, missing, or unverifiable. */
  status: "proven" | "partial" | "missing" | "unverifiable";
  /** The change needed to satisfy it. */
  action: string;
}

/** One missing skill ranked by severity in the blueprint. */
export interface BlueprintMissingSkill {
  skill: string;
  severity: "low" | "medium" | "high";
}

/** One panel-flagged un-evidenced claim the resume agent MUST soften. */
export interface InflatedClaim {
  /** The claim as the resume makes it. */
  claim: string;
  /** Why the panel considers it inflated / un-evidenced. */
  evidence: string;
  /** How badly the claim overstates the evidence. */
  severity: "low" | "medium" | "high";
}

/** JD requirement tiers used to triage the wish-list for the resume agent. */
export type JdRequirementTier = "must" | "preferred" | "aspirational";

/** One JD requirement triaged by tier. Only "must"/"preferred" justify enhancement. */
export interface JdRequirement {
  requirement: string;
  tier: JdRequirementTier;
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
  /** Date/overlap/title/claims inconsistencies the committee surfaced. */
  credibilityFindings: string[];
  /** Signals the resume reads padded or AI-generated, by severity. */
  authenticityFlags: AuthenticityFlag[];
  /** The JD's required-but-weak skills, ranked by severity. */
  missingSkillsRanked: BlueprintMissingSkill[];
  /** Requirement-by-requirement evidence map across the committee. */
  requirementMap: BlueprintRequirementMapEntry[];
  /** Panel-flagged claims the resume agent MUST soften or reframe. */
  inflatedClaims?: InflatedClaim[];
  /** The JD wish-list triaged by tier; only "must"/"preferred" justify enhancement. */
  jdRequirements?: JdRequirement[];
}

// ── Gap Analysis (Phase O) ──────────────────────────────────────────────────

/** Evidence status for a must-have gap. */
export type GapEvidenceStatus = "Missing" | "Weak" | "Partial";

/** Evidence status for a nice-to-have gap. */
export type NiceToHaveEvidenceStatus = "Missing" | "Weak" | "Transferable";

/** Readiness label for overall candidate fit. */
export type OverallReadiness = "Strong Match" | "Partial Match" | "Significant Gaps";

/** Impact level for a must-have gap. */
export type GapImpact = "High" | "Medium" | "Low";

/** Severity for inflated claims surfaced by the gap analysis. */
export type GapSeverity = "High" | "Medium" | "Low";

/** Risk level for an enhancement suggestion. */
export type SuggestionRisk = "Low" | "Medium" | "High";

/** Category of enhancement suggestion. */
export type SuggestionCategory =
  | "Reframe Early Role"
  | "Elevate Theme"
  | "Transferable Skill"
  | "Add Specificity"
  | "Soften Claim"
  | "Move Skill to Proof"
  | "Other";

/** Target section of the resume for a suggestion. */
export type SuggestionTarget =
  | "Most Recent Role"
  | "Second Role"
  | "Earlier Role"
  | "Summary"
  | "Skills"
  | "Other";

/** One essential requirement the JD treats as non-negotiable that is missing or weakly evidenced. */
export interface MustHaveGap {
  item: string;
  evidenceStatus: GapEvidenceStatus;
  impact: GapImpact;
  notes: string;
}

/** One preferred item. Marks when transferable experience exists. */
export interface NiceToHaveGap {
  item: string;
  evidenceStatus: NiceToHaveEvidenceStatus;
  transferableFrom: string | null;
  notes: string;
}

/** Area with solid, panel-validated evidence. */
export interface StrongMatch {
  item: string;
  notes: string;
}

/** Panel-flagged inflated claim surfaced by gap analysis. */
export interface GapInflatedClaim {
  claim: string;
  severity: GapSeverity;
  panelNote: string;
}

/** Structured gap analysis of the candidate against the JD. */
export interface GapAnalysis {
  mustHaveGaps: MustHaveGap[];
  niceToHaveGaps: NiceToHaveGap[];
  strongMatches: StrongMatch[];
  inflatedClaims: GapInflatedClaim[];
  overallReadiness: OverallReadiness;
  summary: string;
}

/** One defensible enhancement suggestion for the resume. */
export interface EnhancementSuggestion {
  id: string;
  category: SuggestionCategory;
  suggestion: string;
  justification: string;
  risk: SuggestionRisk;
  targetSection: SuggestionTarget;
  proposedChange: string;
  jdThemeAddressed: string;
}

/** Complete gap analysis result from the Gap Analyst LLM. */
export interface GapAnalysisResult {
  gapAnalysis: GapAnalysis;
  suggestions: EnhancementSuggestion[];
  priorityActions: string[];
}

/**
 * One checklist item in the Director's fairness audit (Layer 2). The Director
 * runs after the ballot and before the verdict is finalized; it can force ONE
 * targeted re-ballot on a material factor but can never flip the verdict alone.
 */
export interface DirectorFinding {
  /** The fairness factor audited (evidence bar, level calibration, transferability, groupthink, confidence consistency, evidence acceptance). */
  factor: string;
  passed: boolean;
  note: string;
}

export interface DirectorAudit {
  /** Overall fairness verdict. */
  fair: boolean;
  /** Per-checklist-item results. */
  items: DirectorFinding[];
  /** Pass/fail per factor for compact rendering. */
  passes: boolean;
  /** The single factor a targeted re-ballot was forced on (empty when none). */
  revoteFactor?: string;
  /** Report-only escalation flag for extreme unresolved inconsistency. */
  needsHumanReview?: boolean;
}

/**
 * Concrete metadata extracted from the job description. The SME committee is
 * selected from this (sector + role), and the fields feed the resume locale
 * and the UI so the panel always knows what it is evaluating.
 */
export interface JdMeta {
  /** Hiring company / organization, as stated in the posting. */
  company: string;
  /** Role title, e.g. "Senior Backend Engineer". */
  role: string;
  /** Company sector / industry, e.g. "FinTech payments". */
  sector: string;
  /** Office / city / remote basis, e.g. "New York, USA". */
  location: string;
  /** Team / group the role sits in. */
  team: string;
  /** Role slug resolved from the extracted title, when one is known. */
  roleSlug?: string;
}

/** One scored dimension in an SME panelist's 360-degree analysis. */
export interface SmeFactorScore {
  /** Canonical or role-specific factor name (e.g. "Experience"). */
  factor: string;
  /** 0-5 score against THIS role and its JD. */
  score: number;
  /** One-line role-specific assessment. */
  note: string;
}

/** One authenticity / "reads-like" flag on the resume, with a severity. */
export interface AuthenticityFlag {
  /** The concern, e.g. "vague-but-implausibly-precise scale claims". */
  flag: string;
  /** How much the flag erodes trust in the evidence, "low" | "medium" | "high". */
  severity: "low" | "medium" | "high";
}

/**
 * One SME panelist's 360-degree candidate analysis, produced as their opening
 * turn. Every seat assesses the candidate across the canonical role-specific
 * factors, lists strengths and concerns, then commits to a forced decision.
 */
export interface SmeAnalysis {
  /** Seat name (the agent's name). */
  seat: string;
  /** Seat title (e.g. "Lead Technical Recruiter"). */
  role: string;
  /** Overall candidate fit for this role, 0-10. */
  fitScore: number;
  /** Scored factors (canonical set + role-specific extras). */
  factors: SmeFactorScore[];
  /** Evidence-backed strengths for this role. */
  strengths: string[];
  /** Highest-risk gaps / concerns for this role. */
  concerns: string[];
  /** Forced non-neutral decision. */
  decision: Decision;
  /** One-sentence justification. */
  decisionReason: string;
  /** The single factor that tipped the decision. */
  pivotFactor: string;
  /** Top concrete reasons to hire this candidate for THIS role. */
  hireReasons: string[];
  /** Top concrete reasons not to hire, ranked by severity. */
  rejectReasons: string[];
  /** Required-but-absent skills the JD names, ranked by severity. */
  missingSkills: string[];
  /** Signals that the experience reads padded or AI-generated. */
  authenticityFlags: AuthenticityFlag[];
  /** Date/overlap/title/claims inconsistencies found in the resume. */
  credibilityFindings: string[];
  /** One-line: does the candidate move the company's stated problems forward? */
  businessAssessment: string;
  /** Evidence strength backing this decision (High/Medium/Low) - multiplies the seat weight in consensus. */
  confidence?: Confidence;
  /** Un-evidenced / inflated claims this seat flagged on the resume. */
  inflatedClaims?: string[];
}

/** One concrete business problem the JD implies the company is trying to solve. */
export interface BusinessProblem {
  /** The problem, e.g. "real-time payment fraud scoring at scale". */
  problem: string;
  /** Supporting detail from the JD. */
  detail: string;
  /** The JD requirement the problem maps to. */
  mappedRequirement: string;
}

/**
 * Structured job decomposition produced up front so every committee seat
 * evaluates the candidate against the same role model: the real level, the
 * named screening filters, the exact stack, and the company's actual problems.
 */
export interface JobDecomposition {
  /** Role level named by the JD, e.g. "Senior IC (Applied Scientist III)". */
  level: string;
  /** Expected seniority / years the posting implies, e.g. "5-8 yrs, system-level ownership". */
  seniorityExpectation: string;
  /** Explicit screening filters / disclaimers, e.g. "not a dashboards role". */
  screeningFilters: string[];
  /** Must-have skills the posting names. */
  mustHave: string[];
  /** Nice-to-have skills the posting names. */
  niceToHave: string[];
  /** Exact stack / tool words the posting names (e.g. Snowflake, Pandas). */
  stackWords: string[];
  /** The company's concrete near-term problems from the JD. */
  businessProblems: BusinessProblem[];
  /** Domain constraints (healthcare/claims, compliance, regulation, ...). */
  domainConstraints: string[];
  /** What the company sells and how it makes money (from the JD or sector). */
  businessContext: string;
}

/** Executive moderator seat (function-aware, advisory only). */
export type ExecutivePersona =
  | "CTO"
  | "CFO"
  | "CMO"
  | "CISO"
  | "CDO"
  | "COO"
  | "CPO"
  | "CEO";

/** Advisory-only moderator opinion on the debate + candidate. */
export type ExecutiveOpinion = "FAVORABLE" | "NEUTRAL" | "UNFAVORABLE";

/** One scored 0-10 dimension in the executive review. */
export interface ExecutiveScore {
  /** 0-10 score against this hire. */
  score: number;
  /** One-line rationale. */
  note: string;
}

/**
 * The executive moderator's review (plan §3.6). Produced after the blueprint,
 * it reads the JD, the resume, the full debate and the committee verdict and
 * gives the company-level opinion of the debate's fairness and the candidate's
 * worth. It is advisory only: it never changes `finalVerdict`.
 */
export interface ExecutiveReview {
  /** Which C-suite persona wrote the review, e.g. "CTO". */
  persona: ExecutivePersona;
  /** The hiring company the persona belongs to. */
  company: string;
  /** Did the debate focus on what actually matters for the company? */
  debateRelevance: ExecutiveScore;
  /** Does the candidate fit the role and its demands? */
  roleAlignment: ExecutiveScore;
  /** Does the candidate move the company's growth/strategy forward? */
  growthAlignment: ExecutiveScore;
  /** Assessment of the committee's treatment of hard requirements. */
  requirementAssessment: string;
  /** Conditions the company would require to proceed with this hire. */
  conditionsToHire: string[];
  /** The moderator's overall opinion. */
  opinion: ExecutiveOpinion;
  /** Why the opinion was reached. */
  opinionReason: string;
  /** Two-three sentence summary. */
  summary: string;
}

/**
 * The resume auditor's full written feedback, surfaced so the candidate can
 * see exactly what the moderator flagged and how to fix it. Mirrors the api
 * package's `resume/moderator.ts` ModerationResult (kept in shared so the web
 * app can render it without importing server code).
 */
export interface ResumeModeratorFeedback {
  /** 0-100 auditor quality score. */
  score: number;
  /** Whether the auditor approved the final output. */
  approved: boolean;
  /** One-line blunt verdict for the UI. */
  summaryVerdict: string;
  /** Exact banned phrases detected. */
  bannedPhrases: string[];
  /** Specific problems found. */
  issues: string[];
  /** Actionable improvement suggestions. */
  suggestions: string[];
}

/**
 * Compact, non-secret metadata about how a resume was generated.
 * Mirrors the api package's `resume/types.ts` contract (kept in shared so the
 * web app can render it without importing server code).
 */
export interface ResumeMeta {
  /** Detected role slug (e.g. "swe"). */
  role: string;
  /** Human label for the detected role (e.g. "Software Engineer"). */
  roleLabel: string;
  /** ATS keyword coverage score, 0-100. */
  atsScore: number;
  /** Elite resume-auditor quality score, 0-100. */
  moderationScore: number;
  /** Whether the resume auditor approved the final output. */
  moderationApproved: boolean;
  /** Number of generation iterations used (1 = initial, 2 = one re-run). */
  iterations: number;
  /** English variant the resume was written in ("us" | "uk"). */
  locale?: EnglishLocale;
  /** Role screening-floor coverage: how many baseline checklist items the resume evidences. */
  screeningCoverage?: { matched: number; total: number };
  /** Honest framing for the ATS score: keyword overlap, not a prediction. */
  atsScoreNote?: string;
  /** Full auditor feedback (issues, suggestions, banned phrases). */
  moderator?: ResumeModeratorFeedback;
  /** Controlled-enhancement tier used for this generation. */
  enhancementTier?: EnhancementTier;
  /** Audit trail of every added / materially expanded bullet. */
  enhancements?: ResumeEnhancement[];
}

/**
 * Controlled enhancement tier (Layer 3, section 6c of the three-layer plan).
 * Tighter tiers allow less new content than the JD wish-list.
 */
export type EnhancementTier = "conservative" | "balanced" | "competitive";

/** One controlled-enhancement audit entry: what was added/changed and why. */
export interface ResumeEnhancement {
  /** The original text this bullet grew from (empty for pure additions). */
  original: string;
  /** The resulting bullet. */
  enhanced: string;
  /** Why this is defensible (evidence anchor + which JD requirement it serves). */
  justification: string;
}

/** English variant used for the generated resume, derived from job location. */
export type EnglishLocale = "us" | "uk";

/**
 * Optional auto-generation flags for a chained run. When any flag is set, the
 * server generates the requested artifacts after the committee finishes
 * (resume -> cover letter -> cold email -> interview), streaming each over SSE.
 */
export interface GenerateOptions {
  resume?: boolean;
  coverLetter?: boolean;
  coldEmail?: boolean;
  interview?: boolean;
  /** Controlled-enhancement tier for the resume handoff (Layer 3). */
  enhancementTier?: EnhancementTier;
}

export interface JobState {
  id: string;
  /** Tenant identifier for SaaS isolation (empty/null for single-tenant mode). */
  tenantId?: string;
  domain: Domain;
  /** Role slug detected from the JD at creation (e.g. "swe", "data_scientist").
   *  When present, the role-driven committee (not just the domain) is used. */
  roleSlug?: string;
  jobDescription: string;
  baseResume: string;
  /** Optional override for the sector specialist persona. */
  sectorFocus?: string;
  /** Where the job is based (free text, e.g. "London, UK") — drives the US/UK English variant. */
  jobLocation?: string;
  /** The candidate profile used for generation (WS-6), when one was selected at creation. */
  profileId?: string;
  transcript: TranscriptEntry[];
  /** Entry count for list payloads (the list endpoint omits the transcript body). */
  transcriptLength?: number;
  /** JD metadata extracted at run start (company, role, sector, location, team). */
  jdMeta?: JdMeta;
  /** Structured job decomposition brief shared by every committee seat. */
  jobDecomposition?: JobDecomposition;
  /** Per-seat 360-degree analyses produced during the opening round. */
  analyses?: SmeAnalysis[];
  finalVerdict?: Verdict;
  blueprint?: Blueprint;
  /** Layer-2 fairness audit (Director), run before the verdict is finalized. */
  directorAudit?: DirectorAudit;
  /** Advisory executive-review opinion (plan §3.6), when one was produced. */
  executiveReview?: ExecutiveReview;
  /** Current live stage of the run, for the phase tracker (streamed over SSE). */
  phase?: DebatePhase;
  /** Human-readable detail for the phase tracker (e.g. which SME is speaking). */
  activity?: string;
  /** Rendered Markdown view of the rewritten resume. */
  rewrittenResume?: string;
  /** Structured role-template JSON produced by the resume engine. */
  rewrittenResumeJson?: string;
  /** Role / ATS / moderation metadata for the generated resume. */
  resumeMeta?: ResumeMeta;
  /** Auto-generation requested at creation (committee -> resume -> cover letter -> cold email -> interview). */
  generate?: GenerateOptions;
  /** Cold-email draft persisted by a chained run, when one was auto-generated. */
  coldEmailDraft?: ColdEmailDraft;
  /** Cover-letter draft persisted by a chained run, when one was auto-generated. */
  coverLetterDraft?: CoverLetterDraft;
  /** Interview prep plan persisted by a chained run, when one was auto-generated. */
  interviewPlan?: InterviewPrepPlan;
  /** Non-secret record of which provider/model actually ran this evaluation. */
  llmUsed?: { provider: string; model: string };
  /** Gap analysis produced after the committee run, before resume generation. */
  gapAnalysis?: GapAnalysisResult;
  /** User-provided amendment notes that guide resume generation. */
  amendmentNotes?: string;
  status: JobStatus;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Public metadata for one resume template, exposed through
 * GET /api/resume/templates so the web client can render a browsable
 * template library.
 */
export interface ResumeTemplateInfo {
  slug: string;
  role: string;
  category: string;
  domains: Domain[];
  atsKeywords: string[];
}

/** Structured contact block for a candidate profile. */
export interface ProfilePersonalInfo {
  firstName?: string;
  middleName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
  headline?: string;
}

/** One work-history entry on a candidate profile. */
export interface ProfileExperience {
  title?: string;
  company?: string;
  location?: string;
  dates?: string;
  isCurrent?: boolean;
  locked?: boolean;
  bullets?: string[];
}

/** One education entry on a candidate profile. */
export interface ProfileEducation {
  degree?: string;
  institution?: string;
  location?: string;
  dates?: string;
}

/** One skill category on a candidate profile (items may be flagged as highlighted). */
export interface ProfileSkillCategory {
  name?: string;
  items?: Array<{ name: string; isHighlighted?: boolean }>;
}

/** A personal project on a candidate profile. */
export interface ProfileProject {
  name?: string;
  description?: string;
  link?: string;
}

/** One saved resume version attached to a profile. */
export interface ProfileResumeVersion {
  name?: string;
  slug?: string;
  json?: string;
  createdAt?: string;
}

/**
 * A candidate profile (WS-6 multi-profile). The first created profile becomes
 * the master (used as the default input for new debates). Structured fields
 * feed the resume engine so generation is profile-driven rather than
 * resume-text-driven alone.
 */
export interface UserProfile {
  id: string;
  /** Tenant identifier for SaaS isolation (empty/null for single-tenant mode). */
  tenantId?: string;
  name: string;
  email: string;
  isMaster: boolean;
  hasPin: boolean;
  personalInfo?: ProfilePersonalInfo;
  /** Condensed professional summary paragraph, used as the resume summary when present. */
  summary?: string;
  workAuthorization?: string;
  employmentPreference?: string;
  experience?: ProfileExperience[];
  education?: ProfileEducation[];
  skills?: ProfileSkillCategory[];
  certifications?: string[];
  projects?: ProfileProject[];
  publications?: string[];
  languages?: string[];
  volunteer?: string[];
  coreCompetencies?: string[];
  workAreas?: string[];
  totalWorkExperience?: string;
  resumeVersions?: ProfileResumeVersion[];
  atsMetadata?: Record<string, unknown>;
  updatedAt: string;
  createdAt?: string;
}

/** A saved resume the user can reuse across runs. */
export interface SavedResume {
  id: string;
  /** Tenant identifier for SaaS isolation (empty/null for single-tenant mode). */
  tenantId?: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

/** A saved job description the user can reuse across runs. */
export interface SavedJd {
  id: string;
  /** Tenant identifier for SaaS isolation (empty/null for single-tenant mode). */
  tenantId?: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * A stored LLM API connection. The API key lives server-side (encrypted at
 * rest) and is never returned to the client — `hasKey`/`keyPreview` indicate
 * whether one is set.
 */
export interface LlmConnection {
  id: string;
  /** Tenant identifier for SaaS isolation (empty/null for single-tenant mode). */
  tenantId?: string;
  name: string;
  provider: string;
  baseUrl?: string;
  model?: string;
  temperature?: number;
  hasKey: boolean;
  keyPreview?: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Cold-email intro draft generated for one application ("killer intro" for
 * emailing recruiters / founders / hiring managers about a role).
 */
export interface ColdEmailDraft {
  subject: string;
  body: string;
  /** The single low-friction ask (echoed from the closing line of the body). */
  cta?: string;
  /** The narrative axis the draft was written on. */
  angleUsed?: ColdEmailAngle;
  /** Author-reported body word count; the UI recomputes from `body`. */
  wordCount?: number;
}

/** Cold-email recipient persona the intro is aimed at. */
export type ColdEmailAudience = "recruiter" | "founder" | "hiring_manager";

/** Narrative axis for a cold-email draft (drives which strengths lead). */
export type ColdEmailAngle =
  | "transferable"
  | "depth"
  | "scale"
  | "leadership"
  | "problem_taste";

/** Body length budget for a cold-email draft. */
export type ColdEmailLength = "short" | "standard";

/** The ask style that closes a cold-email draft. */
export type ColdEmailCtaStyle = "call" | "reply" | "coffee_chat";

/**
 * Cover-letter draft generated for one application. The four sections map to
 * the classic letter layout so the web panel can render them independently.
 */
export interface CoverLetterDraft {
  subject: string;
  salutation: string;
  body: string;
  closing: string;
}

/** One stage of a typical interview pipeline for the role. */
export interface InterviewPhase {
  /** e.g. "Recruiter Screen" / "Technical Screen" / "Final Round". */
  name: string;
  /** e.g. "30 min" / "60 min". */
  duration: string;
  /** e.g. "Phone / video" / "Live coding" / "Panel". */
  format: string;
  /** What this phase is for and what is assessed. */
  focus: string;
  /** Questions the candidate can expect in this phase. */
  typicalQuestions: string[];
}

/** One committee seat's expectations plus how they will drill the candidate. */
export interface InterviewExpertDrill {
  /** Seat name (e.g. "Priya"). */
  seat: string;
  /** Seat title (e.g. "Lead Technical Recruiter"). */
  role: string;
  /** What lens this expert evaluates through. */
  lens: string;
  /** Topics / knowledge this expert expects from the candidate. */
  expectations: string[];
  /** How they will drill the candidate (probing questions / tasks). */
  drillQuestions: string[];
  /** Things they will probe that sink a candidate. */
  redFlags: string[];
}

/**
 * The 5-expert interview mock plan (WS: apply the committee debate strategy to
 * interview prep). Lists the typical interview phases for the role, what each
 * of the 5 committee experts expects, how they will drill the candidate based
 * on the JD, and how a typical interview flow plays out.
 */
export interface InterviewPrepPlan {
  /** Human role label the plan is built for. */
  roleLabel: string;
  /** One-two sentence framing of what the interview process looks like. */
  summary: string;
  /** The typical interview pipeline for this role, phase by phase. */
  pipeline: InterviewPhase[];
  /** Per-seat expert expectations and drill plans. */
  experts: InterviewExpertDrill[];
  /** Master knowledge checklist the candidate should be ready for. */
  topics: string[];
  /** Concrete prep advice. */
  prepTips: string[];
}

/** Event pushed to SSE subscribers during a live debate. */
export type JobEvent =
  | { type: "status"; jobId: string; status: JobStatus; message?: string }
  | { type: "phase"; jobId: string; phase: DebatePhase; activity?: string }
  | { type: "entry"; jobId: string; entry: TranscriptEntry }
  | { type: "jdMeta"; jobId: string; jdMeta: JdMeta }
  | { type: "jobDecomposition"; jobId: string; jobDecomposition: JobDecomposition }
  | { type: "analysis"; jobId: string; analysis: SmeAnalysis }
  | { type: "director"; jobId: string; audit: DirectorAudit }
  | { type: "verdict"; jobId: string; verdict: Verdict; tallies: Record<string, number> }
  | { type: "blueprint"; jobId: string; blueprint: Blueprint }
  | { type: "executive"; jobId: string; review: ExecutiveReview }
  | { type: "gapAnalysis"; jobId: string; gapAnalysis: GapAnalysisResult }
  | {
      type: "resume";
      jobId: string;
      rewrittenResume: string;
      rewrittenResumeJson?: string;
      resumeMeta?: ResumeMeta;
    }
  | { type: "coldEmail"; jobId: string; draft: ColdEmailDraft }
  | { type: "coverLetter"; jobId: string; draft: CoverLetterDraft }
  | { type: "interview"; jobId: string; plan: InterviewPrepPlan }
  | { type: "done"; jobId: string; job: JobState }
  | { type: "error"; jobId: string; message: string };
