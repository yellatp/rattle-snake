import { describe, expect, it } from "vitest";
import {
  getCommitteeForRole,
  ROLE_COMMITTEES,
  ROLE_COMMITTEE_SLUGS,
  ROLE_DETAILS,
  SEAT_KINDS,
} from "./roleCommittees.js";
import { getCommitteeForDomain } from "./index.js";
import { SECTOR_REGISTRY, sectorPersona } from "../sectors.js";

/**
 * The 42 slugs mirror apps/api/src/resume/roleRegistry.ts. Keep both in sync.
 * If this list ever diverges, add/remove entries in BOTH files.
 */
const EXPECTED_ROLE_SLUGS = [
  // SDE
  "swe", "frontend_engineer", "backend_engineer", "fullstack_engineer", "qa_engineer",
  // AI engineering
  "ai_engineer", "ai_researcher", "ai_inference_engineer", "ai_developer",
  "ai_implementation_engineer", "ai_specialist", "ai_analyst", "nlp_engineer",
  "computer_vision_engineer",
  // ML engineering
  "ml_engineer", "mlops_engineer", "data_scientist", "research_scientist",
  // Data engineering
  "data_engineer", "data_platform_engineer", "data_architect",
  // Data science & analytics
  "data_analyst", "bi_analyst", "product_analyst", "gtm_analyst",
  "market_research_analyst", "pricing_analyst",
  // Cybersecurity
  "cybersecurity_analyst", "penetration_tester", "soc_analyst", "cloud_security_engineer",
  // Networking
  "network_engineer", "cloud_engineer",
  // DevOps / SRE
  "devops", "site_reliability_engineer",
  // Project & product management
  "product_manager", "project_manager", "business_analyst", "operations_analyst",
  "business_strategist", "marketing_analyst", "marketing_strategist",
];

describe("ROLE_COMMITTEES (WS-4 role-driven committees)", () => {
  it("maps all 42 role slugs to a committee", () => {
    expect(ROLE_COMMITTEE_SLUGS.length).toBe(42);
    for (const slug of EXPECTED_ROLE_SLUGS) {
      expect(ROLE_COMMITTEES[slug], `missing committee for ${slug}`).toBeTruthy();
      expect(ROLE_DETAILS[slug], `missing spec for ${slug}`).toBeTruthy();
    }
  });

  it("every committee has exactly 6 seats and one Sector Specialist", () => {
    for (const [slug, committee] of Object.entries(ROLE_COMMITTEES)) {
      expect(committee, slug).toHaveLength(6);
      expect(committee.filter((a) => a.isSectorSpecialist), slug).toHaveLength(1);
      const names = new Set(committee.map((a) => a.name));
      expect(names.size, `duplicate seat name in ${slug}`).toBe(6);
      expect(committee.map((a) => a.kind), slug).toEqual([...SEAT_KINDS]);
    }
  });

  it("the staff Specialist seat is role-specific", () => {
    const ml = ROLE_COMMITTEES["ml_engineer"]!;
    const analyst = ROLE_COMMITTEES["data_analyst"]!;
    expect(ml[2]!.role).toContain("Machine Learning");
    expect(analyst[2]!.role).toContain("Data Analysis");
    expect(ml[2]!.focus).not.toBe(analyst[2]!.focus);
  });

  it("the senior seat carries the role label", () => {
    expect(ROLE_COMMITTEES["backend_engineer"]![0]!.role).toBe("Senior Backend Engineer");
    expect(ROLE_COMMITTEES["swe"]![0]!.role).toBe("Senior Software Engineer");
  });

  it("sector override changes the Sector Specialist role + focus", () => {
    const committee = getCommitteeForRole("ml_engineer", "Audio / Sound")!;
    const specialist = committee.find((a) => a.isSectorSpecialist)!;
    expect(specialist.role).toContain("Audio / Sound");
    expect(specialist.focus).toContain("transferable skills");
  });

  it("returns the committee untouched without a sector override", () => {
    expect(getCommitteeForRole("swe")).toEqual(ROLE_COMMITTEES.swe);
  });

  it("returns undefined for an unknown slug", () => {
    expect(getCommitteeForRole("definitely-not-a-role")).toBeUndefined();
  });

  it.each([
    [1, ["senior", "recruiter", "sector"]],
    [5, ["senior", "manager", "recruiter", "sector"]],
    [8, ["senior", "manager", "staff", "recruiter", "sector"]],
    [15, ["manager", "staff", "principal", "recruiter", "sector"]],
  ])("filters a role committee to the %i-year band", (years, expectedKinds) => {
    const committee = getCommitteeForRole("swe", undefined, years)!;
    expect(committee.map((a) => a.kind).sort()).toEqual([...expectedKinds].sort());
  });

  it("keeps all six seats when the experience years are unknown", () => {
    expect(getCommitteeForRole("swe")).toHaveLength(6);
  });
});

describe("getCommitteeForDomain role-first selection", () => {
  it("prefers the role-driven committee when a roleSlug is given", () => {
    const committee = getCommitteeForDomain("ML_ENGINEERING", undefined, "data_scientist");
    expect(committee).toEqual(ROLE_COMMITTEES.data_scientist);
  });

  it("applies the sector override on the role committee", () => {
    const committee = getCommitteeForDomain("SDE", "HealthTech", "swe");
    const specialist = committee.find((a) => a.isSectorSpecialist)!;
    expect(specialist.role).toContain("HealthTech");
  });

  it("applies the experience band on the role committee", () => {
    const committee = getCommitteeForDomain("SDE", undefined, "swe", 1);
    expect(committee.map((a) => a.kind).sort()).toEqual(["recruiter", "sector", "senior"]);
  });

  it("falls back to the domain committee without a roleSlug", () => {
    expect(getCommitteeForDomain("SDE")).toEqual(getCommitteeForDomain("SDE", undefined));
    const viaDomain = getCommitteeForDomain("SDE");
    expect(viaDomain.some((a) => a.name === "Alex")).toBe(true);
  });
});

describe("SECTOR_REGISTRY (sector personas)", () => {
  it("provides curated personas including the WS-4 examples", () => {
    const labels = SECTOR_REGISTRY.map((s) => s.label.toLowerCase());
    for (const expected of [
      "audio / sound",
      "frontier model research",
      "customer & consumer insights",
      "fintech",
      "healthcare / healthtech",
      "e-commerce",
      "gaming",
      "energy",
      "robotics",
    ]) {
      expect(labels, expected).toContain(expected);
    }
  });

  it("returns a registry persona for a known sector", () => {
    const persona = sectorPersona("fintech");
    expect(persona.toLowerCase()).toContain("fintech");
  });

  it("falls back to the generic mandate for unknown sectors", () => {
    const persona = sectorPersona("Quantum Fisheries");
    expect(persona).toContain("Quantum Fisheries");
    expect(persona).toContain("transferable skills");
  });
});
