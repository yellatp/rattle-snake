import { describe, expect, it } from "vitest";
import type { JobState } from "@rattlesnake/shared";
import { JobStore } from "../db/store.js";
import { createMockClient } from "../llm/client.js";
import { loadConfig } from "../config.js";
import { isRunActive, requestCancel, runCommittee } from "./runner.js";

const JD = `Senior Backend Engineer - payments platform. 5+ years in TypeScript or Go.
Event-driven architecture with Kafka, PostgreSQL at scale, PCI-DSS awareness.`;

const RESUME = `Backend engineer with 6 years TypeScript, Kafka, PostgreSQL, distributed systems.`;

function makeJob(id: string): JobState {
  return {
    id,
    domain: "SDE",
    jobDescription: JD,
    baseResume: RESUME,
    transcript: [],
    status: "pending",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe("runCommittee cancellation", () => {
  it("marks the job cancelled when requestCancel is called mid-run", async () => {
    process.env.LLM_PROVIDER = "mock";
    const store = new JobStore(":memory:");
    const job = makeJob("run-cancel-1");
    store.create(job);

    // Fire-and-forget like the route does, then cancel synchronously so the
    // flag is set before the runner's first post-await cancellation check.
    const running = runCommittee(job.id, store, createMockClient(), loadConfig());
    expect(requestCancel(job.id)).toBe(true);
    await running;

    const stored = store.get(job.id)!;
    expect(stored.status).toBe("cancelled");
    expect(stored.error).toContain("cancelled");
    expect(stored.transcript).toHaveLength(0);
    expect(isRunActive(job.id)).toBe(false);
  });

  it("returns false for a job this process is not running", () => {
    expect(requestCancel("run-never-started")).toBe(false);
  });
});
