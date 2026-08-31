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
        dates: "2021 - Present",
        bullets: [
          "Reduced order-processing API latency by 40% across 2M+ monthly orders by refactoring PostgreSQL query plans and adding Redis-backed caching with idempotent retry semantics.",
          "Migrated a 12-service monolith to event-driven microservices on Kafka running in Docker and Kubernetes on AWS with Terraform and CI/CD, cutting deploy time from 45min to 5min and eliminating order-sync failures for merchant settlement.",
          "Owned production reliability: idempotent retry handling, SQS dead-letter queues, and on-call runbooks with PCI-DSS-aware payment processing (MTTR down 30%).",
        ],
      },
      {
        id: "e2",
        title: "Software Engineer",
        company: "TravelBuddy",
        location: "Remote",
        dates: "2019 - 2021",
        bullets: [
          "Built RESTful booking APIs in TypeScript, Go, and Java on Node.js/PostgreSQL serving 1M+ requests/day.",
          "Designed a Redis caching layer that reduced read load on the primary database by 35%.",
        ],
      },
    ],
    education: [{ degree: "B.Tech Computer Science", institution: "NIT", dates: "2014 - 2018" }],
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

const MOCK_JD_META_JSON = JSON.stringify({
  company: "FinPay",
  role: "Senior Backend Engineer",
  sector: "FinTech payments",
  location: "New York, USA",
  team: "Payments Platform",
});

const MOCK_JOB_DECOMP_JSON = JSON.stringify({
  level: "Senior IC (Senior Backend Engineer)",
  seniorityExpectation: "5-8 yrs, system-level ownership",
  screeningFilters: [
    "not a dashboards or ops role",
    "requires production payments experience",
  ],
  mustHave: [
    "TypeScript / Go",
    "event-driven architecture (Kafka)",
    "distributed systems at scale",
    "production reliability ownership",
  ],
  niceToHave: [
    "PCI-DSS / payments compliance context",
    "Kubernetes and Terraform",
  ],
  stackWords: [
    "TypeScript",
    "Go",
    "Kafka",
    "PostgreSQL",
    "Redis",
    "Kubernetes",
    "AWS",
    "Terraform",
  ],
  businessProblems: [
    {
      problem: "realtime payment processing at scale",
      detail: "2M+ monthly orders, low-latency settlement",
      mappedRequirement: "low-latency event-driven system ownership",
    },
    {
      problem: "payment reliability and settlement failures",
      detail: "idempotency, retry, dead-letter handling",
      mappedRequirement: "production reliability and on-call ownership",
    },
  ],
  domainConstraints: ["payments / fintech", "PCI-DSS compliance context"],
  businessContext: "FinPay processes payment settlements for merchants in the FinTech payments sector.",
});

const MOCK_EXEC_REVIEW_JSON = JSON.stringify({
  persona: "CTO",
  company: "FinPay",
  debateRelevance: {
    score: 8,
    note: "The debate stayed on payments scale, reliability, and transferable sector evidence.",
  },
  roleAlignment: {
    score: 8,
    note: "The candidate's event-driven systems ownership maps directly to the target level.",
  },
  growthAlignment: {
    score: 7,
    note: "Settlement-reliability wins translate to merchant retention and cost reduction.",
  },
  requirementAssessment: "The committee pressed hard requirements (Kafka, scale, reliability) and treated the PCI-DSS gap fairly.",
  conditionsToHire: [
    "Confirm PCI-DSS exposure or accept a compliance ramp-up plan",
    "Verify the scale claims (2M+ orders) during a technical screen",
  ],
  opinion: "FAVORABLE",
  opinionReason: "The debate was relevant and balanced, and the candidate's evidence would benefit the payments platform. Advisory only; the committee verdict stands.",
  summary: "This is a well-scoped senior hire for the payments platform. The committee's positive read is fair, with PCI-DSS exposure and scale verification as the conditions to close.",
});

const MOCK_COLD_EMAIL_JSON = JSON.stringify({
  subject: "Rohan Mehta - backend systems and your platform",
  body: [
    "Hi,",
    "I build and run backend systems that stay fast under real production load, and I enjoy owning them end to end, from design through on-call.",
    "Most of my work has been in event-driven services where correctness and latency both matter, and I like the kind of judgment that keeps systems simple as they grow.",
    "What drew me to this opening is the focus on reliable payments infrastructure; the same care I put into idempotent design and clean failure handling would transfer directly to your team's domain.",
    "Would a short 15-minute call this week work for you?",
  ].join("\n"),
  cta: "Would a short 15-minute call this week work for you?",
  angleUsed: "transferable",
  wordCount: 96,
});

