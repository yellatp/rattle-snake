import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { Blueprint, JobState, TranscriptEntry } from "@rattlesnake/shared";

interface JobRow {
  id: string;
  domain: string;
  job_description: string;
  base_resume: string;
  sector_focus: string | null;
  transcript: string;
  final_verdict: string | null;
  blueprint: string | null;
  rewritten_resume: string | null;
  status: string;
  error: string | null;
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
 * SQLite persistence for jobs and full debate transcripts.
 * Swap the implementation for Postgres/Redis later without touching callers.
 */
export class JobStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        domain TEXT NOT NULL,
        job_description TEXT NOT NULL,
        base_resume TEXT NOT NULL,
        sector_focus TEXT,
        transcript TEXT NOT NULL DEFAULT '[]',
        final_verdict TEXT,
        blueprint TEXT,
        rewritten_resume TEXT,
        status TEXT NOT NULL,
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  create(job: JobState): void {
    this.db
      .prepare(
        `INSERT INTO jobs
          (id, domain, job_description, base_resume, sector_focus, transcript,
           final_verdict, blueprint, rewritten_resume, status, error, created_at, updated_at)
         VALUES (@id, @domain, @jobDescription, @baseResume, @sectorFocus, @transcript,
           @finalVerdict, @blueprint, @rewrittenResume, @status, @error, @createdAt, @updatedAt)`,
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
           transcript = @transcript,
           final_verdict = @finalVerdict,
           blueprint = @blueprint,
           rewritten_resume = @rewrittenResume,
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

  close(): void {
    this.db.close();
  }
}

function rowFromJob(job: JobState): Record<string, unknown> {
  return {
    id: job.id,
    domain: job.domain,
    jobDescription: job.jobDescription,
    baseResume: job.baseResume,
    sectorFocus: job.sectorFocus ?? null,
    transcript: JSON.stringify(job.transcript),
    finalVerdict: job.finalVerdict ?? null,
    blueprint: job.blueprint ? JSON.stringify(job.blueprint) : null,
    rewrittenResume: job.rewrittenResume ?? null,
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
    transcript: parseJSON<TranscriptEntry[]>(row.transcript, []),
    finalVerdict: (row.final_verdict as JobState["finalVerdict"]) ?? undefined,
    blueprint: row.blueprint
      ? parseJSON<Blueprint>(row.blueprint, undefined as unknown as Blueprint)
      : undefined,
    rewrittenResume: row.rewritten_resume ?? undefined,
    status: row.status as JobState["status"],
    error: row.error ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
