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

/**
 * Offline mock client (PRD FR-6.7). Returns deterministic, correctly-formatted
 * responses so the whole pipeline (non-neutrality enforcer, blueprint
 * extractor, rewriter) can be exercised end-to-end without any LLM running.
 */
export function createMockClient(): LLMClient {
  return {
    provider: "mock",
    model: "mock-response-1",
    async complete(system, _user) {
      if (system.includes("Debate-Driven Resume Transformer")) {
        return `# Rohan Mehta
Senior Backend Engineer — Event-Driven Distributed Systems
Bengaluru, India · rohan.mehta@example.com

## Summary
Backend engineer with 6 years of experience shipping low-latency, event-driven
systems in TypeScript and Go. Track record of reducing API latency by 40%,
migrating monoliths to Kafka-based microservices, and owning production SLOs.

## Experience

### Senior Software Engineer — RetailWorks (E-commerce) · 2021 – Present
- **Reduced order-processing API latency by 40%** across 2M+ monthly orders by
  refactoring PostgreSQL query plans and adding Redis-backed caching.
- **Migrated a 12-service monolith to event-driven microservices** on Kafka,
  cutting deploy time from 45min to 5min and eliminating order sync failures.
- Owned reliability for the order pipeline: built idempotent retry semantics,
  Grafana/Prometheus dashboards, and on-call runbooks (MTTR down 30%).
- Established CI/CD and test automation for the payments integration team,
  raising merge-to-production velocity by 60%.

### Software Engineer — TravelBuddy (Travel tech) · 2019 – 2021
- Built RESTful booking APIs in Node.js/PostgreSQL serving 1M+ requests/day.
- Designed a Redis caching layer that reduced read load on the primary DB by 35%.
- Maintained Docker/Kubernetes deployment pipelines across dev/staging/prod.

### Software Engineer Intern — FinBank (Retail banking) · 2018 – 2019
- Automated reconciliation scripts between ledger systems, removing manual
  nightly work and surfacing a recurring 0.2% settlement discrepancy.

## Skills
TypeScript, Go, Node.js · PostgreSQL, Redis · Kafka, RabbitMQ · Docker, Kubernetes, AWS,
Terraform · CI/CD, TDD, observability (Prometheus/Grafana), incident response

[ADD: explicit PCI-DSS training/certification if applicable]
[ADD: numbers for throughput (e.g., events/sec processed) to strengthen the sector-fit case]
`;
      }

      const nameMatch = system.match(/You are ([A-Za-z .]+), acting as the ([^.\n]+)\./);
      const name = nameMatch?.[1]?.trim() ?? "Committee Member";
      const role = nameMatch?.[2]?.trim() ?? "Committee Member";

      const tone =
        system.includes("Sector Specialist") || role.toLowerCase().includes("sector")
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

      const isBallot = system.includes("PHASE — FINAL BALLOT");
      if (isBallot) {
        return `[DEBATE RESPONSE]\n- ${name}: balancing the committee's evidence, my position is unchanged. ${reasons[0] ?? ""} outweighs the concerns.\n\n[PIVOT POINT]\n- ${pivot}\n\n[VERDICT]\n[STRONG HIRE] — ${reasons[0] ?? "the evidence supports proceeding."}`;
      }

      return `[STRONG POSITIVES]\n- ${reasons[0] ?? "strong, concrete evidence of capability"}\n- ${reasons[1] ?? "record aligns with the role"}\n\n[HIGH-RISK CONCERNS]\n- ${concerns[0] ?? "one or more material gaps"}\n- ${concerns[1] ?? "unverified claims"}\n\n[DEBATE RESPONSE]\n- As ${name}, I weigh the transcript evidence and note the sector specialist's domain lens.\n\n[PIVOT POINT]\n- ${pivot}\n\n[VERDICT]\n[STRONG HIRE] — ${reasons[0] ?? "evidence outweighs risk"}.`;
    },
  };
}
