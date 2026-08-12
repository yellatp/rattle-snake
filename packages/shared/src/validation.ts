import { z } from "zod";
import { DOMAINS, type Domain } from "./types.js";

const domainEnum = z.enum(DOMAINS as [Domain, ...Domain[]]);

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
});

export type CreateJobInput = z.infer<typeof createJobSchema>;

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
  status: z.enum(["pending", "debating", "rewriting", "completed", "failed"]),
  error: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type JobSchema = z.infer<typeof jobSchema>;
