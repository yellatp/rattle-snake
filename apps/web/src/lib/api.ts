import type {
  Blueprint,
  ColdEmailAudience,
  ColdEmailDraft,
  CoverLetterDraft,
  EnhancementTier,
  GenerateOptions,
  InterviewPrepPlan,
  JobState,
  LlmConnection,
  LlmConnectionInput,
  LlmConnectionUpdateInput,
  LlmOverride,
  ProfileCreateInput,
  ProfilePinInput,
  ProfileUpdateInput,
  ResumeMeta,
  ResumeTemplateInfo,
  SavedJd,
  SavedJdInput,
  SavedResume,
  SavedResumeInput,
  TranscriptEntry,
  UserProfile,
  Verdict,
} from "@rattlesnake/shared";

export const API_URL: string =
  import.meta.env.PUBLIC_API_URL ?? "http://localhost:8787";

export interface CreateJobPayload {
  domain?: string;
  jobDescription: string;
  baseResume: string;
  location?: string;
  profileId?: string;
  generate?: GenerateOptions;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${detail.slice(0, 300)}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function createJob(payload: CreateJobPayload): Promise<JobState> {
  return request<JobState>("/api/jobs", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listJobs(): Promise<JobState[]> {
  const data = await request<{ jobs: JobState[] }>("/api/jobs");
  return data.jobs;
}

export function getJob(id: string, signal?: AbortSignal): Promise<JobState> {
  return request<JobState>(`/api/jobs/${id}`, signal ? { signal } : undefined);
}

/** Persist manual edits made in the resume JSON editor (Markdown is re-rendered server-side). */
export function updateJobResume(
  id: string,
  input: { rewrittenResumeJson: string },
): Promise<JobState> {
  return request<JobState>(`/api/jobs/${id}/resume`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function streamUrl(jobId: string): string {
  return `${API_URL}/api/jobs/${jobId}/stream`;
}

/** Delete a run from the store, including its auto-saved export dossier. */
export function deleteJob(id: string): Promise<void> {
  return request<void>(`/api/jobs/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export interface StorageRun {
  jobId: string;
  company: string;
  role: string;
  status: string;
  verdict: string | null;
  transcriptLength: number;
  hasDiscussion: boolean;
  hasResume: boolean;
  hasCoverLetter: boolean;
  hasInterview: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StorageGroup {
  company: string;
  role: string;
  runs: StorageRun[];
}

export interface StorageProfile {
  profile: { id: string; name: string; isMaster: boolean };
  groups: StorageGroup[];
}

export interface StorageResponse {
  profiles: StorageProfile[];
  unassigned: StorageGroup[];
}

/** Profile-centric storage: previous discussions + resumes grouped by profile, company, and role. */
export async function listStorage(): Promise<StorageResponse> {
  return request<StorageResponse>("/api/storage");
}

/** Terminate a live committee run (cooperative: stops at the next seat boundary). */
export function cancelJob(id: string): Promise<{ cancelled: boolean }> {
  return request<{ cancelled: boolean }>(`/api/jobs/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

/** Save user-provided amendment notes that guide resume generation. */
export function updateJobAmendmentNotes(id: string, notes: string): Promise<void> {
  return request<void>(`/api/jobs/${id}/amendment-notes`, {
    method: "PATCH",
    body: JSON.stringify({ amendmentNotes: notes }),
  });
}

export interface GenerateResumeRequest {
  roleSlug?: string;
  enhancementTier?: EnhancementTier;
}

export interface GenerateResumeResult {
  markdown: string;
  json: string;
  meta: ResumeMeta;
}

/**
 * On-demand resume generation for a completed run (WS-8 handoff). The debate
 * never rewrites a resume automatically — call this explicitly from the Resume
 * Generation page, optionally with a role template override.
 */
export function generateResume(
  jobId: string,
  input: GenerateResumeRequest = {},
): Promise<GenerateResumeResult> {
  return request<GenerateResumeResult>(`/api/jobs/${jobId}/resume/generate`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// --- Cold email + interview mock + cover letter -----------------------------------

export interface ColdEmailRequest {
  audience?: ColdEmailAudience;
  tone?: string;
  targetName?: string;
}

export function generateColdEmail(
  jobId: string,
  input: ColdEmailRequest,
): Promise<ColdEmailDraft> {
  return request<ColdEmailDraft>(`/api/jobs/${jobId}/cold-email`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function generateCoverLetter(jobId: string): Promise<CoverLetterDraft> {
  return request<CoverLetterDraft>(`/api/jobs/${jobId}/cover-letter`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function generateInterviewMock(
  jobId: string,
  input: { audience?: ColdEmailAudience } = {},
): Promise<InterviewPrepPlan> {
  return request<InterviewPrepPlan>(`/api/jobs/${jobId}/interview-mock`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// --- Resume template catalog ---------------------------------------------------

export async function listTemplates(): Promise<ResumeTemplateInfo[]> {
  const data = await request<{ items: ResumeTemplateInfo[] }>("/api/resume/templates");
  return data.items;
}

// --- Profile ----------------------------------------------------------------

export function getProfile(): Promise<UserProfile> {
  return request<UserProfile>("/api/profile");
}

export function saveProfile(input: {
  name: string;
  email: string;
}): Promise<UserProfile> {
  return request<UserProfile>("/api/profile", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function listProfiles(): Promise<UserProfile[]> {
  const data = await request<{ items: UserProfile[] }>("/api/profiles");
  return data.items;
}

export function createProfile(input: ProfileCreateInput): Promise<UserProfile> {
  return request<UserProfile>("/api/profiles", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateProfile(
  id: string,
  input: ProfileUpdateInput,
): Promise<UserProfile> {
  return request<UserProfile>(`/api/profiles/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function setProfilePin(
  id: string,
  input: ProfilePinInput,
): Promise<UserProfile> {
  return request<UserProfile>(`/api/profiles/${id}/pin`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function setMasterProfile(
  id: string,
  input?: ProfilePinInput,
): Promise<UserProfile> {
  return request<UserProfile>(`/api/profiles/${id}/master`, {
    method: "PUT",
    body: JSON.stringify(input ?? {}),
  });
}

export function deleteProfile(id: string): Promise<void> {
  return request<void>(`/api/profiles/${id}`, { method: "DELETE" });
}

/**
 * Convert pasted/uploaded resume text into a structured candidate profile
 * (JSON) using the Settings default LLM connection. The raw text is never
 * persisted; the extracted fields are returned for the profile editor.
 */
export function importResume(resumeText: string): Promise<ProfileUpdateInput> {
  return request<ProfileUpdateInput>("/api/profile/import-resume", {
    method: "POST",
    body: JSON.stringify({ resumeText }),
  });
}

// --- Saved resumes ------------------------------------------------------------

export async function listResumes(): Promise<SavedResume[]> {
  const data = await request<{ items: SavedResume[] }>("/api/resumes");
  return data.items;
}

export function createResume(input: SavedResumeInput): Promise<SavedResume> {
  return request<SavedResume>("/api/resumes", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateResume(id: string, input: SavedResumeInput): Promise<SavedResume> {
  return request<SavedResume>(`/api/resumes/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteResume(id: string): Promise<void> {
  return request<void>(`/api/resumes/${id}`, { method: "DELETE" });
}

// --- Saved JDs ----------------------------------------------------------------

export async function listJds(): Promise<SavedJd[]> {
  const data = await request<{ items: SavedJd[] }>("/api/jds");
  return data.items;
}

export function createJd(input: SavedJdInput): Promise<SavedJd> {
  return request<SavedJd>("/api/jds", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateJd(id: string, input: SavedJdInput): Promise<SavedJd> {
  return request<SavedJd>(`/api/jds/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteJd(id: string): Promise<void> {
  return request<void>(`/api/jds/${id}`, { method: "DELETE" });
}

// --- LLM connections --------------------------------------------------------------

export async function listConnections(): Promise<LlmConnection[]> {
  const data = await request<{ items: LlmConnection[] }>("/api/llm-connections");
  return data.items;
}

export function createConnection(input: LlmConnectionInput): Promise<LlmConnection> {
  return request<LlmConnection>("/api/llm-connections", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateConnection(
  id: string,
  input: LlmConnectionUpdateInput,
): Promise<LlmConnection> {
  return request<LlmConnection>(`/api/llm-connections/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteConnection(id: string): Promise<void> {
  return request<void>(`/api/llm-connections/${id}`, { method: "DELETE" });
}

export type {
  Blueprint,
  ColdEmailAudience,
  ColdEmailDraft,
  CoverLetterDraft,
  EnhancementTier,
  GenerateOptions,
  InterviewPrepPlan,
  JobState,
  LlmConnection,
  LlmOverride,
  ProfileCreateInput,
  ProfileUpdateInput,
  ResumeMeta,
  ResumeTemplateInfo,
  SavedJd,
  SavedResume,
  TranscriptEntry,
  UserProfile,
  Verdict,
};
