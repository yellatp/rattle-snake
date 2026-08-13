import type {
  Blueprint,
  JobState,
  LlmConnection,
  LlmConnectionInput,
  LlmConnectionUpdateInput,
  LlmOverride,
  ResumeMeta,
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
  sectorFocus?: string;
  location?: string;
  llm?: LlmOverride;
  llmConnectionId?: string;
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

export function getJob(id: string): Promise<JobState> {
  return request<JobState>(`/api/jobs/${id}`);
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

// --- Profile -----------------------------------------------------------------

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
  JobState,
  LlmConnection,
  LlmOverride,
  ResumeMeta,
  SavedJd,
  SavedResume,
  TranscriptEntry,
  UserProfile,
  Verdict,
};
