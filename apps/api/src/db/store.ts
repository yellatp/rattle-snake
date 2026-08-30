import Database from "better-sqlite3";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type {
  Blueprint,
  ColdEmailDraft,
  CoverLetterDraft,
  InterviewPrepPlan,
  JdMeta,
  JobState,
  LlmConnection,
  LlmConnectionInput,
  LlmConnectionUpdateInput,
  ProfileCreateInput,
  ProfileInput,
  ProfileUpdateInput,
  ResumeMeta,
  SavedJd,
  SavedJdInput,
  SavedResume,
  SavedResumeInput,
  SmeAnalysis,
  TranscriptEntry,
  UserProfile,
} from "@rattlesnake/shared";
import type { Webhook, WebhookInput, WebhookUpdateInput, WebhookWithSecret } from "../webhooks/types.js";
import {
  decryptSecret,
  encryptSecret,
  loadOrCreateSecret,
  maskKey,
} from "../security/crypto.js";
import { resumeToMarkdown } from "../resume/serialize.js";
import type { ResumeTemplate } from "../resume/types.js";

function newId(prefix: string): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

interface JobRow {
  id: string;
  tenant_id: string | null;
  domain: string;
  role_slug: string | null;
  job_description: string;
  base_resume: string;
  sector_focus: string | null;
  job_location: string | null;
  profile_id: string | null;
  transcript: string;
  gap_analysis: string | null;
  amendment_notes: string | null;
  jd_meta: string | null;
  job_decomposition: string | null;
  analyses: string | null;
  final_verdict: string | null;
  blueprint: string | null;
  executive_review: string | null;
  rewritten_resume: string | null;
  rewritten_resume_json: string | null;
  resume_meta: string | null;
  generate: string | null;
  cold_email_draft: string | null;
  cover_letter_draft: string | null;
  interview_plan: string | null;
  llm_used: string | null;
  phase: string | null;
  activity: string | null;
  status: string;
  error: string | null;
  created_at: string;
  updated_at: string;
}

interface LlmConnectionRow {
  id: string;
  tenant_id: string | null;
  name: string;
  provider: string;
  base_url: string | null;
  model: string | null;
  temperature: number | null;
  api_key_encrypted: string | null;
  is_default: number;
  created_at: string;
  updated_at: string;
}

interface WebhookRow {
  id: string;
  tenant_id: string | null;
  url: string;
  events: string;
  secret: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

function parseJSON<T>(raw: string | null): T | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

/** Lean per-run projection for list views; never contains heavy artifacts. */
export interface JobRunSummary {
  id: string;
  tenantId?: string;
  domain: JobState["domain"];
  roleSlug?: string;
  profileId?: string;
  status: JobState["status"];
  phase?: JobState["phase"];
  finalVerdict?: JobState["finalVerdict"];
  jdMeta?: JdMeta;
  transcriptLength: number;
  hasResume: boolean;
  hasCoverLetter: boolean;
  hasInterview: boolean;
  createdAt: string;
  updatedAt: string;
}

function requireJSON<T>(raw: string | null, fallback: T): T {
  return parseJSON<T>(raw) ?? fallback;
}

const MAX_PROFILES_PER_TENANT = 7;

/**
 * SQLite persistence for jobs, full debate transcripts, the user profile,
 * saved resumes/JDs, and encrypted LLM API connections.
 * Swap the implementation for Postgres/Redis later without touching callers.
 */
export class JobStore {
  private db: Database.Database;
  private readonly secret: string;

