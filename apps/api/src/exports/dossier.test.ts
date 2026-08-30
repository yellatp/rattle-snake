import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { JobState } from "@rattlesnake/shared";
import { createApp } from "../app.js";
import { removeDossier, writeDossier } from "./dossier.js";

function sampleJob(id: string): JobState {
  return {
    id,
    domain: "SDE",
    roleSlug: "swe",
    jobDescription: "JD",
    baseResume: "Resume",
    transcript: [
      {
        id: "e1",
        sender: "Marcus",
        role: "Senior Backend Engineer",
        round: 1,
        text: "[POSITIVE] Strong Kafka experience.",
        decision: "HIRE",
        decisionReason: "solid",
        createdAt: new Date().toISOString(),
      },
    ],
    status: "completed",
    finalVerdict: "SHORTLISTED",
    jdMeta: { company: "FinPay", role: "Backend Engineer", sector: "fintech", location: "US", team: "", roleSlug: "swe" },
    rewrittenResume: "# Resume\n\nHello",
    rewrittenResumeJson: '{"sections":[]}',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe("writeDossier", () => {
  it("saves the discussion and resume as Markdown + JSON", () => {
    const tmp = mkdtempSync(path.join(tmpdir(), "rsnake-exp-"));
    try {
      const job = sampleJob("run-exp-1");
      writeDossier(job, tmp);

      const discussion = readFileSync(path.join(tmp, job.id, "discussion.md"), "utf8");
      expect(discussion).toContain("# SME Discussion - run-exp-1");
      expect(discussion).toContain("Committee verdict: SHORTLISTED");
      expect(discussion).toContain("[POSITIVE] Strong Kafka experience.");

      const json = JSON.parse(readFileSync(path.join(tmp, job.id, "discussion.json"), "utf8")) as {
        jobId: string;
        entries: JobState["transcript"];
        analyses: unknown;
      };
      expect(json.jobId).toBe("run-exp-1");
      expect(json.entries).toHaveLength(1);
      expect(json.analyses).toBeNull();

      expect(readFileSync(path.join(tmp, job.id, "resume.md"), "utf8")).toBe("# Resume\n\nHello");
      expect(readFileSync(path.join(tmp, job.id, "resume.json"), "utf8")).toBe('{"sections":[]}');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("is best-effort: never throws, even for an unwritable target", () => {
    const tmp = path.join(mkdtempSync(path.join(tmpdir(), "rsnake-exp-")), "missing", "deep");
    expect(() => writeDossier(sampleJob("run-exp-2"), tmp)).not.toThrow();
  });
});

describe("removeDossier", () => {
  it("deletes the whole dossier directory for a job", () => {
    const tmp = mkdtempSync(path.join(tmpdir(), "rsnake-exp-"));
    try {
      const job = sampleJob("run-del-1");
      writeDossier(job, tmp);
      expect(existsSync(path.join(tmp, job.id, "discussion.md"))).toBe(true);

      removeDossier(job.id, tmp);
      expect(existsSync(path.join(tmp, job.id))).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("is best-effort and never throws for a missing directory", () => {
    const tmp = mkdtempSync(path.join(tmpdir(), "rsnake-exp-"));
    try {
      expect(() => removeDossier("run-del-2", tmp)).not.toThrow();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("exports API", () => {
  let tmp: string;
  let ctx: ReturnType<typeof createApp>;

  beforeEach(() => {
    tmp = mkdtempSync(path.join(tmpdir(), "rsnake-exps-"));
    process.env.LLM_PROVIDER = "mock";
    process.env.DATABASE_PATH = path.join(tmp, "test.db");
    process.env.EXPORTS_DIR = path.join(tmp, "exports");
    ctx = createApp();
  });

  afterEach(() => {
    ctx.store.close();
    delete process.env.LLM_PROVIDER;
    delete process.env.DATABASE_PATH;
    delete process.env.EXPORTS_DIR;
    rmSync(tmp, { recursive: true, force: true });
  });

  it("lists saved dossiers joined to the job summary", async () => {
    const job = sampleJob("run-exp-3");
    ctx.store.create(job);
    writeDossier(job, ctx.config.exportsDir);

    const res = await ctx.app.request("/api/exports");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { exports: Array<{ jobId: string; files: Array<{ name: string; size: number }>; verdict: string | null }> };
    expect(body.exports).toHaveLength(1);
    expect(body.exports[0]!.jobId).toBe("run-exp-3");
    expect(body.exports[0]!.verdict).toBe("SHORTLISTED");
    const names = body.exports[0]!.files.map((f) => f.name);
    expect(names).toEqual(["discussion.md", "discussion.json", "resume.md", "resume.json"]);
    expect(body.exports[0]!.files.every((f) => f.size > 0)).toBe(true);
  });

  it("downloads an artifact with an attachment disposition", async () => {
    const job = sampleJob("run-exp-4");
    ctx.store.create(job);
    writeDossier(job, ctx.config.exportsDir);

    const res = await ctx.app.request("/api/exports/run-exp-4/discussion.md");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain('filename="run-exp-4-discussion.md"');
    expect(await res.text()).toContain("# SME Discussion - run-exp-4");
  });

  it("rejects unknown files and traversal attempts", async () => {
    const job = sampleJob("run-exp-5");
    ctx.store.create(job);
    writeDossier(job, ctx.config.exportsDir);

    const unknown = await ctx.app.request("/api/exports/run-exp-5/secret.txt");
    expect(unknown.status).toBe(404);

    const traversal = await ctx.app.request("/api/exports/..%2F..%2Fpackage.json");
    expect(traversal.status).toBe(404);
  });

  it("returns an empty list when nothing has been saved yet", async () => {
    const res = await ctx.app.request("/api/exports");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { exports: unknown[] };
    expect(body.exports).toEqual([]);
  });

  it("DELETE /api/exports/:jobId removes the dossier from disk", async () => {
    const job = sampleJob("run-exp-6");
    ctx.store.create(job);
    writeDossier(job, ctx.config.exportsDir);
    expect(existsSync(path.join(ctx.config.exportsDir, job.id))).toBe(true);

    const del = await ctx.app.request(`/api/exports/${job.id}`, { method: "DELETE" });
    expect(del.status).toBe(204);
    expect(existsSync(path.join(ctx.config.exportsDir, job.id))).toBe(false);
  });

  it("DELETE /api/exports rejects traversal attempts", async () => {
    const res = await ctx.app.request("/api/exports/..%2F..%2Fpackage.json", { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});
