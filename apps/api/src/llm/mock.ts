import type { LLMClient } from "./types.js";

const MOCK_REASONS: Record<string, string[]> = {
  recruiter: [
    "strong keyword alignment with the JD and a metric-dense history",
    "prior title/seniority maps cleanly to the target level",
  ],
  architect: [
    "shows real architectural ownership with explicit trade-offs and scale numbers",
    "evidence of system design depth (concurrency, resilience, evaluation metrics)",
  ],
  lead: [
    "signals production shipping velocity, CI/CD ownership and debugging skill",
    "delivery outcomes are measurable (latency, uptime, throughput)",
  ],
  manager: [
    "clear ROI signals and developer-productivity leverage in the track record",
    "the profile would raise the average output of the team, not just fill a seat",
  ],
  sector: [
    "prior exposure maps cleanly to the target sector's stack and workflows",
    "transferable skills are concrete and named, not generic",
  ],
};

const MOCK_CONCERNS: Record<string, string[]> = {
  recruiter: [
    "thin metric density — several bullets describe activities, not outcomes",
    "gaps between claimed scope and implied team size are unexplained",
  ],
  architect: [
    "no explicit numbers for scale, load, or quality gates in key projects",
    "design trade-offs are asserted rather than compared against alternatives",
  ],
  lead: [
    "unclear how incidents/debugging was owned — no on-call or SLO evidence",
    "no proof the candidate can carry a project through production hard-decks",
  ],
  manager: [
    "impact is stated at feature level, not business outcome level",
    "no cost/benefit framing — the resume reads as activity, not investment",
  ],
  sector: [
    "no explicit compliance or regulatory context for the target sector",
    "transferability argument would need onboarding ramp-up, unproven",
  ],
};

const MOCK_PIVOTS: Record<string, string> = {
  recruiter: "metric density: bullets that quantify outcomes outweigh title alignment gaps",
  architect: "scale evidence: verifiable architectural ownership trumps stylistic concerns",
  lead: "production ownership: concrete delivery proof settles the risk either way",
  manager: "ROI framing: measurable business impact is the deciding factor",
  sector: "transferability: whether prior sector skills translate to this sector decides the fit",
};

const MOCK_LENS: Record<string, string> = {
  recruiter: "recruiter's lens — matching, market seniority and signal density",
  architect: "architect's lens — scale, trade-offs and systemic ownership",
  lead: "lead's lens — delivery, reliability and team dynamics",
  manager: "manager's lens — ROI, leverage and business outcomes",
  sector: "sector specialist's lens — domain fit and transferability",
};

/** Valid role-template JSON for the mock resume engine output. */
const MOCK_RESUME_JSON = JSON.stringify({
  role: "Software Engineer",
  slug: "swe",
  contact: {
    name: "Rohan Mehta",
    location: "Bengaluru, India",
    phone: "",
    email: "rohan.mehta@example.com",
    linkedin: "linkedin.com/in/rohanmehta",
    github: "github.com/rohanmehta",
    portfolio: "",
  },
  sections: {
    summary: {
      content:
        "Backend engineer with 6 years of experience building low-latency event-driven systems in TypeScript and Go. Reduced API latency by 40%, migrated a monolith to Kafka-based microservices, and owns production reliability with on-call and SLO work for real-time payment processing.",
      editable: true,
    },
    skills: {
      categories: [
        { name: "Languages", items: ["TypeScript", "Go", "Java"] },
        { name: "Data & Messaging", items: ["PostgreSQL", "Redis", "Kafka", "SQS"] },
        { name: "Infrastructure", items: ["Docker", "Kubernetes", "AWS", "Terraform", "CI/CD"] },
      ],
      editable: true,
    },
    experience: [
      {
        id: "e1",
        title: "Senior Software Engineer",
        company: "RetailWorks",
        location: "Bengaluru",
        dates: "2021 – Present",
        bullets: [
          "Reduced order-processing API latency by 40% across 2M+ monthly orders by refactoring PostgreSQL query plans and adding Redis-backed caching with idempotent retry semantics.",
          "Migrated a 12-service monolith to event-driven microservices on Kafka, cutting deploy time from 45min to 5min and eliminating order-sync failures for merchant settlement.",
          "Owned production reliability: idempotent retry handling, SQS dead-letter queues, and on-call runbooks with PCI-DSS-aware payment processing (MTTR down 30%).",
        ],
      },
      {
        id: "e2",
        title: "Software Engineer",
        company: "TravelBuddy",
        location: "Remote",
        dates: "2019 – 2021",
        bullets: [
          "Built RESTful booking APIs in Node.js/PostgreSQL serving 1M+ requests/day.",
          "Designed a Redis caching layer that reduced read load on the primary database by 35%.",
        ],
      },
    ],
    education: [{ degree: "B.Tech Computer Science", institution: "NIT", dates: "2014 – 2018" }],
    certifications: ["AWS Certified Solutions Architect"],
    coreCompetencies: [
      "Distributed Systems",
      "System Design",
      "Event-Driven Architecture",
      "Performance Optimization",
      "Idempotency",
    ],
  },
  ats_keywords: [],
  system_prompt_ref: "swe",
  changed_sections: ["e1", "e2"],
});