  constructor(dbPath: string) {
    mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    // Master secret for encrypting LLM API keys at rest. In-memory for
    // throwaway DBs (":memory:"), a 0600 file next to the DB otherwise.
    this.secret =
      dbPath === ":memory:"
        ? randomBytes(32).toString("hex")
        : loadOrCreateSecret(path.dirname(dbPath));
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        domain TEXT NOT NULL,
        role_slug TEXT,
        job_description TEXT NOT NULL,
        base_resume TEXT NOT NULL,
        sector_focus TEXT,
        job_location TEXT,
        transcript TEXT NOT NULL DEFAULT '[]',
        jd_meta TEXT,
        job_decomposition TEXT,
        analyses TEXT,
        final_verdict TEXT,
        blueprint TEXT,
        executive_review TEXT,
        rewritten_resume TEXT,
        rewritten_resume_json TEXT,
        resume_meta TEXT,
        generate TEXT,
        cold_email_draft TEXT,
        cover_letter_draft TEXT,
        interview_plan TEXT,
        gap_analysis TEXT,
        amendment_notes TEXT,
        phase TEXT,
        activity TEXT,
        status TEXT NOT NULL,
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS profile (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        name TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        name TEXT NOT NULL,
        email TEXT NOT NULL DEFAULT '',
        data TEXT NOT NULL DEFAULT '{}',
        is_master INTEGER NOT NULL DEFAULT 0,
        pin_hash TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS saved_resumes (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS saved_jds (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS llm_connections (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        name TEXT NOT NULL,
        provider TEXT NOT NULL DEFAULT 'custom',
        base_url TEXT,
        model TEXT,
        temperature REAL,
        api_key_encrypted TEXT,
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS webhooks (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        url TEXT NOT NULL,
        events TEXT NOT NULL,
        secret TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_jobs_tenant ON jobs(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
      CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(created_at);
      CREATE INDEX IF NOT EXISTS idx_profiles_master ON profiles(is_master);
      CREATE INDEX IF NOT EXISTS idx_webhooks_tenant ON webhooks(tenant_id);
    `);
    // Migration for DBs created before the bring-your-own-LLM feature.
    // SQLite has no "ADD COLUMN IF NOT EXISTS", so ignore the duplicate error.
    try {
      this.db.exec(`ALTER TABLE jobs ADD COLUMN llm_used TEXT`);
    } catch {
      /* column already exists */
    }
    // Migration for DBs created before the sophisticated resume engine.
    try {
      this.db.exec(`ALTER TABLE jobs ADD COLUMN rewritten_resume_json TEXT`);
    } catch {
      /* column already exists */
    }
    try {
      this.db.exec(`ALTER TABLE jobs ADD COLUMN resume_meta TEXT`);
    } catch {
      /* column already exists */
    }
    // Migration for DBs created before the US/UK English-variant feature.
    try {
      this.db.exec(`ALTER TABLE jobs ADD COLUMN job_location TEXT`);
    } catch {
      /* column already exists */
    }
    // Migration for DBs created before role-driven committees (WS-4).
    try {
      this.db.exec(`ALTER TABLE jobs ADD COLUMN role_slug TEXT`);
    } catch {
      /* column already exists */
    }
    // Migration for DBs created before the advisory mentorship stage (WS-5).
    try {
      this.db.exec(`ALTER TABLE jobs ADD COLUMN advisory TEXT`);
    } catch {
      /* column already exists */
    }
    // Migration for DBs created before the JD metadata stage.
    try {
      this.db.exec(`ALTER TABLE jobs ADD COLUMN jd_meta TEXT`);
    } catch {
      /* column already exists */
    }
    // Migration for DBs created before the job-decomposition brief stage (Phase 1).
    try {
      this.db.exec(`ALTER TABLE jobs ADD COLUMN job_decomposition TEXT`);
    } catch {
      /* column already exists */
    }
    // Migration for DBs created before the advisory executive review (Phase 1).
    try {
      this.db.exec(`ALTER TABLE jobs ADD COLUMN executive_review TEXT`);
    } catch {
      /* column already exists */
    }
    // Migration for DBs created before per-seat 360-degree analyses.
    try {
      this.db.exec(`ALTER TABLE jobs ADD COLUMN analyses TEXT`);
    } catch {
      /* column already exists */
    }
    // Migration for DBs created before the multi-profile phase (WS-6).
    try {
      this.db.exec(`ALTER TABLE jobs ADD COLUMN profile_id TEXT`);
    } catch {
      /* column already exists */
    }
    // Migration for DBs created before the chained auto-generation phase.
    try {
      this.db.exec(`ALTER TABLE jobs ADD COLUMN generate TEXT`);
    } catch {
      /* column already exists */
    }
    try {
      this.db.exec(`ALTER TABLE jobs ADD COLUMN cold_email_draft TEXT`);
    } catch {
      /* column already exists */
    }
    // Migration for DBs created before the cover-letter stage (WS-7).
    try {
      this.db.exec(`ALTER TABLE jobs ADD COLUMN cover_letter_draft TEXT`);
    } catch {
      /* column already exists */
    }
    try {
      this.db.exec(`ALTER TABLE jobs ADD COLUMN interview_plan TEXT`);
    } catch {
      /* column already exists */
    }
    // Migration for DBs created before the live phase tracker (monitor & kill switch).
    try {
      this.db.exec(`ALTER TABLE jobs ADD COLUMN phase TEXT`);
    } catch {
      /* column already exists */
    }
    try {
      this.db.exec(`ALTER TABLE jobs ADD COLUMN activity TEXT`);
    } catch {
      /* column already exists */
    }
    // Migration for DBs created before the SaaS tenant column.
    try {
      this.db.exec(`ALTER TABLE jobs ADD COLUMN tenant_id TEXT`);
    } catch {
      /* column already exists */
    }
    try {
      this.db.exec(`ALTER TABLE profiles ADD COLUMN tenant_id TEXT`);
    } catch {
      /* column already exists */
    }
    try {
      this.db.exec(`ALTER TABLE saved_resumes ADD COLUMN tenant_id TEXT`);
    } catch {
      /* column already exists */
    }
    try {
      this.db.exec(`ALTER TABLE saved_jds ADD COLUMN tenant_id TEXT`);
    } catch {
      /* column already exists */
    }
    try {
      this.db.exec(`ALTER TABLE llm_connections ADD COLUMN tenant_id TEXT`);
    } catch {
      /* column already exists */
    }
    // Migration for DBs created before the gap-analysis persistence fix.
    try {
      this.db.exec(`ALTER TABLE jobs ADD COLUMN gap_analysis TEXT`);
    } catch {
      /* column already exists */
    }
    try {
      this.db.exec(`ALTER TABLE jobs ADD COLUMN amendment_notes TEXT`);
    } catch {
      /* column already exists */
    }
    // Webhooks table is created by CREATE TABLE IF NOT EXISTS above; no ALTER needed.
    // Marker for the migration set applied to this database file.
    this.db.pragma("user_version = 3");
    // Migrate the legacy single-row profile into a master profile on first open
    // so existing data is preserved when the new profiles table is empty.
    this.migrateLegacyProfile();
  }

  // --- Jobs -----------------------------------------------------------------

  /** Persistent serial run id, e.g. run-001, run-002, ... (never reused). */
  nextJobId(): string {
    const row = this.db
      .prepare("SELECT value FROM meta WHERE key = 'job_serial'")
      .get() as { value: string } | undefined;
    const next = (row ? Number.parseInt(row.value, 10) : 0) + 1;
    this.db
      .prepare(
        `INSERT INTO meta (key, value) VALUES ('job_serial', @value)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run({ value: String(next) });
    return `run-${String(next).padStart(3, "0")}`;
  }

  create(job: JobState): void {
    this.db
      .prepare(
         `INSERT INTO jobs
          (id, tenant_id, domain, role_slug, job_description, base_resume, sector_focus, job_location, profile_id,
           transcript, gap_analysis, amendment_notes,
           jd_meta, job_decomposition, analyses, final_verdict, blueprint, executive_review,
            rewritten_resume, rewritten_resume_json,
            resume_meta, generate, cold_email_draft, cover_letter_draft, interview_plan, llm_used, phase, activity, status, error, created_at, updated_at)
         VALUES (@id, @tenantId, @domain, @roleSlug, @jobDescription, @baseResume, @sectorFocus, @jobLocation, @profileId,
           @transcript, @gapAnalysis, @amendmentNotes,
           @jdMeta, @jobDecomposition, @analyses, @finalVerdict, @blueprint, @executiveReview,
           @rewrittenResume, @rewrittenResumeJson,
           @resumeMeta, @generate, @coldEmailDraft, @coverLetterDraft, @interviewPlan, @llmUsed, @phase, @activity, @status, @error, @createdAt, @updatedAt)`,
      )
      .run(rowFromJob(job));
  }

  get(id: string, tenantId?: string): JobState | null {
    const row = tenantId
      ? (this.db.prepare("SELECT * FROM jobs WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)").get(id, tenantId) as JobRow | undefined)
      : (this.db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as JobRow | undefined);
    return row ? jobFromRow(row) : null;
  }

  list(tenantId?: string): JobState[] {
    const rows = tenantId
      ? (this.db
          .prepare("SELECT * FROM jobs WHERE tenant_id = ? OR tenant_id IS NULL ORDER BY created_at DESC")
          .all(tenantId) as JobRow[])
      : (this.db.prepare("SELECT * FROM jobs ORDER BY created_at DESC").all() as JobRow[]);
    return rows.map(jobFromRow);
  }

  /**
   * Lean projection for dashboards: SQL computes booleans and the transcript
   * length so the large text/JSON blobs are never deserialized per row.
   */
  listRunSummaries(tenantId?: string): JobRunSummary[] {
    const baseSelect = `
      SELECT id, tenant_id, domain, role_slug, profile_id, status, phase, final_verdict,
             jd_meta, created_at, updated_at,
             json_array_length(transcript) AS transcript_length,
             CASE WHEN rewritten_resume IS NOT NULL AND rewritten_resume <> '' THEN 1 ELSE 0 END AS has_resume,
             CASE WHEN cover_letter_draft IS NOT NULL THEN 1 ELSE 0 END AS has_cover_letter,
             CASE WHEN interview_plan IS NOT NULL THEN 1 ELSE 0 END AS has_interview
      FROM jobs`;
    interface SummaryRow {
      id: string;
      tenant_id: string | null;
      domain: string;
      role_slug: string | null;
      profile_id: string | null;
      status: string;
      phase: string | null;
      final_verdict: string | null;
      jd_meta: string | null;
      created_at: string;
      updated_at: string;
      transcript_length: number | null;
      has_resume: number;
      has_cover_letter: number;
      has_interview: number;
    }
    const rows = tenantId
      ? (this.db
          .prepare(`${baseSelect} WHERE tenant_id = ? OR tenant_id IS NULL ORDER BY created_at DESC`)
          .all(tenantId) as SummaryRow[])
      : (this.db.prepare(`${baseSelect} ORDER BY created_at DESC`).all() as SummaryRow[]);
    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id ?? undefined,
      domain: row.domain as JobState["domain"],
      roleSlug: row.role_slug ?? undefined,
      profileId: row.profile_id ?? undefined,
      status: row.status as JobState["status"],
      phase: (row.phase as JobState["phase"]) ?? undefined,
      finalVerdict: (row.final_verdict as JobState["finalVerdict"]) ?? undefined,
      jdMeta: parseJSON<JdMeta>(row.jd_meta),
      transcriptLength: row.transcript_length ?? 0,
      hasResume: row.has_resume === 1,
      hasCoverLetter: row.has_cover_letter === 1,
      hasInterview: row.has_interview === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  update(job: JobState): void {
    const row = rowFromJob(job);
    this.db
      .prepare(
         `UPDATE jobs SET
           tenant_id = @tenantId,
           domain = @domain,
           role_slug = @roleSlug,
           job_description = @jobDescription,
           base_resume = @baseResume,
           sector_focus = @sectorFocus,
           job_location = @jobLocation,
           profile_id = @profileId,
           transcript = @transcript,
           gap_analysis = @gapAnalysis,
           amendment_notes = @amendmentNotes,
           jd_meta = @jdMeta,
           job_decomposition = @jobDecomposition,
           analyses = @analyses,
           final_verdict = @finalVerdict,
           blueprint = @blueprint,
           executive_review = @executiveReview,
           rewritten_resume = @rewrittenResume,
           rewritten_resume_json = @rewrittenResumeJson,
           resume_meta = @resumeMeta,
           generate = @generate,
           cold_email_draft = @coldEmailDraft,
           cover_letter_draft = @coverLetterDraft,
           interview_plan = @interviewPlan,
           llm_used = @llmUsed,
           phase = @phase,
           activity = @activity,
           status = @status,
           error = @error,
           updated_at = @updatedAt
         WHERE id = @id`,
      )
      .run(row);
  }

  delete(id: string, tenantId?: string): boolean {
    return tenantId
      ? this.db.prepare("DELETE FROM jobs WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)").run(id, tenantId).changes > 0
      : this.db.prepare("DELETE FROM jobs WHERE id = ?").run(id).changes > 0;
  }

  // --- Profiles (WS-6 multi-profile) -----------------------------------------

  listProfiles(tenantId?: string): UserProfile[] {
    const rows = tenantId
      ? (this.db
          .prepare("SELECT * FROM profiles WHERE tenant_id = ? OR tenant_id IS NULL ORDER BY is_master DESC, updated_at DESC")
          .all(tenantId) as ProfileRow[])
      : (this.db
          .prepare("SELECT * FROM profiles ORDER BY is_master DESC, updated_at DESC")
          .all() as ProfileRow[]);
    return rows.map(profileFromRow);
  }

  getProfileById(id: string, tenantId?: string): UserProfile | null {
    const row = tenantId
      ? (this.db.prepare("SELECT * FROM profiles WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)").get(id, tenantId) as ProfileRow | undefined)
      : (this.db.prepare("SELECT * FROM profiles WHERE id = ?").get(id) as ProfileRow | undefined);
    return row ? profileFromRow(row) : null;
  }

  getMasterProfile(tenantId?: string): UserProfile | null {
    const row = tenantId
      ? (this.db
          .prepare("SELECT * FROM profiles WHERE is_master = 1 AND (tenant_id = ? OR tenant_id IS NULL) LIMIT 1")
          .get(tenantId) as ProfileRow | undefined)
      : (this.db
          .prepare("SELECT * FROM profiles WHERE is_master = 1 LIMIT 1")
          .get() as ProfileRow | undefined);
    if (row) return profileFromRow(row);
    const first = tenantId
      ? (this.db
          .prepare("SELECT * FROM profiles WHERE tenant_id = ? OR tenant_id IS NULL ORDER BY created_at ASC LIMIT 1")
          .get(tenantId) as ProfileRow | undefined)
      : (this.db.prepare("SELECT * FROM profiles ORDER BY created_at ASC LIMIT 1").get() as ProfileRow | undefined);
    return first ? profileFromRow(first) : null;
  }

  createProfile(input: ProfileCreateInput, tenantId?: string): UserProfile {
    const now = new Date().toISOString();
    const id = newId("prof_");
    const tenantClause = tenantId ? "WHERE tenant_id = ? OR tenant_id IS NULL" : "";
    const hasExisting = tenantId
      ? (this.db.prepare(`SELECT COUNT(*) AS n FROM profiles ${tenantClause}`).get(tenantId) as { n: number })
      : (this.db.prepare("SELECT COUNT(*) AS n FROM profiles").get() as { n: number });
    if (hasExisting.n >= MAX_PROFILES_PER_TENANT) {
      throw new Error(
        `Profile limit reached: up to ${MAX_PROFILES_PER_TENANT} profiles are allowed. Delete one to create another.`,
      );
    }
    const isMaster = hasExisting.n === 0 ? 1 : 0;
    const pinHash = input.pin ? hashPin(input.pin) : null;
    this.db
      .prepare(
        `INSERT INTO profiles (id, tenant_id, name, email, data, is_master, pin_hash, created_at, updated_at)
         VALUES (@id, @tenantId, @name, @email, @data, @isMaster, @pinHash, @createdAt, @updatedAt)`,
      )
      .run({
        id,
        tenantId: tenantId ?? null,
        name: input.name,
        email: input.email ?? "",
        data: JSON.stringify({}),
        isMaster,
        pinHash,
        createdAt: now,
        updatedAt: now,
      });
    return this.getProfileById(id, tenantId)!;
  }

  updateProfile(id: string, patch: ProfileUpdateInput, tenantId?: string): UserProfile | null {
    const existing = this.getProfileById(id, tenantId);
    if (!existing) return null;
    const updated = applyProfilePatch(existing, patch);
    const now = new Date().toISOString();
    const { pin_hash: _ignored, ...data } = updated as UserProfile & {
      pin_hash?: never;
    };
    const whereClause = tenantId ? "AND (tenant_id = @tenantId OR tenant_id IS NULL)" : "";
    this.db
      .prepare(
        `UPDATE profiles SET
           name = @name,
           email = @email,
           data = @data,
           updated_at = @updatedAt
         WHERE id = @id ${whereClause}`,
      )
      .run(tenantId ? { id, tenantId, name: updated.name, email: updated.email, data: JSON.stringify(data), updatedAt: now } : { id, name: updated.name, email: updated.email, data: JSON.stringify(data), updatedAt: now });
    return this.getProfileById(id, tenantId);
  }

  deleteProfile(id: string, tenantId?: string): boolean {
    const existing = this.getProfileById(id, tenantId);
    if (!existing) return false;
    const tenantClause = tenantId ? "WHERE tenant_id = ? OR tenant_id IS NULL" : "";
    const count = tenantId
      ? (this.db.prepare(`SELECT COUNT(*) AS n FROM profiles ${tenantClause}`).get(tenantId) as { n: number })
      : (this.db.prepare("SELECT COUNT(*) AS n FROM profiles").get() as { n: number });
    if (count.n <= 1) {
      throw new Error("Cannot delete the last profile.");
    }
    let deleted = false;
    const applyDelete = this.db.transaction(() => {
      deleted = tenantId
        ? this.db.prepare("DELETE FROM profiles WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)").run(id, tenantId).changes > 0
        : this.db.prepare("DELETE FROM profiles WHERE id = ?").run(id).changes > 0;
      if (deleted && existing.isMaster) {
        const next = tenantId
          ? (this.db
              .prepare("SELECT * FROM profiles WHERE tenant_id = ? OR tenant_id IS NULL ORDER BY created_at ASC LIMIT 1")
              .get(tenantId) as ProfileRow | undefined)
          : (this.db.prepare("SELECT * FROM profiles ORDER BY created_at ASC LIMIT 1").get() as ProfileRow | undefined);
        if (next) this.db.prepare("UPDATE profiles SET is_master = 1 WHERE id = ?").run(next.id);
      }
    });
    applyDelete();
    return deleted;
  }

  setMasterProfile(id: string, pin: string | undefined, tenantId?: string): UserProfile | null {
    const existing = this.getProfileById(id, tenantId);
    if (!existing) return null;
    if (existing.hasPin && (!pin || !this.verifyProfilePin(id, pin, tenantId))) return null;
    const now = new Date().toISOString();
    const applyMaster = this.db.transaction(() => {
      if (tenantId) {
        this.db.prepare("UPDATE profiles SET is_master = 0 WHERE tenant_id = ? OR tenant_id IS NULL").run(tenantId);
      } else {
        this.db.prepare("UPDATE profiles SET is_master = 0").run();
      }
      const whereClause = tenantId ? "AND (tenant_id = @tenantId OR tenant_id IS NULL)" : "";
      this.db
        .prepare(`UPDATE profiles SET is_master = 1, updated_at = @updatedAt WHERE id = @id ${whereClause}`)
        .run(tenantId ? { id, tenantId, updatedAt: now } : { id, updatedAt: now });
    });
    applyMaster();
    return this.getProfileById(id, tenantId);
  }

  setProfilePin(id: string, pin: string, tenantId?: string): UserProfile | null {
    if (!this.getProfileById(id, tenantId)) return null;
    const pinHash = hashPin(pin);
    const whereClause = tenantId ? "AND (tenant_id = @tenantId OR tenant_id IS NULL)" : "";
    this.db
      .prepare(`UPDATE profiles SET pin_hash = @pinHash, updated_at = @updatedAt WHERE id = @id ${whereClause}`)
      .run(tenantId ? { id, tenantId, pinHash, updatedAt: new Date().toISOString() } : { id, pinHash, updatedAt: new Date().toISOString() });
    return this.getProfileById(id, tenantId);
  }

  verifyProfilePin(id: string, pin: string, tenantId?: string): boolean {
    const row = tenantId
      ? (this.db.prepare("SELECT pin_hash FROM profiles WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)").get(id, tenantId) as { pin_hash: string | null } | undefined)
      : (this.db.prepare("SELECT pin_hash FROM profiles WHERE id = ?").get(id) as { pin_hash: string | null } | undefined);
    if (!row || !row.pin_hash) return false;
    return verifyPin(row.pin_hash, pin);
  }

  private migrateLegacyProfile(): void {
    const legacy = this.db
      .prepare("SELECT name, email FROM profile WHERE id = 1")
      .get() as { name: string; email: string } | undefined;
    const count = this.db.prepare("SELECT COUNT(*) AS n FROM profiles").get() as { n: number };
    if (legacy && legacy.name && count.n === 0) {
      const now = new Date().toISOString();
      this.db
        .prepare(
          `INSERT INTO profiles (id, tenant_id, name, email, data, is_master, pin_hash, created_at, updated_at)
           VALUES (@id, @tenantId, @name, @email, @data, 1, NULL, @createdAt, @updatedAt)`,
        )
        .run({ id: newId("prof_"), tenantId: null, name: legacy.name, email: legacy.email, data: "{}", createdAt: now, updatedAt: now });
    }
  }

  // --- Profile (backward-compat single-user view) ---------------------------

  getProfile(tenantId?: string): UserProfile {
    const master = this.getMasterProfile(tenantId);
    if (master) return { ...master, name: master.name, email: master.email, updatedAt: master.updatedAt };
    return { id: "", name: "", email: "", isMaster: false, hasPin: false, updatedAt: "" };
  }

  upsertProfile(input: ProfileInput, tenantId?: string): UserProfile {
    const master = this.getMasterProfile(tenantId);
    const now = new Date().toISOString();
    if (!master) {
      const created = this.createProfile({ name: input.name, email: input.email }, tenantId);
      return created;
    }
    return this.updateProfile(master.id, { name: input.name, email: input.email }, tenantId) ?? {
      ...master,
      name: input.name,
      email: input.email,
      updatedAt: now,
    };
  }

  // --- Saved resumes ----------------------------------------------------------

  listSavedResumes(tenantId?: string): SavedResume[] {
    const rows = tenantId
      ? (this.db
          .prepare("SELECT * FROM saved_resumes WHERE tenant_id = ? OR tenant_id IS NULL ORDER BY updated_at DESC")
          .all(tenantId) as SavedResumeRow[])
      : (this.db
          .prepare("SELECT * FROM saved_resumes ORDER BY updated_at DESC")
          .all() as SavedResumeRow[]);
    return rows.map(savedResumeFromRow);
  }

  createSavedResume(input: SavedResumeInput, tenantId?: string): SavedResume {
    const now = new Date().toISOString();
    const item: SavedResume = {
      id: newId("rs_"),
      tenantId,
      title: input.title,
      content: input.content,
      createdAt: now,
      updatedAt: now,
    };
    this.db
      .prepare(
        `INSERT INTO saved_resumes (id, tenant_id, title, content, created_at, updated_at)
         VALUES (@id, @tenantId, @title, @content, @createdAt, @updatedAt)`,
      )
      .run(item);
    return item;
  }

  updateSavedResume(id: string, input: SavedResumeInput, tenantId?: string): SavedResume | null {
    const existing = this.getSavedResume(id, tenantId);
    if (!existing) return null;
    const updated: SavedResume = {
      ...existing,
      title: input.title,
      content: input.content,
      updatedAt: new Date().toISOString(),
    };
    const whereClause = tenantId ? "AND (tenant_id = @tenantId OR tenant_id IS NULL)" : "";
    this.db
      .prepare(
        `UPDATE saved_resumes SET title = @title, content = @content, updated_at = @updatedAt
         WHERE id = @id ${whereClause}`,
      )
      .run(tenantId ? { id, tenantId, title: updated.title, content: updated.content, updatedAt: updated.updatedAt } : updated);
    return updated;
  }

  getSavedResume(id: string, tenantId?: string): SavedResume | null {
    const row = tenantId
      ? (this.db.prepare("SELECT * FROM saved_resumes WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)").get(id, tenantId) as SavedResumeRow | undefined)
      : (this.db.prepare("SELECT * FROM saved_resumes WHERE id = ?").get(id) as SavedResumeRow | undefined);
    return row ? savedResumeFromRow(row) : null;
  }

  deleteSavedResume(id: string, tenantId?: string): boolean {
    return tenantId
      ? this.db.prepare("DELETE FROM saved_resumes WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)").run(id, tenantId).changes > 0
      : this.db.prepare("DELETE FROM saved_resumes WHERE id = ?").run(id).changes > 0;
  }

  // --- Saved JDs ---------------------------------------------------------------

  listSavedJds(tenantId?: string): SavedJd[] {
    const rows = tenantId
      ? (this.db
          .prepare("SELECT * FROM saved_jds WHERE tenant_id = ? OR tenant_id IS NULL ORDER BY updated_at DESC")
          .all(tenantId) as SavedJdRow[])
      : (this.db
          .prepare("SELECT * FROM saved_jds ORDER BY updated_at DESC")
          .all() as SavedJdRow[]);
    return rows.map(savedJdFromRow);
  }

  createSavedJd(input: SavedJdInput, tenantId?: string): SavedJd {
    const now = new Date().toISOString();
    const item: SavedJd = {
      id: newId("jd_"),
      tenantId,
      title: input.title,
      content: input.content,
      createdAt: now,
      updatedAt: now,
    };
    this.db
      .prepare(
        `INSERT INTO saved_jds (id, tenant_id, title, content, created_at, updated_at)
         VALUES (@id, @tenantId, @title, @content, @createdAt, @updatedAt)`,
      )
      .run(item);
    return item;
  }

  updateSavedJd(id: string, input: SavedJdInput, tenantId?: string): SavedJd | null {
    const existing = this.getSavedJd(id, tenantId);
    if (!existing) return null;
    const updated: SavedJd = {
      ...existing,
      title: input.title,
      content: input.content,
      updatedAt: new Date().toISOString(),
    };
    const whereClause = tenantId ? "AND (tenant_id = @tenantId OR tenant_id IS NULL)" : "";
    this.db
      .prepare(
        `UPDATE saved_jds SET title = @title, content = @content, updated_at = @updatedAt
         WHERE id = @id ${whereClause}`,
      )
      .run(tenantId ? { id, tenantId, title: updated.title, content: updated.content, updatedAt: updated.updatedAt } : updated);
    return updated;
  }

  getSavedJd(id: string, tenantId?: string): SavedJd | null {
    const row = tenantId
      ? (this.db.prepare("SELECT * FROM saved_jds WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)").get(id, tenantId) as SavedJdRow | undefined)
      : (this.db.prepare("SELECT * FROM saved_jds WHERE id = ?").get(id) as SavedJdRow | undefined);
    return row ? savedJdFromRow(row) : null;
  }

  deleteSavedJd(id: string, tenantId?: string): boolean {
    return tenantId
      ? this.db.prepare("DELETE FROM saved_jds WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)").run(id, tenantId).changes > 0
      : this.db.prepare("DELETE FROM saved_jds WHERE id = ?").run(id).changes > 0;
  }

  // --- LLM connections ---------------------------------------------------------

  listLlmConnections(tenantId?: string): LlmConnection[] {
    const rows = tenantId
      ? (this.db
          .prepare("SELECT * FROM llm_connections WHERE tenant_id = ? OR tenant_id IS NULL ORDER BY is_default DESC, updated_at DESC")
          .all(tenantId) as LlmConnectionRow[])
      : (this.db
          .prepare("SELECT * FROM llm_connections ORDER BY is_default DESC, updated_at DESC")
          .all() as LlmConnectionRow[]);
    return rows.map((row) => connectionFromRow(row, this.secret));
  }

  getLlmConnection(id: string, tenantId?: string): LlmConnection | null {
    const row = tenantId
      ? (this.db.prepare("SELECT * FROM llm_connections WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)").get(id, tenantId) as LlmConnectionRow | undefined)
      : (this.db.prepare("SELECT * FROM llm_connections WHERE id = ?").get(id) as LlmConnectionRow | undefined);
    return row ? connectionFromRow(row, this.secret) : null;
  }

  getLlmConnectionWithKey(id: string, tenantId?: string): (LlmConnection & { apiKey: string }) | null {
    const row = tenantId
      ? (this.db.prepare("SELECT * FROM llm_connections WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)").get(id, tenantId) as LlmConnectionRow | undefined)
      : (this.db.prepare("SELECT * FROM llm_connections WHERE id = ?").get(id) as LlmConnectionRow | undefined);
    if (!row) return null;
    const base = connectionFromRow(row, this.secret);
    const apiKey = row.api_key_encrypted
      ? decryptSecret(row.api_key_encrypted, this.secret)
      : "";
    return { ...base, apiKey };
  }

  getDefaultLlmConnectionWithKey(tenantId?: string): (LlmConnection & { apiKey: string }) | null {
    const row = tenantId
      ? (this.db
          .prepare("SELECT * FROM llm_connections WHERE is_default = 1 AND (tenant_id = ? OR tenant_id IS NULL) LIMIT 1")
          .get(tenantId) as LlmConnectionRow | undefined)
      : (this.db
          .prepare("SELECT * FROM llm_connections WHERE is_default = 1 LIMIT 1")
          .get() as LlmConnectionRow | undefined);
    if (!row) return null;
    const base = connectionFromRow(row, this.secret);
    const apiKey = row.api_key_encrypted
      ? decryptSecret(row.api_key_encrypted, this.secret)
      : "";
    return { ...base, apiKey };
  }

  createLlmConnection(input: LlmConnectionInput, tenantId?: string): LlmConnection {
    const now = new Date().toISOString();
    const apiKeyEncrypted = input.apiKey
      ? encryptSecret(input.apiKey, this.secret)
      : null;
    const id = newId("llm_");
    const applyCreate = this.db.transaction(() => {
      if (input.isDefault) this.clearDefaultLlmConnection(tenantId);
      this.db
        .prepare(
          `INSERT INTO llm_connections
             (id, tenant_id, name, provider, base_url, model, temperature, api_key_encrypted, is_default, created_at, updated_at)
           VALUES (@id, @tenantId, @name, @provider, @baseUrl, @model, @temperature, @apiKeyEncrypted,
             @isDefault, @createdAt, @updatedAt)`,
        )
        .run({
          id,
          tenantId: tenantId ?? null,
          name: input.name,
          provider: input.provider,
          baseUrl: input.baseUrl ?? null,
          model: input.model ?? null,
          temperature: input.temperature ?? null,
          apiKeyEncrypted,
          isDefault: input.isDefault ? 1 : 0,
          createdAt: now,
          updatedAt: now,
        });
    });
    applyCreate();
    return this.getLlmConnection(id, tenantId)!;
  }

  updateLlmConnection(id: string, patch: LlmConnectionUpdateInput, tenantId?: string): LlmConnection | null {
    const existing = tenantId
      ? (this.db.prepare("SELECT * FROM llm_connections WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)").get(id, tenantId) as LlmConnectionRow | undefined)
      : (this.db.prepare("SELECT * FROM llm_connections WHERE id = ?").get(id) as LlmConnectionRow | undefined);
    if (!existing) return null;

    const apiKeyEncrypted =
      patch.apiKey !== undefined
        ? encryptSecret(patch.apiKey, this.secret)
        : existing.api_key_encrypted;
    const isDefault =
      patch.isDefault !== undefined ? (patch.isDefault ? 1 : 0) : existing.is_default;

    const whereClause = tenantId ? "AND (tenant_id = @tenantId OR tenant_id IS NULL)" : "";
    const applyUpdate = this.db.transaction(() => {
      if (patch.isDefault) this.clearDefaultLlmConnection(tenantId);
      this.db
        .prepare(
          `UPDATE llm_connections SET
             name = @name,
             provider = @provider,
             base_url = @baseUrl,
             model = @model,
             temperature = @temperature,
             api_key_encrypted = @apiKeyEncrypted,
             is_default = @isDefault,
             updated_at = @updatedAt
           WHERE id = @id ${whereClause}`,
        )
        .run(tenantId
          ? {
              id,
              tenantId,
              name: patch.name ?? existing.name,
              provider: patch.provider ?? existing.provider,
              baseUrl: patch.baseUrl !== undefined ? patch.baseUrl : existing.base_url,
              model: patch.model !== undefined ? patch.model : existing.model,
              temperature: patch.temperature !== undefined ? patch.temperature : existing.temperature,
              apiKeyEncrypted,
              isDefault,
              updatedAt: new Date().toISOString(),
            }
          : {
              id,
              name: patch.name ?? existing.name,
              provider: patch.provider ?? existing.provider,
              baseUrl: patch.baseUrl !== undefined ? patch.baseUrl : existing.base_url,
              model: patch.model !== undefined ? patch.model : existing.model,
              temperature: patch.temperature !== undefined ? patch.temperature : existing.temperature,
              apiKeyEncrypted,
              isDefault,
              updatedAt: new Date().toISOString(),
            });
    });
    applyUpdate();
    return this.getLlmConnection(id, tenantId);
  }

  deleteLlmConnection(id: string, tenantId?: string): boolean {
    return tenantId
      ? this.db.prepare("DELETE FROM llm_connections WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)").run(id, tenantId).changes > 0
      : this.db.prepare("DELETE FROM llm_connections WHERE id = ?").run(id).changes > 0;
  }

  private clearDefaultLlmConnection(tenantId?: string): void {
    if (tenantId) {
      this.db.prepare("UPDATE llm_connections SET is_default = 0 WHERE tenant_id = ? OR tenant_id IS NULL").run(tenantId);
    } else {
      this.db.prepare(`UPDATE llm_connections SET is_default = 0`).run();
    }
  }

  // --- Webhooks ---------------------------------------------------------------

  listWebhooks(tenantId?: string): Webhook[] {
    const rows = tenantId
      ? (this.db
          .prepare("SELECT * FROM webhooks WHERE tenant_id = ? OR tenant_id IS NULL ORDER BY created_at DESC")
          .all(tenantId) as WebhookRow[])
      : (this.db
          .prepare("SELECT * FROM webhooks ORDER BY created_at DESC")
          .all() as WebhookRow[]);
    return rows.map(webhookFromRow);
  }

  /** Internal: decrypted signing secrets for dispatch. Never expose via API. */
  listWebhooksWithSecrets(tenantId?: string): WebhookWithSecret[] {
    const rows = tenantId
      ? (this.db
          .prepare("SELECT * FROM webhooks WHERE tenant_id = ? OR tenant_id IS NULL ORDER BY created_at DESC")
          .all(tenantId) as WebhookRow[])
      : (this.db
          .prepare("SELECT * FROM webhooks ORDER BY created_at DESC")
          .all() as WebhookRow[]);
    return rows.map((row) => webhookWithSecretFromRow(row, this.secret));
  }

  getWebhook(id: string, tenantId?: string): Webhook | null {
    const row = tenantId
      ? (this.db.prepare("SELECT * FROM webhooks WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)").get(id, tenantId) as WebhookRow | undefined)
      : (this.db.prepare("SELECT * FROM webhooks WHERE id = ?").get(id) as WebhookRow | undefined);
    return row ? webhookFromRow(row) : null;
  }

  createWebhook(input: WebhookInput, tenantId?: string): Webhook {
    const now = new Date().toISOString();
    const id = newId("wh_");
    this.db
      .prepare(
        `INSERT INTO webhooks (id, tenant_id, url, events, secret, is_active, created_at, updated_at)
         VALUES (@id, @tenantId, @url, @events, @secret, @isActive, @createdAt, @updatedAt)`,
      )
      .run({
        id,
        tenantId: tenantId ?? null,
        url: input.url,
        events: JSON.stringify(input.events),
        secret: input.secret ? encryptSecret(input.secret, this.secret) : null,
        isActive: input.isActive !== false ? 1 : 0,
        createdAt: now,
        updatedAt: now,
      });
    return this.getWebhook(id, tenantId)!;
  }

  updateWebhook(id: string, patch: WebhookUpdateInput, tenantId?: string): Webhook | null {
    const existing = this.getWebhook(id, tenantId);
    if (!existing) return null;
    const currentRow = tenantId
      ? (this.db.prepare("SELECT * FROM webhooks WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)").get(id, tenantId) as WebhookRow | undefined)
      : (this.db.prepare("SELECT * FROM webhooks WHERE id = ?").get(id) as WebhookRow | undefined);
    if (!currentRow) return null;
    const whereClause = tenantId ? "AND (tenant_id = @tenantId OR tenant_id IS NULL)" : "";
    const nextSecret =
      patch.secret !== undefined
        ? patch.secret
          ? encryptSecret(patch.secret, this.secret)
          : null
        : currentRow.secret;
    this.db
      .prepare(
        `UPDATE webhooks SET
           url = @url,
           events = @events,
           secret = @secret,
           is_active = @isActive,
           updated_at = @updatedAt
         WHERE id = @id ${whereClause}`,
      )
      .run(tenantId
        ? {
            id,
            tenantId,
            url: patch.url ?? existing.url,
            events: patch.events ? JSON.stringify(patch.events) : JSON.stringify(existing.events),
            secret: nextSecret,
            isActive: patch.isActive !== undefined ? (patch.isActive ? 1 : 0) : existing.isActive ? 1 : 0,
            updatedAt: new Date().toISOString(),
          }
        : {
            id,
            url: patch.url ?? existing.url,
            events: patch.events ? JSON.stringify(patch.events) : JSON.stringify(existing.events),
            secret: nextSecret,
            isActive: patch.isActive !== undefined ? (patch.isActive ? 1 : 0) : existing.isActive ? 1 : 0,
            updatedAt: new Date().toISOString(),
          });
    return this.getWebhook(id, tenantId);
  }

  deleteWebhook(id: string, tenantId?: string): boolean {
    return tenantId
      ? this.db.prepare("DELETE FROM webhooks WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)").run(id, tenantId).changes > 0
      : this.db.prepare("DELETE FROM webhooks WHERE id = ?").run(id).changes > 0;
  }

  close(): void {
    this.db.close();
  }

  /** Cheap liveness probe for load balancers and orchestrators. */
  healthCheck(): boolean {
    try {
      this.db.prepare("SELECT 1").get();
      return true;
    } catch {
      return false;
    }
  }
}

interface ProfileRow {
  id: string;
  tenant_id: string | null;
  name: string;
  email: string;
  data: string;
  is_master: number;
  pin_hash: string | null;
  created_at: string;
  updated_at: string;
}

function profileFromRow(row: ProfileRow): UserProfile {
  const data = requireJSON<Record<string, unknown>>(row.data, {});
  const { updatedAt: _storedUpdatedAt, ...rest } = data;
  return {
    id: row.id,
    tenantId: row.tenant_id ?? undefined,
    name: row.name,
    email: row.email,
    isMaster: row.is_master === 1,
    hasPin: Boolean(row.pin_hash),
    updatedAt: row.updated_at,
    createdAt: row.created_at,
    ...rest,
  } as UserProfile;
}

/** Merge a structured patch into an existing profile (deep-replace list fields). */
function applyProfilePatch(
  existing: UserProfile,
  patch: ProfileUpdateInput,
): UserProfile {
  return {
    ...existing,
    name: patch.name ?? existing.name,
    email: patch.email ?? existing.email,
    personalInfo: patch.personalInfo
      ? { ...existing.personalInfo, ...patch.personalInfo }
      : existing.personalInfo,
    summary: patch.summary !== undefined ? patch.summary : existing.summary,
    workAuthorization:
      patch.workAuthorization !== undefined
        ? patch.workAuthorization
        : existing.workAuthorization,
    employmentPreference:
      patch.employmentPreference !== undefined
        ? patch.employmentPreference
        : existing.employmentPreference,
    experience: patch.experience ?? existing.experience,
    education: patch.education ?? existing.education,
    skills: patch.skills ?? existing.skills,
    certifications: patch.certifications ?? existing.certifications,
    projects: patch.projects ?? existing.projects,
    publications: patch.publications ?? existing.publications,
    languages: patch.languages ?? existing.languages,
    volunteer: patch.volunteer ?? existing.volunteer,
    coreCompetencies: patch.coreCompetencies ?? existing.coreCompetencies,
    workAreas: patch.workAreas ?? existing.workAreas,
    totalWorkExperience:
      patch.totalWorkExperience !== undefined
        ? patch.totalWorkExperience
        : existing.totalWorkExperience,
    updatedAt: new Date().toISOString(),
  };
}

const PIN_ITERATIONS = 16_384;

function hashPin(pin: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(pin, salt, 32, { N: PIN_ITERATIONS });
  return `scrypt$${PIN_ITERATIONS}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

function verifyPin(stored: string, pin: string): boolean {
  const [algo, iterations, saltB64, hashB64] = stored.split("$");
  if (algo !== "scrypt" || !saltB64 || !hashB64) return false;
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");
  const derived = scryptSync(pin, salt, expected.length, {
    N: Number(iterations) || PIN_ITERATIONS,
  });
  return timingSafeEqual(derived, expected);
}

interface SavedResumeRow {
  id: string;
  tenant_id: string | null;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

interface SavedJdRow {
  id: string;
  tenant_id: string | null;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

function savedResumeFromRow(row: SavedResumeRow): SavedResume {
  return {
    id: row.id,
    tenantId: row.tenant_id ?? undefined,
    title: row.title,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function savedJdFromRow(row: SavedJdRow): SavedJd {
  return {
    id: row.id,
    tenantId: row.tenant_id ?? undefined,
    title: row.title,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function connectionFromRow(row: LlmConnectionRow, secret: string): LlmConnection {
  const hasKey = Boolean(row.api_key_encrypted);
  return {
    id: row.id,
    tenantId: row.tenant_id ?? undefined,
    name: row.name,
    provider: row.provider,
    baseUrl: row.base_url ?? undefined,
    model: row.model ?? undefined,
    temperature: row.temperature ?? undefined,
    hasKey,
    keyPreview: hasKey ? maskKey(decryptSecret(row.api_key_encrypted!, secret)) : undefined,
    isDefault: row.is_default === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function webhookFromRow(row: WebhookRow): Webhook {
  const events = parseJSON<Webhook["events"]>(row.events) ?? [];
  return {
    id: row.id,
    tenantId: row.tenant_id ?? undefined,
    url: row.url,
    events,
    hasSecret: Boolean(row.secret),
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function webhookWithSecretFromRow(row: WebhookRow, secret: string): WebhookWithSecret {
  return {
    ...webhookFromRow(row),
    secret: row.secret ? decryptSecret(row.secret, secret) : undefined,
  };
}

function rowFromJob(job: JobState): Record<string, unknown> {
  return {
    id: job.id,
    tenantId: job.tenantId ?? null,
    domain: job.domain,
    roleSlug: job.roleSlug ?? null,
    jobDescription: job.jobDescription,
    baseResume: job.baseResume,
    sectorFocus: job.sectorFocus ?? null,
    jobLocation: job.jobLocation ?? null,
    profileId: job.profileId ?? null,
    transcript: JSON.stringify(job.transcript),
    gapAnalysis: job.gapAnalysis ? JSON.stringify(job.gapAnalysis) : null,
    amendmentNotes: job.amendmentNotes ?? null,
    jdMeta: job.jdMeta ? JSON.stringify(job.jdMeta) : null,
    jobDecomposition: job.jobDecomposition ? JSON.stringify(job.jobDecomposition) : null,
    analyses: job.analyses ? JSON.stringify(job.analyses) : null,
    finalVerdict: job.finalVerdict ?? null,
    blueprint: job.blueprint ? JSON.stringify(job.blueprint) : null,
    executiveReview: job.executiveReview ? JSON.stringify(job.executiveReview) : null,
    // Resume data is stored as JSON only; the Markdown view is derived at
    // read time from the JSON (legacy rows without JSON keep their Markdown).
    rewrittenResume: job.rewrittenResumeJson ? null : job.rewrittenResume ?? null,
    rewrittenResumeJson: job.rewrittenResumeJson ?? null,
    resumeMeta: job.resumeMeta ? JSON.stringify(job.resumeMeta) : null,
    generate: job.generate ? JSON.stringify(job.generate) : null,
    coldEmailDraft: job.coldEmailDraft ? JSON.stringify(job.coldEmailDraft) : null,
    coverLetterDraft: job.coverLetterDraft ? JSON.stringify(job.coverLetterDraft) : null,
    interviewPlan: job.interviewPlan ? JSON.stringify(job.interviewPlan) : null,
    llmUsed: job.llmUsed ? JSON.stringify(job.llmUsed) : null,
    phase: job.phase ?? null,
    activity: job.activity ?? null,
    status: job.status,
    error: job.error ?? null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

/**
 * The Markdown resume view is a derived render of the stored resume JSON. When
 * JSON is present it is re-rendered here; otherwise legacy Markdown is kept.
 */
function deriveResumeMarkdown(legacyMarkdown: string | null, json: string | null): string | undefined {
  if (json) {
    try {
      return resumeToMarkdown(JSON.parse(json) as ResumeTemplate);
    } catch {
      /* fall through to legacy Markdown on unparseable JSON */
    }
  }
  return legacyMarkdown ?? undefined;
}

function jobFromRow(row: JobRow): JobState {
  return {
    id: row.id,
    tenantId: row.tenant_id ?? undefined,
    domain: row.domain as JobState["domain"],
    roleSlug: row.role_slug ?? undefined,
    jobDescription: row.job_description,
    baseResume: row.base_resume,
    sectorFocus: row.sector_focus ?? undefined,
    jobLocation: row.job_location ?? undefined,
    profileId: row.profile_id ?? undefined,
    transcript: requireJSON<TranscriptEntry[]>(row.transcript, []),
    gapAnalysis: parseJSON<JobState["gapAnalysis"]>(row.gap_analysis),
    amendmentNotes: row.amendment_notes ?? undefined,
    jdMeta: parseJSON<JdMeta>(row.jd_meta),
    jobDecomposition: parseJSON<JobState["jobDecomposition"]>(row.job_decomposition),
    analyses: parseJSON<SmeAnalysis[]>(row.analyses),
    finalVerdict: (row.final_verdict as JobState["finalVerdict"]) ?? undefined,
    blueprint: parseJSON<Blueprint>(row.blueprint),
    executiveReview: parseJSON<JobState["executiveReview"]>(row.executive_review),
    rewrittenResume: deriveResumeMarkdown(row.rewritten_resume, row.rewritten_resume_json),
    rewrittenResumeJson: row.rewritten_resume_json ?? undefined,
    resumeMeta: parseJSON<ResumeMeta>(row.resume_meta),
    generate: parseJSON<JobState["generate"]>(row.generate),
    coldEmailDraft: parseJSON<ColdEmailDraft>(row.cold_email_draft),
    coverLetterDraft: parseJSON<CoverLetterDraft>(row.cover_letter_draft),
    interviewPlan: parseJSON<InterviewPrepPlan>(row.interview_plan),
    llmUsed: parseJSON<{ provider: string; model: string }>(row.llm_used),
    phase: (row.phase as JobState["phase"]) ?? undefined,
    activity: row.activity ?? undefined,
    status: row.status as JobState["status"],
    error: row.error ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
