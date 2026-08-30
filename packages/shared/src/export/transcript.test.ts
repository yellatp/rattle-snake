import { describe, expect, it } from "vitest";
import type { JobState } from "../types.js";
import {
  toTranscriptJson,
  toTranscriptMarkdown,
  toTranscriptPlaintext,
} from "./transcript.js";

function jobFor(transcript: JobState["transcript"]): JobState {
  return {
    id: "run-abc-1",
    domain: "SDE",
    roleSlug: "swe",
    jobDescription: "JD",
    baseResume: "Resume",
    transcript,
    status: "completed",
    finalVerdict: "SHORTLISTED",
    jdMeta: { company: "FinPay", role: "Backend Engineer", sector: "fintech", location: "US", team: "", roleSlug: "swe" },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

const TRANSCRIPT: JobState["transcript"] = [
  {
    id: "e1",
    sender: "Marcus",
    role: "Senior Backend Engineer",
    round: 1,
    text: "[POSITIVE] Strong Kafka experience.\n**Idempotency** is a plus.",
    decision: "HIRE",
    decisionReason: "solid",
    createdAt: new Date().toISOString(),
  },
  {
    id: "e2",
    sender: "Elena",
    role: "Hiring Manager",
    round: "ballot",
    text: "[VERDICT]\n[STRONG REJECT] not senior enough",
    decision: "REJECT",
    decisionReason: "seniority",
    createdAt: new Date().toISOString(),
  },
];

describe("toTranscriptMarkdown", () => {
  it("renders sender, role, round and verbatim text", () => {
    const md = toTranscriptMarkdown(jobFor(TRANSCRIPT));
    expect(md).toContain("# SME Discussion - run-abc-1");
    expect(md).toContain("Committee verdict: SHORTLISTED");
    expect(md).toContain("## Marcus (Senior Backend Engineer)");
    expect(md).toContain("Round 1 - 360 Analysis and Openings - HIRE");
    expect(md).toContain("[POSITIVE] Strong Kafka experience.");
    expect(md).toContain("## Elena (Hiring Manager)");
    expect(md).toContain("Final Ballot - REJECT");
  });
});

describe("toTranscriptPlaintext", () => {
  it("renders the discussion without markdown headings", () => {
    const text = toTranscriptPlaintext(jobFor(TRANSCRIPT));
    expect(text).toContain("SME DISCUSSION - run-abc-1");
    expect(text).toContain("Marcus (Senior Backend Engineer)");
    expect(text).toContain("Round 1 - 360 Analysis and Openings - HIRE");
    expect(text).toContain("[VERDICT]");
  });
});

describe("toTranscriptJson", () => {
  it("serializes job context and every entry", () => {
    const json = toTranscriptJson(jobFor(TRANSCRIPT));
    const parsed = JSON.parse(json) as {
      jobId: string;
      verdict: string;
      entries: JobState["transcript"];
      analyses: JobState["analyses"];
    };
    expect(parsed.jobId).toBe("run-abc-1");
    expect(parsed.verdict).toBe("SHORTLISTED");
    expect(parsed.entries).toHaveLength(2);
    expect(parsed.entries[0]!.sender).toBe("Marcus");
    expect(parsed.analyses).toBeNull();
  });
});