const MOCK_MODERATION_JSON = JSON.stringify({
  score: 92,
  approved: true,
  summaryVerdict: "Score 92 — strong X-Y-Z bullets aligned to the JD.",
  bannedPhrases: [],
  issues: [],
  suggestions: [],
});

/**
 * Deterministic, correctly-formatted mock response for a system/user prompt.
 * Shared by the offline mock client AND the fake local LLM servers used by the
 * functional test suite (which proves each provider wire format over real HTTP).
 */
export function mockResponseFor(system: string, _user: string): string {
  // Sophisticated resume engine: role-targeted resume-writer system prompt.
  if (system.includes("senior resume writer")) {
    return MOCK_RESUME_JSON;
  }
  // Sophisticated resume engine: elite resume quality auditor.
  if (system.includes("resume quality auditor")) {
    return MOCK_MODERATION_JSON;
  }

  const nameMatch = system.match(/You are ([A-Za-z .]+), acting as the ([^.\n]+)\./);
  const name = nameMatch?.[1]?.trim() ?? "Committee Member";
  const role = nameMatch?.[2]?.trim() ?? "Committee Member";

  // Persona is derived ONLY from the agent's own role line. The cross-talk and
  // ballot prompts embed the Sector Specialist mandate for every agent, so
  // matching on the body text would assign the sector tone to all of them.
  const tone = role.toLowerCase().includes("sector")
    ? "sector"
    : role.toLowerCase().includes("recruiter")
      ? "recruiter"
      : role.toLowerCase().includes("architect") ||
          role.toLowerCase().includes("data scientist") ||
          role.toLowerCase().includes("quant")
        ? "architect"
        : role.toLowerCase().includes("lead") ||
            role.toLowerCase().includes("desk")
          ? "lead"
          : "manager";

  const reasons = MOCK_REASONS[tone] ?? MOCK_REASONS["manager"]!;
  const concerns = MOCK_CONCERNS[tone] ?? MOCK_CONCERNS["manager"]!;
  const pivot = MOCK_PIVOTS[tone] ?? MOCK_PIVOTS["manager"]!;
  const lens = MOCK_LENS[tone] ?? MOCK_LENS["manager"]!;

  const isBallot = system.includes("PHASE — FINAL BALLOT");
  if (isBallot) {
    return `[DEBATE RESPONSE]\n- ${name}: balancing the committee's evidence, my position is unchanged. ${reasons[0] ?? ""} outweighs the concerns.\n\n[PIVOT POINT]\n- ${pivot}\n\n[VERDICT]\n[STRONG HIRE] — ${reasons[0] ?? "the evidence supports proceeding."}`;
  }

  return `[STRONG POSITIVES]\n- ${reasons[0] ?? "strong, concrete evidence of capability"}\n- ${reasons[1] ?? "record aligns with the role"}\n\n[HIGH-RISK CONCERNS]\n- ${concerns[0] ?? "one or more material gaps"}\n- ${concerns[1] ?? "unverified claims"}\n\n[DEBATE RESPONSE]\n- As ${name}, I weigh the transcript evidence through my ${lens}. My position holds: ${reasons[0] ?? "the evidence supports the call"}.\n\n[PIVOT POINT]\n- ${pivot}\n\n[VERDICT]\n[STRONG HIRE] — ${reasons[0] ?? "evidence outweighs risk"}.`;
}

/**
 * Offline mock client (PRD FR-6.7). Returns deterministic, correctly-formatted
 * responses so the whole pipeline (non-neutrality enforcer, blueprint
 * extractor, rewriter) can be exercised end-to-end without any LLM running.
 */
export function createMockClient(): LLMClient {
  return {
    provider: "mock",
    model: "mock-response-1",
    async complete(system, user) {
      return mockResponseFor(system, user);
    },
  };
}
