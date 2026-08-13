import Database from "better-sqlite3";
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type {
  Blueprint,
  JobState,
  LlmConnection,
  LlmConnectionInput,
  LlmConnectionUpdateInput,
  ProfileInput,
  ResumeMeta,
  SavedJd,
  SavedJdInput,
  SavedResume,
  SavedResumeInput,
  TranscriptEntry,
  UserProfile,
} from "@rattlesnake/shared";
import {
  decryptSecret,
  encryptSecret,
  loadOrCreateSecret,
  maskKey,
} from "../security/crypto.js";

function newId(prefix: string): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

interface JobRow {
  id: string;
  domain: string;
  job_description: string;
  base_resume: string;
  sector_focus: string | null;
  job_location: string | null;
  transcript: string;
  final_verdict: string | null;
  blueprint: string | null;
  rewritten_resume: string | null;
  rewritten_resume_json: string | null;
  resume_meta: string | null;
  llm_used: string | null;
  status: string;
  error: string | null;
  created_at: string;
  updated_at: string;
}

interface LlmConnectionRow {
  id: string;
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

function parseJSON<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

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
        domain TEXT NOT NULL,
        job_description TEXT NOT NULL,
        base_resume TEXT NOT NULL,
        sector_focus TEXT,
        job_location TEXT,
        transcript TEXT NOT NULL DEFAULT '[]',
        final_verdict TEXT,
        blueprint TEXT,
        rewritten_resume TEXT,
        rewritten_resume_json TEXT,
        resume_meta TEXT,
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
      CREATE TABLE IF NOT EXISTS saved_resumes (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS saved_jds (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS llm_connections (
        id TEXT PRIMARY KEY,
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
  }

  // --- Jobs -----------------------------------------------------------------

  create(job: JobState): void {
    this.db
      .prepare(
        `INSERT INTO jobs
          (id, domain, job_description, base_resume, sector_focus, job_location, transcript,
           final_verdict, blueprint, rewritten_resume, rewritten_resume_json,
           resume_meta, llm_used, status, error, created_at, updated_at)
         VALUES (@id, @domain, @jobDescription, @baseResume, @sectorFocus, @jobLocation, @transcript,
           @finalVerdict, @blueprint, @rewrittenResume, @rewrittenResumeJson,
           @resumeMeta, @llmUsed, @status, @error, @createdAt, @updatedAt)`,
      )
      .run(rowFromJob(job));
  }

  get(id: string): JobState | null {
    const row = this.db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as
      | JobRow
      | undefined;
    return row ? jobFromRow(row) : null;
  }

  list(): JobState[] {
    const rows = this.db
      .prepare("SELECT * FROM jobs ORDER BY created_at DESC")
      .all() as JobRow[];
    return rows.map(jobFromRow);
  }

  update(job: JobState): void {
    const row = rowFromJob(job);
    this.db
      .prepare(
        `UPDATE jobs SET
           domain = @domain,
           job_description = @jobDescription,
           base_resume = @baseResume,
           sector_focus = @sectorFocus,
           job_location = @jobLocation,
           transcript = @transcript,
           final_verdict = @finalVerdict,
           blueprint = @blueprint,
           rewritten_resume = @rewrittenResume,
           rewritten_resume_json = @rewrittenResumeJson,
           resume_meta = @resumeMeta,
           llm_used = @llmUsed,
           status = @status,
           error = @error,
           updated_at = @updatedAt
         WHERE id = @id`,
      )
      .run(row);
  }

  delete(id: string): boolean {
    return this.db.prepare("DELETE FROM jobs WHERE id = ?").run(id).changes > 0;
  }

  // --- Profile --------------------------------------------------------------

  getProfile(): UserProfile {
    const row = this.db
      .prepare("SELECT name, email, updated_at FROM profile WHERE id = 1")
      .get() as { name: string; email: string; updated_at: string } | undefined;
    return row ? { name: row.name, email: row.email, updatedAt: row.updated_at } : { name: "", email: "", updatedAt: "" };
  }

  upsertProfile(input: ProfileInput): UserProfile {
    const updatedAt = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO profile (id, name, email, updated_at)
         VALUES (1, @name, @email, @updatedAt)
         ON CONFLICT(id) DO UPDATE SET name = @name, email = @email, updated_at = @updatedAt`,
      )
      .run({ name: input.name, email: input.email, updatedAt });
    return { name: input.name, email: input.email, updatedAt };
  }

  // --- Saved resumes ----------------------------------------------------------

  listSavedResumes(): SavedResume[] {
    return (
      this.db
        .prepare("SELECT * FROM saved_resumes ORDER BY updated_at DESC")
        .all() as SavedResumeRow[]
    ).map(savedResumeFromRow);
  }

  createSavedResume(input: SavedResumeInput): SavedResume {
    const now = new Date().toISOString();
    const item: SavedResume = {
      id: newId("rs_"),
      title: input.title,
      content: input.content,
      createdAt: now,
      updatedAt: now,
    };
    this.db
      .prepare(
        `INSERT INTO saved_resumes (id, title, content, created_at, updated_at)
         VALUES (@id, @title, @content, @createdAt, @updatedAt)`,
      )
      .run(item);
    return item;
  }

  updateSavedResume(id: string, input: SavedResumeInput): SavedResume | null {
    const existing = this.getSavedResume(id);
    if (!existing) return null;
    const updated: SavedResume = {
      ...existing,
      title: input.title,
      content: input.content,
      updatedAt: new Date().toISOString(),
    };
    this.db
      .prepare(
        `UPDATE saved_resumes SET title = @title, content = @content, updated_at = @updatedAt
         WHERE id = @id`,
      )
      .run(updated);
    return updated;
  }

  getSavedResume(id: string): SavedResume | null {
    const row = this.db
      .prepare("SELECT * FROM saved_resumes WHERE id = ?")
      .get(id) as SavedResumeRow | undefined;
    return row ? savedResumeFromRow(row) : null;
  }

  deleteSavedResume(id: string): boolean {
    return this.db.prepare("DELETE FROM saved_resumes WHERE id = ?").run(id).changes > 0;
  }

  // --- Saved JDs ---------------------------------------------------------------

  listSavedJds(): SavedJd[] {
    return (
      this.db
        .prepare("SELECT * FROM saved_jds ORDER BY updated_at DESC")
        .all() as SavedJdRow[]
    ).map(savedJdFromRow);
  }

  createSavedJd(input: SavedJdInput): SavedJd {
    const now = new Date().toISOString();
    const item: SavedJd = {
      id: newId("jd_"),
      title: input.title,
      content: input.content,
      createdAt: now,
      updatedAt: now,
    };
    this.db
      .prepare(
        `INSERT INTO saved_jds (id, title, content, created_at, updated_at)
         VALUES (@id, @title, @content, @createdAt, @updatedAt)`,
      )
      .run(item);
    return item;
  }

  updateSavedJd(id: string, input: SavedJdInput): SavedJd | null {
    const existing = this.getSavedJd(id);
    if (!existing) return null;
    const updated: SavedJd = {
      ...existing,
      title: input.title,
      content: input.content,
      updatedAt: new Date().toISOString(),
    };
    this.db
      .prepare(
        `UPDATE saved_jds SET title = @title, content = @content, updated_at = @updatedAt
         WHERE id = @id`,
      )
      .run(updated);
    return updated;
  }

  getSavedJd(id: string): SavedJd | null {
    const row = this.db
      .prepare("SELECT * FROM saved_jds WHERE id = ?")
      .get(id) as SavedJdRow | undefined;
    return row ? savedJdFromRow(row) : null;
  }

  deleteSavedJd(id: string): boolean {
    return this.db.prepare("DELETE FROM saved_jds WHERE id = ?").run(id).changes > 0;
  }

  // --- LLM connections ---------------------------------------------------------

  listLlmConnections(): LlmConnection[] {
    return (
      this.db
        .prepare("SELECT * FROM llm_connections ORDER BY is_default DESC, updated_at DESC")
        .all() as LlmConnectionRow[]
    ).map((row) => connectionFromRow(row, this.secret));
  }

  getLlmConnection(id: string): LlmConnection | null {
    const row = this.db
      .prepare("SELECT * FROM llm_connections WHERE id = ?")
      .get(id) as LlmConnectionRow | undefined;
    return row ? connectionFromRow(row, this.secret) : null;
  }

  /**
   * Internal: returns the stored connection WITH its decrypted API key so the
   * jobs route can build a client. Never expose this object to the client.
   */
  getLlmConnectionWithKey(id: string): (LlmConnection & { apiKey: string }) | null {
    const row = this.db
      .prepare("SELECT * FROM llm_connections WHERE id = ?")
      .get(id) as LlmConnectionRow | undefined;
    if (!row) return null;
    const base = connectionFromRow(row, this.secret);
    const apiKey = row.api_key_encrypted
      ? decryptSecret(row.api_key_encrypted, this.secret)
      : "";
    return { ...base, apiKey };
  }

  createLlmConnection(input: LlmConnectionInput): LlmConnection {
    const now = new Date().toISOString();
    const apiKeyEncrypted = input.apiKey
      ? encryptSecret(input.apiKey, this.secret)
      : null;
    if (input.isDefault) this.clearDefaultLlmConnection();
    const id = newId("llm_");
    this.db
      .prepare(
        `INSERT INTO llm_connections
           (id, name, provider, base_url, model, temperature, api_key_encrypted, is_default, created_at, updated_at)
         VALUES (@id, @name, @provider, @baseUrl, @model, @temperature, @apiKeyEncrypted,
           @isDefault, @createdAt, @updatedAt)`,
      )
      .run({
        id,
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
    return this.getLlmConnection(id)!;
  }

  updateLlmConnection(id: string, patch: LlmConnectionUpdateInput): LlmConnection | null {
    const existing = this.db
      .prepare("SELECT * FROM llm_connections WHERE id = ?")
      .get(id) as LlmConnectionRow | undefined;
    if (!existing) return null;

    if (patch.isDefault) this.clearDefaultLlmConnection();
    const apiKeyEncrypted =
      patch.apiKey !== undefined
        ? encryptSecret(patch.apiKey, this.secret)
        : existing.api_key_encrypted;
    const isDefault =
      patch.isDefault !== undefined ? (patch.isDefault ? 1 : 0) : existing.is_default;

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
         WHERE id = @id`,
      )
      .run({
        id,
        name: patch.name ?? existing.name,
        provider: patch.provider ?? existing.provider,
        baseUrl: patch.baseUrl !== undefined ? patch.baseUrl : existing.base_url,
        model: patch.model !== undefined ? patch.model : existing.model,
        temperature:
          patch.temperature !== undefined ? patch.temperature : existing.temperature,
        apiKeyEncrypted,
        isDefault,
        updatedAt: new Date().toISOString(),
      });
    return this.getLlmConnection(id);
  }

  deleteLlmConnection(id: string): boolean {
    return this.db.prepare("DELETE FROM llm_connections WHERE id = ?").run(id).changes > 0;
  }

  private clearDefaultLlmConnection(): void {
    this.db.prepare(`UPDATE llm_connections SET is_default = 0`).run();
  }

  close(): void {
    this.db.close();
  }
}

interface SavedResumeRow {
  id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

interface SavedJdRow {
  id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

function savedResumeFromRow(row: SavedResumeRow): SavedResume {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function savedJdFromRow(row: SavedJdRow): SavedJd {
  return {
    id: row.id,
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

function rowFromJob(job: JobState): Record<string, unknown> {
  return {
    id: job.id,
    domain: job.domain,
    jobDescription: job.jobDescription,
    baseResume: job.baseResume,
    sectorFocus: job.sectorFocus ?? null,
    jobLocation: job.jobLocation ?? null,
    transcript: JSON.stringify(job.transcript),
    finalVerdict: job.finalVerdict ?? null,
    blueprint: job.blueprint ? JSON.stringify(job.blueprint) : null,
    rewrittenResume: job.rewrittenResume ?? null,
    rewrittenResumeJson: job.rewrittenResumeJson ?? null,
    resumeMeta: job.resumeMeta ? JSON.stringify(job.resumeMeta) : null,
    llmUsed: job.llmUsed ? JSON.stringify(job.llmUsed) : null,
    status: job.status,
    error: job.error ?? null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

function jobFromRow(row: JobRow): JobState {
  return {
    id: row.id,
    domain: row.domain as JobState["domain"],
    jobDescription: row.job_description,
    baseResume: row.base_resume,
    sectorFocus: row.sector_focus ?? undefined,
    jobLocation: row.job_location ?? undefined,
    transcript: parseJSON<TranscriptEntry[]>(row.transcript, []),
    finalVerdict: (row.final_verdict as JobState["finalVerdict"]) ?? undefined,
    blueprint: row.blueprint
      ? parseJSON<Blueprint>(row.blueprint, undefined as unknown as Blueprint)
      : undefined,
    rewrittenResume: row.rewritten_resume ?? undefined,
    rewrittenResumeJson: row.rewritten_resume_json ?? undefined,
    resumeMeta: row.resume_meta
      ? parseJSON<ResumeMeta>(row.resume_meta, undefined as unknown as ResumeMeta)
      : undefined,
    llmUsed: row.llm_used
      ? parseJSON<{ provider: string; model: string }>(
          row.llm_used,
          undefined as unknown as { provider: string; model: string },
        )
      : undefined,
    status: row.status as JobState["status"],
    error: row.error ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
