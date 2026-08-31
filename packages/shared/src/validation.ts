import { z } from "zod";
import { DOMAINS, type Domain } from "./types.js";

/**
 * Domain selector accepted when creating a job. The real domain buckets plus
 * "AUTO": with AUTO the role slug resolved from the JD selects the committee
 * and the effective bucket is derived from the JD.
 */
export type CommitteeDomain = Domain | "AUTO";

const domainEnum = z.enum([
  "AI_ENGINEERING",
  "ML_ENGINEERING",
  "SDE",
  "DATA_ENGINEERING",
  "DATA_SCIENCE",
  "CYBERSECURITY",
  "NETWORKING",
  "DEVOPS",
  "PROJECT_MANAGEMENT",
  "AUTO",
] as [CommitteeDomain, ...CommitteeDomain[]]);

/**
 * Bring-your-own-LLM override (BYOK). Sent from the web app per run; the
 * server uses it to build a throwaway client and never persists the key.
 * The API key is used in-memory only.
 */
export const llmOverrideSchema = z.object({
  /** Provider name — any known preset or an unknown name = OpenAI-compatible. */
  provider: z.string().min(1).max(60).optional(),
  baseUrl: z.string().url().max(300).optional(),
  apiKey: z.string().min(1).max(200).optional(),
  model: z.string().min(1).max(120).optional(),
  temperature: z.number().min(0).max(2).optional(),
});

export type LlmOverride = z.infer<typeof llmOverrideSchema>;

/** Non-secret record of which provider/model actually ran an evaluation. */
export const llmUsedSchema = z.object({
  provider: z.string(),
  model: z.string(),
});

export type LlmUsed = z.infer<typeof llmUsedSchema>;

export const confidenceEnum = z.enum(["High", "Medium", "Low"]);

/**
 * Optional artifacts to auto-generate once the committee finishes. Omitted or
 * all-false means every artifact stays on-demand (the historic behavior).
 */
export const generateSchema = z.object({
  resume: z.boolean().optional(),
  coverLetter: z.boolean().optional(),
  coldEmail: z.boolean().optional(),
  interview: z.boolean().optional(),
  /** Controlled-enhancement tier for the resume handoff (Layer 3). */
  enhancementTier: z.enum(["conservative", "balanced", "competitive"]).optional(),
});

export type GenerateOptionsInput = z.infer<typeof generateSchema>;

/** Request body for creating a new committee job. */
export const createJobSchema = z.object({
  domain: domainEnum.optional(),
  jobDescription: z
    .string()
    .min(80, "Job description is too short — paste the full JD.")
    .max(40_000),
  baseResume: z
    .string()
    .min(50, "Resume is too short — paste the full resume.")
    .max(60_000),
  /** Optional override for the Sector Specialist seat. */
  sectorFocus: z
    .string()
    .max(60)
    .optional(),
  /** Role slug (optional). When present it selects a role-driven committee (WS-4). */
  roleSlug: z
    .string()
    .max(40)
    .optional(),
  /** Where the job is based (e.g. "New York, USA" / "London, UK") — drives the US/UK English variant. */
  location: z
    .string()
    .max(120)
    .optional(),
  /** Bring-your-own-LLM: per-run override of the server's env provider. */
  llm: llmOverrideSchema.optional(),
  /** Use a saved LLM connection (key stored server-side, encrypted). */
  llmConnectionId: z.string().min(1).max(80).optional(),
  /** Use a saved candidate profile for generation (defaults to the master). */
  profileId: z.string().min(1).max(80).optional(),
  /** Auto-generate artifacts once the committee finishes (resume -> cold email -> interview). */
  generate: generateSchema.optional(),
});

export type CreateJobInput = z.infer<typeof createJobSchema>;

/** Single-user profile payload (PUT /api/profile, backward-compat). */
export const profileSchema = z.object({
  name: z.string().max(120).default(""),
  email: z.string().max(200).default(""),
});

export type ProfileInput = z.infer<typeof profileSchema>;

