import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { JobState, ResumeEvaluationInput } from "@rattlesnake/shared";
import { JobStore } from "../db/store.js";
import { MemoryEventBus } from "../events/memory.js";
import { createMockClient } from "../llm/mock.js";
import {
  checkNetNewClaims,
  computeComparison,
  weightedTotal,
} from "./resumeReview.js";
import { runResumeAb } from "./resumeAb.js";

const JD =
  "Senior Backend Engineer, FinTech. 5+ years TypeScript/Go. Kafka, PostgreSQL at scale, production on-call.";
const RESUME =
  "Rohan Mehta - Backend Engineer (6 years)\nSenior Software Engineer - RetailWorks\n- Reduced order API latency by 40% at 2M+ monthly orders\nSkills: TypeScript, Go, PostgreSQL, Kafka";

function evalInput(scores: [number, number, number, number]): ResumeEvaluationInput {
  return {
    scores: {
      jdCoverage: scores[0]!,
      credibility: scores[1]!,
      clarity: scores[2]!,
      atsReadiness: scores[3]!,
    },
    strengths: [],
    issues: [],
    verdict: "ship",
  };
}

describe("resumeReview.computeComparison", () => {
  it("recommends v2 when it leads beyond the tie band", () => {
    const c = computeComparison(evalInput([70, 70, 70, 70]), evalInput([85, 85, 85, 85]));
    expect(c.recommendation).toBe("v2");
    expect(c.v1Total).toBe(70);
    expect(c.v2Total).toBe(85);
    expect(c.dimensionDeltas.jdCoverage).toBe(15);
    expect(c.rationale).toContain("Version 2 leads");
  });

  it("recommends v1 when it leads beyond the tie band", () => {
    const c = computeComparison(evalInput([90, 90, 90, 90]), evalInput([70, 70, 70, 70]));
    expect(c.recommendation).toBe("v1");
    expect(c.rationale).toContain("Version 1 leads");
  });

  it("calls a tie inside the 3-point band", () => {
    const c = computeComparison(evalInput([80, 80, 80, 80]), evalInput([82, 82, 82, 82]));
    expect(c.recommendation).toBe("tie");
    expect(c.rationale).toContain("within 3 points");
  });

  it("uses the locked weights (jdCoverage 0.35, credibility 0.30, clarity 0.20, atsReadiness 0.15)", () => {
    expect(weightedTotal({ jdCoverage: 100, credibility: 0, clarity: 0, atsReadiness: 0 })).toBe(35);
    expect(weightedTotal({ jdCoverage: 0, credibility: 100, clarity: 0, atsReadiness: 0 })).toBe(30);
    expect(weightedTotal({ jdCoverage: 0, credibility: 0, clarity: 100, atsReadiness: 0 })).toBe(20);
    expect(weightedTotal({ jdCoverage: 0, credibility: 0, clarity: 0, atsReadiness: 100 })).toBe(15);
  });
});

describe("resumeReview.checkNetNewClaims", () => {
  it("flags tokens present in v2 but absent from v1 (warn-only)", () => {
    const netNew = checkNetNewClaims("Built payment pipelines", "Built payment pipelines with QUANTUM blockchain");
    expect(netNew).toContain("quantum");
    expect(netNew).toContain("blockchain");
  });

  it("returns nothing when the texts match", () => {
    expect(checkNetNewClaims("same text", "same text")).toEqual([]);
  });
});

describe("resumeAb.runResumeAb", () => {
  let tmp: string;
  let store: JobStore;
  let bus: MemoryEventBus;
  let job: JobState;

  beforeEach(() => {
    tmp = mkdtempSync(path.join(tmpdir(), "rsnake-ab-"));
    store = new JobStore(path.join(tmp, "ab.db"));
    bus = new MemoryEventBus();
    job = {
      id: store.nextJobId(),
      domain: "SWE",
      roleSlug: "swe",
      jobDescription: JD,
      baseResume: RESUME,
      transcript: [],
      status: "completed",
      finalVerdict: "SHORTLISTED",
      blueprint: {
        objections: [],
        strengths: ["strong systems record"],
        requiredChanges: [],
        sectorNotes: [],
        pivotFactors: [],
        verdicts: { Alex: "HIRE" },
        consensus: "SHORTLISTED",
        credibilityFindings: [],
        authenticityFlags: [],
        missingSkillsRanked: [],
        requirementMap: [],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    store.create(job);
  });

  afterEach(() => {
    store.close();
    rmSync(tmp, { recursive: true, force: true });
  });

  it("runs v1 -> eval1 -> v2 -> eval2 -> comparison with the mock provider", async () => {
    await runResumeAb(job.id, store, createMockClient(), bus);

    const after = store.get(job.id)!;
    expect(after.abPhase).toBe("done");
    expect(after.comparison).toBeTruthy();
    expect(after.comparison?.recommendation).toBe("tie");

    const versions = store.listResumeVersions(job.id);
    expect(versions.map((v) => v.version).sort()).toEqual([1, 2]);
    for (const version of versions) {
      expect(version.markdown.length).toBeGreaterThan(0);
      expect(version.evaluationJson).toBeTruthy();
    }
  });

  it("reuses an existing generated resume as v1 instead of regenerating", async () => {
    const first = await import("../resume/engine.js");
    const generated = await first.generateSophisticatedResume(
      store.get(job.id)!,
      store.get(job.id)!.blueprint!,
      createMockClient(),
    );
    const withResume = store.get(job.id)!;
    withResume.rewrittenResume = generated.markdown;
    withResume.rewrittenResumeJson = generated.json;
    store.update(withResume);

    await runResumeAb(job.id, store, createMockClient(), bus);
    const versions = store.listResumeVersions(job.id);
    const v1 = versions.find((v) => v.version === 1);
    expect(v1?.markdown).toBe(generated.markdown);
  });

  it("resumes from the persisted cursor on retry (idempotent)", async () => {
    await runResumeAb(job.id, store, createMockClient(), bus);
    const events = store.listResumeVersions(job.id);
    await runResumeAb(job.id, store, createMockClient(), bus);
    const again = store.listResumeVersions(job.id);
    expect(again.length).toBe(events.length);
    expect(again.map((v) => v.updatedAt)).toEqual(events.map((v) => v.updatedAt));
  });

  it("rejects a job that is not completed", async () => {
    const pending = store.get(job.id)!;
    pending.status = "debating";
    store.update(pending);
    await expect(runResumeAb(job.id, store, createMockClient(), bus)).rejects.toThrow(
      /completed with a blueprint/,
    );
  });
});