const MOCK_COVER_LETTER_JSON = JSON.stringify({
  subject: "Senior Software Engineer application - Rohan Mehta",
  salutation: "Dear Hiring Manager,",
  body: [
    "I am writing to apply for the Senior Software Engineer role on your payments platform. I am a backend engineer with 6 years of experience building low-latency, event-driven systems in TypeScript and Go, and I believe my background maps directly to the responsibilities in the posting.",
    "Most recently I reduced order-processing API latency by 40% across 2M+ monthly orders by refactoring PostgreSQL query plans and adding a Redis-backed caching layer with idempotent retry semantics. I also led a migration of a 12-service monolith to event-driven microservices on Kafka running in Docker and Kubernetes on AWS, cutting deploy time from 45 minutes to 5 minutes.",
    "I own production reliability end to end: idempotent retry handling, SQS dead-letter queues, and on-call runbooks with PCI-DSS-aware payment processing. The low-latency, high-stakes nature of your platform is exactly the kind of work I do best.",
    "I would welcome the chance to walk you through how my experience maps to your team and hiring bar.",
  ].join("\n\n"),
  closing: "Best regards,\nRohan Mehta",
});

const MOCK_INTERVIEW_MOCK_JSON = JSON.stringify({
  roleLabel: "Software Engineer",
  summary:
    "The interview process for the Software Engineer role runs five phases: recruiter screen, technical screen, technical loop, hiring manager, and a final round.",
  pipeline: [
    {
      name: "Recruiter Screen",
      duration: "30-45 min",
      format: "Phone or video",
      focus: "Baseline fit, comp band, and work setup.",
      typicalQuestions: [
        "Why are you interested in this Software Engineer role?",
        "Walk me through your most relevant experience.",
        "What is your expected compensation range?",
      ],
    },
    {
      name: "Technical Screen",
      duration: "45-60 min",
      format: "Video with live exercise",
      focus: "Core hard skills from the JD under time pressure.",
      typicalQuestions: [
        "Walk me through a recent distributed systems problem you solved.",
        "How would you explain event-driven architecture to a non-expert?",
        "Work through this live exercise out loud, explaining tradeoffs.",
      ],
    },
    {
      name: "Technical Loop / Panel",
      duration: "2-4 hours",
      format: "Video panel",
      focus: "Depth, collaboration, and system thinking.",
      typicalQuestions: [
        "Design a system using TypeScript, Go, and Kafka. Where do you start?",
        "Describe a conflict with a colleague and how you resolved it.",
      ],
    },
    {
      name: "Hiring Manager",
      duration: "30-45 min",
      format: "Video",
      focus: "Scope ownership, impact, and expectations.",
      typicalQuestions: [
        "What are you looking for in your next step?",
        "How would you handle ambiguity in the first 90 days?",
      ],
    },
    {
      name: "Final Round / Leadership",
      duration: "30-60 min",
      format: "Video",
      focus: "Strategy, judgment, and closing expectations.",
      typicalQuestions: [
        "What would your first contribution to this team be?",
        "Why should we hire you over other strong candidates?",
      ],
    },
  ],
  experts: [
    {
      seat: "Meera",
      role: "Lead Technical Recruiter",
      lens: "Matching, market seniority, and signal density.",
      expectations: [
        "Clear alignment of title and years with the posting.",
        "A crisp career narrative and reason for applying.",
        "Transparent answers on comp, notice period, and setup.",
      ],
      drillQuestions: [
        "Tell me about yourself, in under two minutes.",
        "Why this specific company and team?",
      ],
      redFlags: [
        "Resume mismatch with the JD.",
        "Unclear answers on compensation.",
      ],
    },
    {
      seat: "Arjun",
      role: "Distributed Systems Architect",
      lens: "Scale, tradeoffs, and systemic ownership.",
      expectations: [
        "Concrete production examples with scale numbers.",
        "Depth in event-driven architecture and idempotency.",
        "Honest tradeoff analysis, not memorized answers.",
      ],
      drillQuestions: [
        "Walk me through the strongest system you shipped end to end.",
        "What tradeoffs did you weigh when moving to Kafka?",
        "Describe a production incident you debugged to root cause.",
      ],
      redFlags: [
        "Claiming scale without a concrete example.",
        "Naming tools without discussing tradeoffs.",
      ],
    },
    {
      seat: "Nikhil",
      role: "Engineering Team Lead",
      lens: "Delivery, reliability, and team dynamics.",
      expectations: [
        "Evidence of shipping with a team.",
        "System-level view of the services you own.",
      ],
      drillQuestions: [
        "Describe a project you delivered with a team.",
        "Tell me about a disagreement on a technical decision.",
      ],
      redFlags: ["No example of resolving conflict."],
    },
    {
      seat: "Anita",
      role: "Hiring Manager",
      lens: "ROI, leverage, and business outcomes.",
      expectations: [
        "Quantified impact tied to business outcomes.",
        "Ownership of a full scope end to end.",
      ],
      drillQuestions: [
        "Walk me through a goal you owned and measured.",
        "Tell me about a failure and what you changed.",
      ],
      redFlags: ["Impact claims with no numbers."],
    },
    {
      seat: "Priya",
      role: "Sector Specialist",
      lens: "Domain fit and transferability.",
      expectations: [
        "Understanding of the sector's operating context.",
        "Ability to translate sector concerns into core skills.",
      ],
      drillQuestions: [
        "How does the sector's context change your approach?",
      ],
      redFlags: ["No awareness of sector constraints."],
    },
  ],
  topics: [
    "event-driven architecture",
    "idempotency",
    "Kafka",
    "TypeScript",
    "Go",
    "PostgreSQL",
    "Redis",
    "Kubernetes",
    "Terraform",
    "system design",
    "SLOs",
    "on-call",
  ],
  prepTips: [
    "Map each screening-bar item to a concrete resume story.",
    "Prepare a two-minute career narrative for this role.",
    "Practice the architect seat's drill questions until crisp.",
    "Prepare questions about the team, first 90 days, and success metrics.",
  ],
});