const personalInfoSchema = z
  .object({
    firstName: z.string().max(80).optional(),
    middleName: z.string().max(80).optional(),
    lastName: z.string().max(80).optional(),
    email: z.string().max(200).optional(),
    phone: z.string().max(40).optional(),
    location: z.string().max(160).optional(),
    linkedin: z.string().max(300).optional(),
    github: z.string().max(300).optional(),
    portfolio: z.string().max(300).optional(),
    headline: z.string().max(300).optional(),
  })
  .optional();

const profileExperienceSchema = z.object({
  title: z.string().max(120).optional(),
  company: z.string().max(160).optional(),
  location: z.string().max(160).optional(),
  dates: z.string().max(80).optional(),
  isCurrent: z.boolean().optional(),
  locked: z.boolean().optional(),
  bullets: z.array(z.string().max(500)).max(30).optional(),
});

/** Payload for creating a profile (POST /api/profiles). */
export const profileCreateSchema = z.object({
  name: z.string().min(1, "Name is required.").max(120),
  email: z.string().max(200).optional().default(""),
  pin: z.string().max(200).optional(),
});

export type ProfileCreateInput = z.infer<typeof profileCreateSchema>;

/**
 * Payload for updating a profile (PUT /api/profiles/:id). Structured fields
 * are merged into the existing profile; omitting a field leaves it unchanged.
 */
export const profileUpdateSchema = z.object({
  name: z.string().max(120).optional(),
  email: z.string().max(200).optional(),
  personalInfo: personalInfoSchema,
  summary: z.string().max(1200).optional(),
  workAuthorization: z.string().max(200).optional(),
  employmentPreference: z.string().max(200).optional(),
  experience: z.array(profileExperienceSchema).max(40).optional(),
  education: z
    .array(
      z.object({
        degree: z.string().max(160).optional(),
        institution: z.string().max(160).optional(),
        location: z.string().max(160).optional(),
        dates: z.string().max(80).optional(),
      }),
    )
    .max(20)
    .optional(),
  skills: z
    .array(
      z.object({
        name: z.string().max(120).optional(),
        items: z
          .array(z.object({ name: z.string().max(120), isHighlighted: z.boolean().optional() }))
          .max(60)
          .optional(),
      }),
    )
    .max(20)
    .optional(),
  certifications: z.array(z.string().max(200)).max(40).optional(),
  projects: z
    .array(
      z.object({
        name: z.string().max(160).optional(),
        description: z.string().max(500).optional(),
        link: z.string().max(300).optional(),
      }),
    )
    .max(30)
    .optional(),
  publications: z.array(z.string().max(300)).max(30).optional(),
  languages: z.array(z.string().max(80)).max(20).optional(),
  volunteer: z.array(z.string().max(300)).max(20).optional(),
  coreCompetencies: z.array(z.string().max(200)).max(40).optional(),
  workAreas: z.array(z.string().max(120)).max(20).optional(),
  totalWorkExperience: z.string().max(80).optional(),
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

/**
 * Payload for converting a pasted/uploaded resume into a structured candidate
 * profile (POST /api/profile/import-resume). The LLM extracts the fields and
 * the result is stored as profile JSON; the raw text is never persisted.
 */
export const resumeImportSchema = z.object({
  resumeText: z
    .string()
    .min(50, "Resume is too short — paste the full resume.")
    .max(60_000),
});

export type ResumeImportInput = z.infer<typeof resumeImportSchema>;

/** Payload for the optional master-profile PIN (PUT /api/profiles/:id/pin). */
export const profilePinSchema = z.object({
  pin: z.string().max(200),
});

export type ProfilePinInput = z.infer<typeof profilePinSchema>;

/**
 * Payload for promoting a profile to master (PUT /api/profiles/:id/master).
 * `pin` is only required when the target profile is PIN-locked; unlocked
 * profiles promote without one.
 */
export const profileMasterSchema = z.object({
  pin: z.string().max(200).optional(),
});

export type ProfileMasterInput = z.infer<typeof profileMasterSchema>;

/** Saved resume payload. */
export const savedResumeSchema = z.object({
  title: z.string().min(1, "Title is required.").max(120),
  content: z
    .string()
    .min(50, "Resume is too short — paste the full resume.")
    .max(60_000),
});

export type SavedResumeInput = z.infer<typeof savedResumeSchema>;

/** Saved job description payload. */
export const savedJdSchema = z.object({
  title: z.string().min(1, "Title is required.").max(120),
  content: z
    .string()
    .min(80, "Job description is too short — paste the full JD.")
    .max(40_000),
});

export type SavedJdInput = z.infer<typeof savedJdSchema>;

/**
 * LLM connection payload. `apiKey` is optional on create (local providers
 * need none) and on update (omitting it keeps the stored key).
 */
export const llmConnectionSchema = z.object({
  name: z.string().min(1, "Name is required.").max(120),
  provider: z.string().min(1).max(60),
  baseUrl: z.string().url().max(300).optional().nullable(),
  model: z.string().min(1).max(120).optional().nullable(),
  temperature: z.number().min(0).max(2).optional().nullable(),
  apiKey: z.string().min(1).max(200).optional(),
  isDefault: z.boolean().optional(),
});

export type LlmConnectionInput = z.infer<typeof llmConnectionSchema>;

/** Partial update for a saved item or connection. */
export const llmConnectionUpdateSchema = llmConnectionSchema.partial();
export type LlmConnectionUpdateInput = z.infer<typeof llmConnectionUpdateSchema>;

/** Cold-email intro draft generated for one application. */
export const coldEmailSchema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
  cta: z.string().min(1).optional(),
  angleUsed: z
    .enum(["transferable", "depth", "scale", "leadership", "problem_taste"])
    .optional(),
  wordCount: z.number().int().min(0).optional(),
});

