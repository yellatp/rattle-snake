import type {
  Blueprint,
  JobState,
  TranscriptEntry,
  Verdict,
} from "@rattlesnake/shared";

export const API_URL: string =
  import.meta.env.PUBLIC_API_URL ?? "http://localhost:8787";

export interface CreateJobPayload {
  domain?: string;
  jobDescription: string;
  baseResume: string;
  sectorFocus?: string;
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

export function streamUrl(jobId: string): string {
  return `${API_URL}/api/jobs/${jobId}/stream`;
}

export type { Blueprint, JobState, TranscriptEntry, Verdict };
