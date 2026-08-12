import { describe, expect, it } from "vitest";
import { hasNeutralLanguage, parseDecision } from "./nonNeutrality.js";

describe("parseDecision — marker patterns (highest confidence)", () => {
  it("parses [STRONG HIRE]", () => {
    const r = parseDecision(`Some analysis.\n[VERDICT]\n[STRONG HIRE] — strong evidence of capability`);
    expect(r?.decision).toBe("HIRE");
    expect(r?.reason).toContain("strong evidence");
  });

  it("parses [STRONG REJECT]", () => {
    expect(parseDecision(`[STRONG REJECT] — missing critical requirements`)?.decision).toBe("REJECT");
  });

  it("parses [DECISION: HIRE]", () => {
    expect(parseDecision(`[DECISION: HIRE] primary reason here`)?.decision).toBe("HIRE");
  });

  it("parses [VERDICT: REJECT]", () => {
    expect(parseDecision(`[VERDICT: REJECT] no fit`)?.decision).toBe("REJECT");
  });

  it("is case-insensitive", () => {
    expect(parseDecision(`A full evaluation of the candidate's background.\n[strong hire] — solid evidence`)?.decision).toBe("HIRE");
  });
});

describe("parseDecision — plain text + keyword fallbacks", () => {
  it("parses plain 'STRONG HIRE' without brackets", () => {
    expect(parseDecision(`Overall they look great. STRONG HIRE from me.`)?.decision).toBe("HIRE");
  });

  it("parses from the last-400-chars keyword tally when no marker exists", () => {
    const text = [
      "The candidate has a solid background.",
      "I have weighed the evidence carefully.",
      "My recommendation is to reject this application.",
      "Final word: reject.",
    ].join("\n");
    expect(parseDecision(text)?.decision).toBe("REJECT");
  });

  it("returns undefined for too-short / genuinely ambiguous text", () => {
    expect(parseDecision("ok")).toBeUndefined();
    expect(parseDecision("A balanced profile with strengths and some gaps to consider.")).toBeUndefined();
  });
});

describe("hasNeutralLanguage", () => {
  it("flags explicitly neutral/evasive phrasing", () => {
    for (const phrase of [
      "Overall a decent candidate with some good skills.",
      "I am on the fence about this one.",
      "Could go either way.",
      "A weak lean towards hire.",
      "The candidate seems average.",
      "Maybe we should proceed, not sure.",
    ]) {
      expect(hasNeutralLanguage(phrase)).toBe(true);
    }
  });

  it("does not flag decisive language", () => {
    expect(hasNeutralLanguage("STRONG HIRE — the evidence is unambiguous.")).toBe(false);
    expect(hasNeutralLanguage("STRONG REJECT — critical gaps.")).toBe(false);
  });
});