export const coldEmailAudienceSchema = z.enum(["recruiter", "founder", "hiring_manager"]);

export const coldEmailAngleSchema = z.enum([
  "transferable",
  "depth",
  "scale",
  "leadership",
  "problem_taste",
]);

export const coldEmailLengthSchema = z.enum(["short", "standard"]);

export const coldEmailCtaStyleSchema = z.enum(["call", "reply", "coffee_chat"]);

export const coldEmailToneSchema = z.enum(["direct", "warm", "bold", "understated"]);

/** Strict output contract for the v2 cold-email content engine. */
export const coldEmailV2Schema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1),
  cta: z.string().min(1),
  angleUsed: coldEmailAngleSchema,
  wordCount: z.number().int().min(0),
});

/** One reviewer seat's structured verdict on a resume version. */
export const resumeEvaluationSchema = z.object({
  scores: z.object({
    jdCoverage: z.number().min(0).max(100),
    credibility: z.number().min(0).max(100),
    clarity: z.number().min(0).max(100),
    atsReadiness: z.number().min(0).max(100),
  }),
  strengths: z.array(z.string().min(1)).max(10),
  issues: z
    .array(
      z.object({
        severity: z.enum(["high", "medium", "low"]),
        section: z.string().min(1),
        finding: z.string().min(1),
        fixHint: z.string().min(1),
      }),
    )
    .max(12),
  verdict: z.enum(["ship", "revise"]),
});

export type ResumeEvaluationInput = z.infer<typeof resumeEvaluationSchema>;

export const resumeAbPhaseSchema = z.enum([
  "v1",
  "eval1",
  "v2",
  "eval2",
  "comparison",
  "done",
]);

/** Deterministic comparison produced in code, never by an LLM. */
export const resumeComparisonSchema = z.object({
  v1Total: z.number().min(0).max(100),
  v2Total: z.number().min(0).max(100),
  dimensionDeltas: z.record(z.string(), z.number()),
  recommendation: z.enum(["v1", "v2", "tie"]),
  rationale: z.string().min(1),
});

export type ResumeComparisonInput = z.infer<typeof resumeComparisonSchema>;

/** Cover-letter draft generated for one application. */
export const coverLetterSchema = z.object({
  subject: z.string().min(1),
  salutation: z.string().min(1),
  body: z.string().min(1),
  closing: z.string().min(1),
});

/** One interview pipeline phase. */
export const interviewPhaseSchema = z.object({
  name: z.string(),
  duration: z.string(),
  format: z.string(),
  focus: z.string(),
  typicalQuestions: z.array(z.string()),
});

/** One committee seat's interview drill. */
export const interviewExpertDrillSchema = z.object({
  seat: z.string(),
  role: z.string(),
  lens: z.string(),
  expectations: z.array(z.string()),
  drillQuestions: z.array(z.string()),
  redFlags: z.array(z.string()),
});