/**
 * Deterministic, correctly-formatted mock response for a system/user prompt.
 * Shared by the offline mock client AND the fake local LLM servers used by the
 * functional test suite (which proves each provider wire format over real HTTP).
 */
export function mockResponseFor(system: string, _user: string): string {
  // Route on the system prompt's opening line only. The interview/email prompts
  // embed role context that itself contains "senior resume writer", so a
  // whole-prompt scan would misroute them to the resume engine.
  const firstLine = (system.trim().split("\n")[0] ?? "").toLowerCase();

  // AI role detector: classify the JD into the best-fit role template.
  if (firstLine.includes("hiring analyst classifying")) {
    return JSON.stringify({
      role: "swe",
      reason: "Backend engineering focus with distributed systems in the JD.",
    });
  }
  // JD metadata extractor: concrete role/company metadata for the committee.
  if (firstLine.includes("job-description metadata extractor")) {
    return MOCK_JD_META_JSON;
  }
  // Job-decomposition analyst: the structured role brief shared by the committee.
  if (firstLine.includes("job-decomposition analyst")) {
    return MOCK_JOB_DECOMP_JSON;
  }
  // Executive hiring reviewer: the advisory C-suite opinion on the debate.
  if (firstLine.includes("executive hiring reviewer")) {
    return MOCK_EXEC_REVIEW_JSON;
  }
  // Director / Architect: the Layer-2 fairness audit of the debate itself.
  if (firstLine.includes("director / architect")) {
    return JSON.stringify({
      fair: true,
      items: [
        { factor: "evidence bar consistency", passed: true, note: "all seats applied the same evidence bar to every claim" },
        { factor: "level calibration", passed: true, note: "the JD level matched the candidate's demonstrated scope" },
        { factor: "transferability", passed: true, note: "transferable skills were weighed with the sector lens held consistently" },
        { factor: "groupthink", passed: true, note: "seats challenged each other by name across cross-talk" },
        { factor: "confidence consistency", passed: true, note: "confidence markers matched the evidence anchors in the transcript" },
        { factor: "evidence acceptance", passed: true, note: "evidence-backed claims were accepted and unsupported ones flagged" },
      ],
      revoteFactor: "",
      needsHumanReview: false,
    });
  }
  // Resume A/B reviewers (design plan R2): three seats, one rubric, distinct
  // calibrated scores so the deterministic comparison has signal offline.
  if (firstLine.includes("resume ats screener")) {
    return JSON.stringify({
      scores: { jdCoverage: 82, credibility: 75, clarity: 88, atsReadiness: 90 },
      strengths: ["strong keyword alignment with the posting", "clean section structure"],
      issues: [
        { severity: "medium", section: "Skills", finding: "two JD keywords are missing", fixHint: "work them into existing bullets honestly" },
      ],
      verdict: "ship",
    });
  }
  if (firstLine.includes("resume hiring manager")) {
    return JSON.stringify({
      scores: { jdCoverage: 78, credibility: 84, clarity: 85, atsReadiness: 80 },
      strengths: ["evidence-backed bullets", "credible ownership claims"],
      issues: [
        { severity: "low", section: "Summary", finding: "summary could state the value proposition sooner", fixHint: "lead with the role fit" },
      ],
      verdict: "ship",
    });
  }
  if (firstLine.includes("resume editor")) {
    return JSON.stringify({
      scores: { jdCoverage: 85, credibility: 80, clarity: 90, atsReadiness: 88 },
      strengths: ["parallel bullet phrasing", "consistent typography"],
      issues: [
        { severity: "low", section: "Experience", finding: "one bullet buries the outcome", fixHint: "move the result to the front" },
      ],
      verdict: "ship",
    });
  }
  if (firstLine.includes("resume ats screener")) {
    // unreachable; kept for clarity of the branch family
  }

  // Sophisticated resume engine: role-targeted resume-writer system prompt.
  if (firstLine.includes("senior resume writer")) {
    return MOCK_RESUME_JSON;
  }
  // Sophisticated resume engine: elite resume quality auditor.
  if (firstLine.includes("resume quality auditor")) {
    return MOCK_MODERATION_JSON;
  }
  // Cold-email killer intro generator.
  if (firstLine.includes("cold outreach writer")) {
    return MOCK_COLD_EMAIL_JSON;
  }
  // Cover-letter writer generator.
  if (firstLine.includes("cover letter writer")) {
    return MOCK_COVER_LETTER_JSON;
  }
  // Interview mock plan generator.
  if (firstLine.includes("interview coach")) {
    return MOCK_INTERVIEW_MOCK_JSON;
  }
  // Gap Analyst: career strategist producing structured gap analysis.
  if (firstLine.includes("gap analyst")) {
    return JSON.stringify({
      gapAnalysis: {
        mustHaveGaps: [],
        niceToHaveGaps: [],
        strongMatches: [
          { item: "mock strong match", notes: "The mock provider found evidence for this requirement." },
        ],
        inflatedClaims: [],
        overallReadiness: "Partial Match",
        summary: "Mock gap analysis: the candidate shows promise with some areas to address.",
      },
      suggestions: [
        {
          id: "mock-1",
          category: "Elevate Theme",
          suggestion: "Reframe project experience to highlight scale",
          justification: "The committee flagged a lack of concrete scale metrics.",
          risk: "Low",
          targetSection: "Most Recent Role",
          proposedChange: "Add volume/throughput metrics from the candidate's actual projects.",
          jdThemeAddressed: "Production-scale experience",
        },
      ],
      priorityActions: [
        "Address missing scale metrics in recent role",
        "Soften any inflated claims flagged by the committee",
      ],
    });
  }

  const nameMatch = system.match(/You are ([A-Za-z .]+), acting as the ([^.\n]+)\./);
  const name = nameMatch?.[1]?.trim() ?? "Committee Member";
  const role = nameMatch?.[2]?.trim() ?? "Committee Member";

  // Persona is derived ONLY from the agent's own role line. The cross-talk and
  // ballot prompts embed the Sector Specialist mandate for every agent, so
  // matching on the body text would assign the sector tone to all of them.
  const lower = role.toLowerCase();
  const tone = lower.includes("sector")
    ? "sector"
    : lower.includes("recruiter")
      ? "recruiter"
      : lower.includes("architect") ||
          lower.includes("principal") ||
          lower.includes("staff") ||
          lower.includes("technical specialist") ||
          lower.includes("data scientist") ||
          lower.includes("quant") ||
          lower.includes("domain expert")
        ? "architect"
        : lower.includes("manager") ||
            lower.includes("lead") ||
            lower.includes("director") ||
            lower.includes("head") ||
            lower.includes("vp")
          ? "manager"
          : lower.includes("senior")
            ? "lead"
            : "manager";

  const reasons = MOCK_REASONS[tone] ?? MOCK_REASONS["manager"]!;
  const concerns = MOCK_CONCERNS[tone] ?? MOCK_CONCERNS["manager"]!;
  const pivot = MOCK_PIVOTS[tone] ?? MOCK_PIVOTS["manager"]!;
  const lens = MOCK_LENS[tone] ?? MOCK_LENS["manager"]!;

  const isOpening = system.includes("PHASE — ROUND 1 OPENING");
  const isBallot = system.includes("PHASE — FINAL BALLOT");

  if (isOpening) {
    const factors = [
      { factor: "Profile Understanding", score: 5, note: "career arc and seniority match the target level for this role" },
      { factor: "Missing Skills for the Role", score: 4, note: "the JD's core stack is covered; a compliance gap needs ramp-up" },
      { factor: "Business Understanding", score: 4, note: "outcome framing maps to the company's stated problems" },
      { factor: "Authenticity", score: 4, note: "specific and date-consistent, with a few unverifiable scale claims" },
      { factor: "Experience", score: 5, note: "years and seniority match the target level for this role" },
      { factor: "Technical Skills", score: 5, note: "the exact stack the JD names appears with depth" },
      { factor: "Product Thinking & Problem Solving", score: 4, note: "trade-offs and outcomes are argued concretely" },
      { factor: "Role-Specific Signals", score: 4, note: "ownership and reliability signals align with the JD" },
    ];
    const opening = `[STRONG POSITIVES]\n- ${reasons[0] ?? "strong, concrete evidence of capability"}\n- ${reasons[1] ?? "record aligns with the role"}\n\n[HIGH-RISK CONCERNS]\n- ${concerns[0] ?? "one or more material gaps"}\n- ${concerns[1] ?? "unverified claims"}\n\n[DEBATE RESPONSE]\n- As ${name}, my 360-degree analysis frames the debate through my ${lens}. ${pivot}.\n\n[PIVOT POINT]\n- ${pivot}\n\n[CONFIDENCE] Medium\n\n[SECTOR & TRANSFERABILITY]\n- The evidence generalizes to the target sector.\n\n[VERDICT]\n[STRONG HIRE] — ${reasons[0] ?? "evidence outweighs risk"}.`;
    const strengths = reasons;
    const analysisConcerns = concerns;
    const missingSkills = [`${pivot.split(":")[0] ?? "domain"} depth beyond the headline stack`];
    const response = {
      analysis: {
        fitScore: 8,
        factors,
        strengths,
        concerns: analysisConcerns,
        hireReasons: reasons,
        rejectReasons: concerns,
        missingSkills,
        confidence: "Medium",
        inflatedClaims: [],
        authenticityFlags: [
          { flag: "several scale claims are asserted without verifiable dates or scope", severity: "low" },
        ],
        credibilityFindings: [
          "implied team size does not line up with the stated scope in one project",
        ],
        businessAssessment: "the candidate's outcome framing would move the company's stated problems forward",
      },
      opening,
      decision: "HIRE",
      decisionReason: reasons[0] ?? "the evidence outweighs the concerns for this role",
      pivotFactor: pivot,
    };
    return JSON.stringify(response);
  }

  if (isBallot) {
    return `[DEBATE RESPONSE]\n- ${name}: balancing the committee's evidence, my position is unchanged. ${reasons[0] ?? ""} outweighs the concerns.\n\n[PIVOT POINT]\n- ${pivot}\n\n[CONFIDENCE] Medium\n\n[SECTOR & TRANSFERABILITY]\n- The evidence generalizes to the target sector.\n\n[VERDICT]\n[STRONG HIRE] — ${reasons[0] ?? "the evidence supports proceeding."}`;
  }

  return `[DEBATE RESPONSE]\n- As ${name}, I weigh the transcript evidence through my ${lens}. ${reasons[0] ?? "the evidence supports the call"} holds against the concerns.\n\n[PIVOT POINT]\n- ${pivot}\n\n[CONFIDENCE] Medium\n\n[SECTOR & TRANSFERABILITY]\n- The evidence generalizes to the target sector.\n\n[VERDICT]\n[STRONG HIRE] — ${reasons[0] ?? "evidence outweighs risk"}.`;
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
