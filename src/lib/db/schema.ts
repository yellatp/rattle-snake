// SQLite schema definitions and migration SQL for Turso/libsql

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  role TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  company TEXT NOT NULL,
  role TEXT NOT NULL,
  jd_text TEXT DEFAULT '',
  jd_url TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'wishlist'
    CHECK (status IN ('wishlist','applied','phone_screen','interview','offer','rejected')),
  salary_min INTEGER,
  salary_max INTEGER,
  location TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS resume_versions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  application_id TEXT,
  template_slug TEXT NOT NULL,
  version_num INTEGER NOT NULL DEFAULT 1,
  content TEXT NOT NULL,
  ats_score INTEGER DEFAULT 0,
  provider_used TEXT DEFAULT '',
  tokens_used INTEGER DEFAULT 0,
  label TEXT DEFAULT '',
  is_active INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS cover_letter_versions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  application_id TEXT,
  content TEXT NOT NULL,
  template_used TEXT NOT NULL DEFAULT 'standard',
  provider_used TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS interview_prep (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  application_id TEXT,
  questions TEXT NOT NULL DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_resume_versions_app ON resume_versions(application_id);
CREATE INDEX IF NOT EXISTS idx_cover_letter_app ON cover_letter_versions(application_id);
CREATE INDEX IF NOT EXISTS idx_interview_prep_app ON interview_prep(application_id);
`;

// TypeScript types mirroring the schema

export interface Template {
  id: string;
  role: string;
  slug: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface Application {
  id: string;
  company: string;
  role: string;
  jd_text: string;
  jd_url: string;
  status: 'wishlist' | 'applied' | 'phone_screen' | 'interview' | 'offer' | 'rejected';
  salary_min?: number;
  salary_max?: number;
  location: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface ResumeVersion {
  id: string;
  application_id?: string;
  template_slug: string;
  version_num: number;
  content: string;
  ats_score: number;
  provider_used: string;
  tokens_used: number;
  label: string;
  is_active: number;
  created_at: string;
}

export interface CoverLetterVersion {
  id: string;
  application_id?: string;
  content: string;
  template_used: string;
  provider_used: string;
  created_at: string;
}

export interface InterviewPrep {
  id: string;
  application_id?: string;
  questions: string;
  created_at: string;
}

export interface Setting {
  key: string;
  value: string;
}

export type ApplicationStatus = Application['status'];

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  wishlist: 'Wishlist',
  applied: 'Applied',
  phone_screen: 'Phone Screen',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
};