/** The 5-expert interview mock plan. */
export const interviewPrepPlanSchema = z.object({
  roleLabel: z.string(),
  summary: z.string(),
  pipeline: z.array(interviewPhaseSchema),
  experts: z.array(interviewExpertDrillSchema),
  topics: z.array(z.string()),
  prepTips: z.array(z.string()),
});

export const transcriptEntrySchema = z.object({
  id: z.string(),
  sender: z.string(),
  role: z.string(),
  round: z.union([z.number().int().min(1), z.literal("ballot")]),
  text: z.string(),
  decision: z.enum(["HIRE", "REJECT"]).optional(),
  decisionReason: z.string().optional(),
  confidence: confidenceEnum.optional(),
  createdAt: z.string(),
});

/** One authenticity / "reads-like" flag with a severity. */
export const authenticityFlagSchema = z.object({
  flag: z.string(),
  severity: z.enum(["low", "medium", "high"]),
});

/** One concrete business problem the JD implies the company is solving. */
export const businessProblemSchema = z.object({
  problem: z.string(),
  detail: z.string().default(""),
  mappedRequirement: z.string().default(""),
});

/** Structured job-decomposition brief shared by every committee seat. */
export const jobDecompositionSchema = z.object({
  level: z.string().default(""),
  seniorityExpectation: z.string().default(""),
  screeningFilters: z.array(z.string()).default([]),
  mustHave: z.array(z.string()).default([]),
  niceToHave: z.array(z.string()).default([]),
  stackWords: z.array(z.string()).default([]),
  businessProblems: z.array(businessProblemSchema).default([]),
  domainConstraints: z.array(z.string()).default([]),
  businessContext: z.string().default(""),
});

export type JobDecompositionInput = z.infer<typeof jobDecompositionSchema>;

/** One scored 0-10 dimension in the executive review. */
export const executiveScoreSchema = z.object({
  score: z.number().min(0).max(10).default(0),
  note: z.string().default(""),
});

/** The executive moderator's advisory review (plan §3.6). */
export const executiveReviewSchema = z.object({
  persona: z.enum(["CTO", "CFO", "CMO", "CISO", "CDO", "COO", "CPO", "CEO"]).default("CEO"),
  company: z.string().default(""),
  debateRelevance: executiveScoreSchema.default({ score: 0, note: "" }),
  roleAlignment: executiveScoreSchema.default({ score: 0, note: "" }),
  growthAlignment: executiveScoreSchema.default({ score: 0, note: "" }),
  requirementAssessment: z.string().default(""),
  conditionsToHire: z.array(z.string()).default([]),
  opinion: z.enum(["FAVORABLE", "NEUTRAL", "UNFAVORABLE"]),
  opinionReason: z.string().default(""),
  summary: z.string().default(""),
});

export type ExecutiveReviewInput = z.infer<typeof executiveReviewSchema>;

/** One panel-flagged inflated / un-evidenced claim (Layer 1 + blueprint). */
export const inflatedClaimSchema = z.object({
  claim: z.string(),
  evidence: z.string(),
  severity: z.enum(["low", "medium", "high"]).default("medium"),
});

/** One JD requirement triaged by tier (only "must"/"preferred" justify enhancement). */
export const jdRequirementSchema = z.object({
  requirement: z.string(),
  tier: z.enum(["must", "preferred", "aspirational"]).default("preferred"),
});

export const blueprintSchema = z.object({
  objections: z.array(z.string()),
  strengths: z.array(z.string()),
  requiredChanges: z.array(z.string()),
  sectorNotes: z.array(z.string()),
  pivotFactors: z.array(z.string()),
  verdicts: z.record(z.string(), z.enum(["HIRE", "REJECT"])),
  consensus: z.enum(["SHORTLISTED", "REJECTED"]),
  credibilityFindings: z.array(z.string()).default([]),
  authenticityFlags: z.array(authenticityFlagSchema).default([]),
  missingSkillsRanked: z
    .array(
      z.object({
        skill: z.string(),
        severity: z.enum(["low", "medium", "high"]),
      }),
    )
    .default([]),
  requirementMap: z
    .array(
      z.object({
        requirement: z.string(),
        evidence: z.string(),
        status: z.enum(["proven", "partial", "missing", "unverifiable"]),
        action: z.string(),
      }),
    )
    .default([]),
  inflatedClaims: z.array(inflatedClaimSchema).default([]),
  jdRequirements: z.array(jdRequirementSchema).default([]),
});

