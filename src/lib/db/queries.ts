// Browser-side SQLite abstraction using localStorage as persistence layer.
// For production Turso usage, swap the driver but keep the same query interface.

import type {
  Application, ResumeVersion, CoverLetterVersion, InterviewPrep, Setting
} from './schema';

// ─── Simple in-browser store (replaces Turso for static deployment) ─────────

function getStore<T>(key: string): T[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(`rf_${key}`) ?? '[]');
  } catch {
    return [];
  }
}

function setStore<T>(key: string, data: T[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(`rf_${key}`, JSON.stringify(data));
}

function uid(): string {
  return crypto.randomUUID();
}

function now(): string {
  return new Date().toISOString();
}

// ─── Applications ────────────────────────────────────────────────────────────

export function getApplications(): Application[] {
  return getStore<Application>('applications');
}

export function getApplication(id: string): Application | undefined {
  return getApplications().find(a => a.id === id);
}

export function createApplication(data: Omit<Application, 'id' | 'created_at' | 'updated_at'>): Application {
  const app: Application = { ...data, id: uid(), created_at: now(), updated_at: now() };
  const all = getApplications();
  setStore('applications', [...all, app]);
  return app;
}

export function updateApplication(id: string, data: Partial<Application>): Application | undefined {
  const all = getApplications();
  const idx = all.findIndex(a => a.id === id);
  if (idx === -1) return undefined;
  const updated = { ...all[idx], ...data, updated_at: now() };
  all[idx] = updated;
  setStore('applications', all);
  return updated;
}

export function deleteApplication(id: string): void {
  setStore('applications', getApplications().filter(a => a.id !== id));
}

// ─── Resume Versions ─────────────────────────────────────────────────────────

export function getResumeVersions(applicationId?: string): ResumeVersion[] {
  const all = getStore<ResumeVersion>('resume_versions');
  return applicationId ? all.filter(v => v.application_id === applicationId) : all;
}

export function getResumeVersion(id: string): ResumeVersion | undefined {
  return getStore<ResumeVersion>('resume_versions').find(v => v.id === id);
}

export function createResumeVersion(data: Omit<ResumeVersion, 'id' | 'created_at'>): ResumeVersion {
  const all = getStore<ResumeVersion>('resume_versions');
  const appVersions = data.application_id
    ? all.filter(v => v.application_id === data.application_id)
    : [];
  const version_num = appVersions.length > 0
    ? Math.max(...appVersions.map(v => v.version_num)) + 1
    : 1;
  const v: ResumeVersion = { ...data, version_num, id: uid(), created_at: now() };
  setStore('resume_versions', [...all, v]);
  return v;
}

export function updateResumeVersion(id: string, data: Partial<ResumeVersion>): void {
  const all = getStore<ResumeVersion>('resume_versions');
  const idx = all.findIndex(v => v.id === id);
  if (idx !== -1) {
    all[idx] = { ...all[idx], ...data };
    setStore('resume_versions', all);
  }
}

export function deleteResumeVersion(id: string): void {
  setStore('resume_versions', getStore<ResumeVersion>('resume_versions').filter(v => v.id !== id));
}

// ─── Cover Letters ────────────────────────────────────────────────────────────

export function getCoverLetters(applicationId?: string): CoverLetterVersion[] {
  const all = getStore<CoverLetterVersion>('cover_letters');
  return applicationId ? all.filter(c => c.application_id === applicationId) : all;
}

export function createCoverLetter(data: Omit<CoverLetterVersion, 'id' | 'created_at'>): CoverLetterVersion {
  const cl: CoverLetterVersion = { ...data, id: uid(), created_at: now() };
  setStore('cover_letters', [...getStore<CoverLetterVersion>('cover_letters'), cl]);
  return cl;
}

export function deleteCoverLetter(id: string): void {
  setStore('cover_letters', getStore<CoverLetterVersion>('cover_letters').filter(c => c.id !== id));
}

// ─── Interview Prep ───────────────────────────────────────────────────────────

export function getInterviewPreps(applicationId?: string): InterviewPrep[] {
  const all = getStore<InterviewPrep>('interview_prep');
  return applicationId ? all.filter(p => p.application_id === applicationId) : all;
}

export function createInterviewPrep(data: Omit<InterviewPrep, 'id' | 'created_at'>): InterviewPrep {
  const prep: InterviewPrep = { ...data, id: uid(), created_at: now() };
  setStore('interview_prep', [...getStore<InterviewPrep>('interview_prep'), prep]);
  return prep;
}

export function deleteInterviewPrep(id: string): void {
  setStore('interview_prep', getStore<InterviewPrep>('interview_prep').filter(p => p.id !== id));
}

// ─── Recent JDs ──────────────────────────────────────────────────────────────

export interface RecentJD {
  id: string;
  company: string;
  roleTitle: string;
  jobDescription: string;
  savedAt: string;
}

export function getRecentJDs(): RecentJD[] {
  return getStore<RecentJD>('recent_jds');
}

export function addRecentJD(data: { company: string; roleTitle: string; jobDescription: string }): RecentJD {
  const existing = getRecentJDs();
  const dedupKey = `${data.company.toLowerCase().trim()}|${data.roleTitle.toLowerCase().trim()}`;
  const filtered = existing.filter(j =>
    `${j.company.toLowerCase().trim()}|${j.roleTitle.toLowerCase().trim()}` !== dedupKey
  );
  const entry: RecentJD = { ...data, id: uid(), savedAt: now() };
  setStore('recent_jds', [entry, ...filtered].slice(0, 8));
  return entry;
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export function getSetting(key: string): string | null {
  const all = getStore<Setting>('settings');
  return all.find(s => s.key === key)?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  const all = getStore<Setting>('settings').filter(s => s.key !== key);
  setStore('settings', [...all, { key, value }]);
}

export function getSettings(): Record<string, string> {
  return Object.fromEntries(getStore<Setting>('settings').map(s => [s.key, s.value]));
}
