import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { JobState, UserProfile } from "@rattlesnake/shared";
import { createApp } from "../app.js";

let clockSeq = 0;
let lastUpdatedMs = Infinity;

function sampleJob(id: string, profileId: string | undefined, jd: { company?: string; role?: string }): JobState {
  const now = Date.now();
  clockSeq += 1;
  let updated = now - clockSeq;
  if (updated >= lastUpdatedMs) updated = lastUpdatedMs - 1;
  lastUpdatedMs = updated;
  return {
    id,
    domain: "SDE",
    roleSlug: "swe",
    jobDescription: "JD",
    baseResume: "Resume",
    transcript: [],
    profileId,
    jdMeta: { company: jd.company ?? "Unknown company", role: jd.role ?? "Backend Engineer", sector: "fintech", location: "US", team: "", roleSlug: "swe" },
    status: "completed",
    finalVerdict: "SHORTLISTED",
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(updated).toISOString(),
  };
}

interface StorageBody {
  profiles: Array<{ profile: { id: string; name: string; isMaster: boolean }; groups: Array<{ company: string; role: string; runs: Array<{ jobId: string; hasResume: boolean; hasCoverLetter: boolean; hasInterview: boolean }> }> }>;
  unassigned: Array<{ company: string; role: string; runs: Array<{ jobId: string }> }>;
}

describe("storage API", () => {
  let tmp: string;
  let ctx: ReturnType<typeof createApp>;

  beforeEach(() => {
    tmp = mkdtempSync(path.join(tmpdir(), "rsnake-store-"));
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

  it("groups runs by profile and then by company + role", async () => {
    const profileA = ctx.store.createProfile({ name: "Rohan Mehta" });
    const profileB = ctx.store.createProfile({ name: "Aisha Khan" });

    ctx.store.create(sampleJob("run-1", profileA.id, { company: "FinPay", role: "Backend Engineer" }));
    ctx.store.create(sampleJob("run-2", profileA.id, { company: "FinPay", role: "Backend Engineer" }));
    ctx.store.create(sampleJob("run-3", profileA.id, { company: "NovaBank", role: "Platform Engineer" }));
    ctx.store.create(sampleJob("run-4", profileB.id, { company: "Skyline", role: "Data Scientist" }));

    const res = await ctx.app.request("/api/storage");
    expect(res.status).toBe(200);
    const body = (await res.json()) as StorageBody;

    expect(body.profiles).toHaveLength(2);

    const a = body.profiles.find((p) => p.profile.id === profileA.id)!;
    expect(a.groups).toHaveLength(2);
    const finpay = a.groups.find((g) => g.company === "FinPay")!;
    expect(finpay.role).toBe("Backend Engineer");
    expect(finpay.runs.map((r) => r.jobId)).toEqual(["run-1", "run-2"]);

    const nova = a.groups.find((g) => g.company === "NovaBank")!;
    expect(nova.runs).toHaveLength(1);

    const b = body.profiles.find((p) => p.profile.id === profileB.id)!;
    expect(b.groups).toHaveLength(1);
    expect(b.groups[0]!.company).toBe("Skyline");
    expect(body.unassigned).toEqual([]);
  });

  it("reports profiles without any runs as absent and keeps orphan runs unassigned", async () => {
    ctx.store.createProfile({ name: "Empty Profile" });
    ctx.store.create(sampleJob("run-orphan", undefined, { company: "Lone", role: "Ops Lead" }));

    const res = await ctx.app.request("/api/storage");
    const body = (await res.json()) as StorageBody;

    expect(body.profiles).toEqual([]);
    expect(body.unassigned).toHaveLength(1);
    expect(body.unassigned[0]!.company).toBe("Lone");
    expect(body.unassigned[0]!.runs[0]!.jobId).toBe("run-orphan");
  });

  it("marks hasResume for runs that produced a resume", async () => {
    const profile = ctx.store.createProfile({ name: "Sam Ortiz" });
    const withResume = sampleJob("run-r", profile.id, { company: "FinPay", role: "Backend Engineer" });
    withResume.rewrittenResume = "# Resume";
    ctx.store.create(withResume);
    ctx.store.create(sampleJob("run-no", profile.id, { company: "FinPay", role: "Backend Engineer" }));

    const res = await ctx.app.request("/api/storage");
    const body = (await res.json()) as StorageBody;
    const runs = body.profiles[0]!.groups[0]!.runs;
    expect(runs.find((r) => r.jobId === "run-r")!.hasResume).toBe(true);
    expect(runs.find((r) => r.jobId === "run-no")!.hasResume).toBe(false);
  });

  it("marks hasCoverLetter and hasInterview for runs that produced those artifacts", async () => {
    const profile = ctx.store.createProfile({ name: "Dana Whitfield" });
    const full = sampleJob("run-full", profile.id, { company: "FinPay", role: "Backend Engineer" });
    full.coverLetterDraft = { subject: "Cover", salutation: "Hi", body: "Body", closing: "Thanks" };
    full.interviewPlan = {
      roleLabel: "Backend Engineer",
      summary: "Three stages.",
      pipeline: [{ name: "Screen", duration: "30 min", format: "Video", focus: "Intro", typicalQuestions: [] }],
      experts: [],
      topics: [],
      prepTips: [],
    };
    ctx.store.create(full);
    ctx.store.create(sampleJob("run-none", profile.id, { company: "FinPay", role: "Backend Engineer" }));

    const res = await ctx.app.request("/api/storage");
    const body = (await res.json()) as StorageBody;
    const runs = body.profiles[0]!.groups[0]!.runs;
    const fullRun = runs.find((r) => r.jobId === "run-full")!;
    expect(fullRun.hasCoverLetter).toBe(true);
    expect(fullRun.hasInterview).toBe(true);
    const noneRun = runs.find((r) => r.jobId === "run-none")!;
    expect(noneRun.hasCoverLetter).toBe(false);
    expect(noneRun.hasInterview).toBe(false);
  });
});