// ── Gap Analysis schemas (Phase O) ──────────────────────────────────────────

export const mustHaveGapSchema = z.object({
  item: z.string(),
  evidenceStatus: z.enum(["Missing", "Weak", "Partial"]),
  impact: z.enum(["High", "Medium", "Low"]),
  notes: z.string(),
});

export const niceToHaveGapSchema = z.object({
  item: z.string(),
  evidenceStatus: z.enum(["Missing", "Weak", "Transferable"]),
  transferableFrom: z.string().nullable(),
  notes: z.string(),
});

export const strongMatchSchema = z.object({
  item: z.string(),
  notes: z.string(),
});

export const gapInflatedClaimSchema = z.object({
  claim: z.string(),
  severity: z.enum(["High", "Medium", "Low"]),
  panelNote: z.string(),
});

export const gapAnalysisSchema = z.object({
  mustHaveGaps: z.array(mustHaveGapSchema).default([]),
  niceToHaveGaps: z.array(niceToHaveGapSchema).default([]),
  strongMatches: z.array(strongMatchSchema).default([]),
  inflatedClaims: z.array(gapInflatedClaimSchema).default([]),
  overallReadiness: z.enum(["Strong Match", "Partial Match", "Significant Gaps"]),
  summary: z.string(),
});

export const enhancementSuggestionSchema = z.object({
  id: z.string(),
  category: z.enum([
    "Reframe Early Role",
    "Elevate Theme",
    "Transferable Skill",
    "Add Specificity",
    "Soften Claim",
    "Move Skill to Proof",
    "Other",
  ]),
  suggestion: z.string(),
  justification: z.string(),
  risk: z.enum(["Low", "Medium", "High"]),
  targetSection: z.enum([
    "Most Recent Role",
    "Second Role",
    "Earlier Role",
    "Summary",
    "Skills",
    "Other",
  ]),
  proposedChange: z.string(),
  jdThemeAddressed: z.string(),
});

export const gapAnalysisResultSchema = z.object({
  gapAnalysis: gapAnalysisSchema,
  suggestions: z.array(enhancementSuggestionSchema).default([]),
  priorityActions: z.array(z.string()).default([]),
});

export type GapAnalysisResultInput = z.infer<typeof gapAnalysisResultSchema>;

/** One item of the Director's fairness audit (Layer 2). */
export const directorFindingSchema = z.object({
  factor: z.string(),
  passed: z.boolean(),
  note: z.string().default(""),
});

export const directorAuditSchema = z.object({
  fair: z.boolean().default(true),
  items: z.array(directorFindingSchema).default([]),
  passes: z.boolean().default(true),
  revoteFactor: z.string().optional(),
  needsHumanReview: z.boolean().optional(),
});

export type DirectorAuditInput = z.infer<typeof directorAuditSchema>;

/** Concrete metadata extracted from the JD at run start. */
export const jdMetaSchema = z.object({
  company: z.string().default(""),
  role: z.string().default(""),
  sector: z.string().default(""),
  location: z.string().default(""),
  team: z.string().default(""),
  roleSlug: z.string().optional(),
});

export type JdMetaInput = z.infer<typeof jdMetaSchema>;

/** One scored factor in an SME panelist's 360-degree analysis. */
export const smeFactorScoreSchema = z.object({
  factor: z.string(),
  score: z.number().min(0).max(5),
  note: z.string(),
});

/** One SME panelist's 360-degree candidate analysis (persisted on the job). */
export const smeAnalysisSchema = z.object({
  seat: z.string(),
  role: z.string(),
  fitScore: z.number().min(0).max(10),
  factors: z.array(smeFactorScoreSchema),
  strengths: z.array(z.string()),
  concerns: z.array(z.string()),
  decision: z.enum(["HIRE", "REJECT"]),
  decisionReason: z.string(),
  pivotFactor: z.string(),
  hireReasons: z.array(z.string()).default([]),
  rejectReasons: z.array(z.string()).default([]),
  missingSkills: z.array(z.string()).default([]),
  authenticityFlags: z.array(authenticityFlagSchema).default([]),
  credibilityFindings: z.array(z.string()).default([]),
  businessAssessment: z.string().default(""),
  confidence: confidenceEnum.optional(),
  inflatedClaims: z.array(z.string()).default([]),
});

