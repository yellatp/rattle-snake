import { describe, expect, it } from "vitest";
import type { AgentConfig } from "@rattlesnake/shared";
import {
  applyComputedWeights,
  BASE_SEAT_WEIGHTS,
  computeWeights,
  type WeightContext,
} from "./weighting.js";

function ctx(overrides: Partial<WeightContext> = {}): WeightContext {
  return { domain: "SDE", ...overrides };
}

const committee: AgentConfig[] = [
  { name: "A", role: "Senior Software Engineer", focus: "x", domain: "SDE", kind: "senior", weight: 1 },
  { name: "B", role: "Engineering Manager", focus: "x", domain: "SDE", kind: "manager", weight: 1 },
  { name: "C", role: "Staff Engineer", focus: "x", domain: "SDE", kind: "staff", weight: 1.2 },
  { name: "D", role: "Principal Engineer", focus: "x", domain: "SDE", kind: "principal", weight: 1.3 },
  { name: "E", role: "Lead Technical Recruiter", focus: "x", domain: "SDE", kind: "recruiter", weight: 0.8 },
  { name: "F", role: "Industry Sector Specialist", focus: "x", domain: "SDE", kind: "sector", weight: 1 },
];

describe("computeWeights", () => {
  it("keeps the historical baseline for an unqualified mid-level run", () => {
    expect(computeWeights(ctx({ experienceYears: 5 }))).toEqual(BASE_SEAT_WEIGHTS);
  });

  it("boosts peer seats for a principal-band candidate", () => {
    const w = computeWeights(ctx({ experienceYears: 12 }));
    expect(w.principal).toBeGreaterThan(BASE_SEAT_WEIGHTS.principal);
    expect(w.staff).toBeGreaterThan(BASE_SEAT_WEIGHTS.staff);
    expect(w.senior).toBeLessThan(BASE_SEAT_WEIGHTS.senior);
  });

  it("boosts senior and recruiter seats for an entry-level candidate", () => {
    const w = computeWeights(ctx({ experienceYears: 1 }));
    expect(w.senior).toBeGreaterThan(BASE_SEAT_WEIGHTS.senior);
    expect(w.recruiter).toBeGreaterThan(BASE_SEAT_WEIGHTS.recruiter);
  });

  it("raises the sector seat when a sector is named", () => {
    const w = computeWeights(ctx({ experienceYears: 5, sectorText: "FinTech payments" }));
    expect(w.sector).toBeGreaterThan(BASE_SEAT_WEIGHTS.sector);
  });

  it("raises staff/principal in depth-heavy domains", () => {
    const w = computeWeights(ctx({ experienceYears: 5, domain: "ML_ENGINEERING" }));
    expect(w.staff).toBeGreaterThan(BASE_SEAT_WEIGHTS.staff);
    expect(w.principal).toBeGreaterThan(BASE_SEAT_WEIGHTS.principal);
  });

  it("raises the manager seat for leadership-heavy sectors", () => {
    const w = computeWeights(ctx({ experienceYears: 5, sectorText: "team leadership" }));
    expect(w.manager).toBeGreaterThan(BASE_SEAT_WEIGHTS.manager);
  });
});

describe("applyComputedWeights", () => {
  it("overrides each seat weight and leaves other fields untouched", () => {
    const weighted = applyComputedWeights(committee, ctx({ experienceYears: 12, domain: "AI_ENGINEERING" }));
    expect(weighted).toHaveLength(committee.length);
    expect(weighted[3]!.weight).toBeGreaterThan(weighted[0]!.weight);
    expect(weighted[0]!.name).toBe("A");
    expect(weighted[0]!.kind).toBe("senior");
    expect(weighted[0]!.weight).toBeLessThan(BASE_SEAT_WEIGHTS.senior);
  });

  it("does not mutate the input committee", () => {
    const before = committee[0]!.weight;
    applyComputedWeights(committee, ctx({ experienceYears: 1 }));
    expect(committee[0]!.weight).toBe(before);
  });

  it("keeps agent weights for seats without a kind (legacy fixtures)", () => {
    const legacy: AgentConfig[] = [
      { name: "X", role: "Staff Software Architect", focus: "x", domain: "SDE", weight: 1.5 },
    ];
    const weighted = applyComputedWeights(legacy, ctx({ experienceYears: 5 }));
    expect(weighted[0]!.weight).toBe(1.5);
  });
});
