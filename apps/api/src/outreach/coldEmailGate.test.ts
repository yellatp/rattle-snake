import { describe, expect, it } from "vitest";
import { runColdEmailGate } from "./coldEmailGate.js";

const GOOD = {
  subject: "Rohan Mehta - backend systems for your platform",
  body: [
    "Hi,",
    "I build and run backend systems that stay fast under real production load, and I enjoy owning them end to end, from design through on-call.",
    "Most of my work has been in event-driven services where correctness and latency both matter, and I like the kind of judgment that keeps systems simple as they grow.",
    "What drew me to your opening is the focus on reliable payments infrastructure; the same care I put into idempotent design and clean failure handling would transfer directly to your team's domain.",
    "Would a short 15-minute call this week work for you?",
  ].join("\n"),
  cta: "Would a short 15-minute call this week work for you?",
};

describe("coldEmailGate.runColdEmailGate", () => {
  it("passes a compliant first-person draft", () => {
    const result = runColdEmailGate(GOOD);
    expect(result.passed).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it("rejects third-person references to the candidate", () => {
    const result = runColdEmailGate({
      ...GOOD,
      body: GOOD.body.replace("I build and run", "The candidate builds and runs"),
    });
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.includes("third person"))).toBe(true);
  });

  it("rejects banned application-recap openers", () => {
    const result = runColdEmailGate({
      ...GOOD,
      body: GOOD.body.replace(
        "I build and run backend systems",
        "I am writing to apply for your role. I build and run backend systems",
      ),
    });
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.includes("Banned opener"))).toBe(true);
  });

  it("rejects tech laundry lists in a single sentence", () => {
    const result = runColdEmailGate({
      ...GOOD,
      body: GOOD.body.replace(
        "Most of my work has been in event-driven services where correctness and latency both matter, and I like the kind of judgment that keeps systems simple as they grow.",
        "I have shipped production work on Kafka, PostgreSQL, Kubernetes, Redis, Terraform, and AWS every day.",
      ),
    });
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.includes("technologies"))).toBe(true);
  });

  it("rejects achievement-metric spam", () => {
    const result = runColdEmailGate({
      ...GOOD,
      body: GOOD.body.replace(
        "the same care I put into idempotent design and clean failure handling would transfer directly to your team's domain.",
        "I cut latency by 40%, scaled to 2M+ orders, and saved 30% on cloud spend.",
      ),
    });
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.includes("number"))).toBe(true);
  });

  it("rejects bodies outside the word budget", () => {
    const result = runColdEmailGate({
      ...GOOD,
      body: "Hi,\nI build backend systems.\n" + GOOD.cta,
    });
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.includes("60-170 words"))).toBe(true);
  });

  it("rejects em-dashes and smart quotes", () => {
    const result = runColdEmailGate({
      ...GOOD,
      body: GOOD.body.replace("real production load", "real production load \u2014 every day"),
    });
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.includes("em-dashes"))).toBe(true);
  });

  it("rejects overly long subjects", () => {
    const result = runColdEmailGate({
      ...GOOD,
      subject: "A".repeat(80),
    });
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.includes("70 characters"))).toBe(true);
  });

  it("requires the ask to appear in the body", () => {
    const result = runColdEmailGate({
      ...GOOD,
      cta: "Would you be open to a quick chat about the role?",
    });
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.includes("verbatim"))).toBe(true);
  });
});