export type SmeAnalysisInput = z.infer<typeof smeAnalysisSchema>;

/**
 * Opening-turn response shape: the 360-degree analysis plus the prose opening
 * argument and the forced decision, returned as one JSON object.
 */
export const smeOpeningResponseSchema = z.object({
  analysis: z.object({
    fitScore: z.number().min(0).max(10),
    factors: z.array(smeFactorScoreSchema),
    strengths: z.array(z.string()),
    concerns: z.array(z.string()),
    hireReasons: z.array(z.string()).default([]),
    rejectReasons: z.array(z.string()).default([]),
    missingSkills: z.array(z.string()).default([]),
    authenticityFlags: z.array(authenticityFlagSchema).default([]),
    credibilityFindings: z.array(z.string()).default([]),
    businessAssessment: z.string().default(""),
    confidence: confidenceEnum.optional(),
    inflatedClaims: z.array(z.string()).default([]),
  }),
  opening: z.string(),
  decision: z.enum(["HIRE", "REJECT"]),
  decisionReason: z.string(),
  pivotFactor: z.string(),
});

export type SmeOpeningResponse = z.infer<typeof smeOpeningResponseSchema>;


export const resumeMetaSchema = z
  .object({
    role: z.string(),
    roleLabel: z.string(),
    atsScore: z.number().min(0).max(100),
    moderationScore: z.number().min(0).max(100),
    moderationApproved: z.boolean(),
    iterations: z.number().int().min(1),
    locale: z.enum(["us", "uk"]).optional(),
    screeningCoverage: z
      .object({ matched: z.number().int().min(0), total: z.number().int().min(0) })
      .optional(),
    atsScoreNote: z.string().optional(),
    moderator: z.unknown().optional(),
    enhancementTier: z.enum(["conservative", "balanced", "competitive"]).optional(),
    enhancements: z.array(z.unknown()).optional(),
  })
  .passthrough();
export const jobSchema = z.object({
  id: z.string(),
  tenantId: z.string().optional(),
  domain: domainEnum,
  roleSlug: z.string().optional(),
  jobDescription: z.string(),
  baseResume: z.string(),
  sectorFocus: z.string().optional(),
  jobLocation: z.string().optional(),
  profileId: z.string().optional(),
  transcript: z.array(transcriptEntrySchema),
  jdMeta: jdMetaSchema.optional(),
  jobDecomposition: jobDecompositionSchema.optional(),
  analyses: z.array(smeAnalysisSchema).optional(),
  finalVerdict: z.enum(["SHORTLISTED", "REJECTED"]).optional(),
  blueprint: blueprintSchema.optional(),
  directorAudit: directorAuditSchema.optional(),
  executiveReview: executiveReviewSchema.optional(),
  gapAnalysis: gapAnalysisResultSchema.optional(),
  amendmentNotes: z.string().optional(),
  phase: z
    .enum([
      "queued",
      "jdMeta",
      "decomposition",
      "panel",
      "opening",
      "crosstalk",
      "ballot",
      "blueprint",
      "director",
      "executive",
      "gapAnalysis",
      "chain",
      "done",
    ])
    .optional(),
  activity: z.string().optional(),
  rewrittenResume: z.string().optional(),
  rewrittenResumeJson: z.string().optional(),
  resumeMeta: resumeMetaSchema.optional(),
  generate: generateSchema.optional(),
  coldEmailDraft: coldEmailSchema.optional(),
  coverLetterDraft: coverLetterSchema.optional(),
  interviewPlan: interviewPrepPlanSchema.optional(),
  llmUsed: llmUsedSchema.optional(),
  status: z.enum(["pending", "debating", "completed", "failed", "cancelled"]),
  error: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type JobSchema = z.infer<typeof jobSchema>;

