import { z } from "zod";
import { DOMAINS, type Domain } from "./types.js";

const domainEnum = z.enum(DOMAINS as [Domain, ...Domain[]]);

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
  /** Bring-your-own-LLM: per-run override of the server's env provider. */
  llm: llmOverrideSchema.optional(),
  /** Use a saved LLM connection (key stored server-side, encrypted). */
  llmConnectionId: z.string().min(1).max(80).optional(),
});

export type CreateJobInput = z.infer<typeof createJobSchema>;

/** Single-user profile payload (PUT /api/profile). */
export const profileSchema = z.object({
  name: z.string().max(120).default(""),
  email: z.string().max(200).default(""),
});

export type ProfileInput = z.infer<typeof profileSchema>;

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

export const transcriptEntrySchema = z.object({
  id: z.string(),
  sender: z.string(),
  role: z.string(),
  round: z.union([z.number().int().min(1), z.literal("ballot")]),
  text: z.string(),
  decision: z.enum(["HIRE", "REJECT"]).optional(),
  decisionReason: z.string().optional(),
  createdAt: z.string(),
});

export const blueprintSchema = z.object({
  objections: z.array(z.string()),
  strengths: z.array(z.string()),
  requiredChanges: z.array(z.string()),
  sectorNotes: z.array(z.string()),
  pivotFactors: z.array(z.string()),
  verdicts: z.record(z.string(), z.enum(["HIRE", "REJECT"])),
  consensus: z.enum(["SHORTLISTED", "REJECTED"]),
});

export const jobSchema = z.object({
  id: z.string(),
  domain: domainEnum,
  jobDescription: z.string(),
  baseResume: z.string(),
  sectorFocus: z.string().optional(),
  transcript: z.array(transcriptEntrySchema),
  finalVerdict: z.enum(["SHORTLISTED", "REJECTED"]).optional(),
  blueprint: blueprintSchema.optional(),
  rewrittenResume: z.string().optional(),
  llmUsed: llmUsedSchema.optional(),
  status: z.enum(["pending", "debating", "rewriting", "completed", "failed"]),
  error: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type JobSchema = z.infer<typeof jobSchema>;
