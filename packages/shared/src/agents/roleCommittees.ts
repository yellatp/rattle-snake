import type { AgentConfig, AgentSeat, Domain } from "../types.js";

/**
 * Role-driven committees (WS-4/WS-7).
 *
 * Every role slug (mirroring `roleRegistry.ts` in the api package) maps to a
 * 6-seat committee built from a per-role spec:
 *
 *   Senior Engineer · Manager / Team Lead · Staff / Domain Expert ·
 *   Principal / Architect · Technical Recruiter · Sector Specialist
 *
 * The candidate's estimated years of experience then filters the committee by
 * band, so an entry-level debate runs without Manager/Staff/Principal seats and
 * a principal-level debate drops the Senior seat. The base seats (Manager,
 * Recruiter) are generic; the Senior and Staff seats carry the role-specific
 * expertise that makes a "ML Engineer" debate differ from a "Data Analyst"
 * debate, and the Sector Specialist seat is composed from the sector registry
 * at job-creation time so the same role is judged with sector-appropriate
 * expertise.
 */

/** Per-seat persona focus for one role's committee. */
export interface RoleCommitteeSpec {
  /** Domain bucket the slug lives in (drives seat names, titles, fallbacks). */
  domain: Domain;
  /** Human role label, e.g. "Backend Engineer" (used for Senior/Principal titles). */
  roleLabel: string;
  /** Role-specific Staff/Domain-expert title, e.g. "ML Engineer Specialist". */
  specialistTitle: string;
  /** What the technical seats audit for this role. */
  specialistFocus: string;
  /** Optional recruiter-lens refinement for this role. */
  recruiterFocus?: string;
  /** Optional manager/team-lead-lens refinement for this role. */
  leadFocus?: string;
}

const DEFAULT_RECRUITER_FOCUS =
  "Role-specific core skills, metric density, title alignment, screening realism, years of relevant experience, career narrative.";
const DEFAULT_LEAD_FOCUS =
  "Delivery velocity, CI/CD, debugging capability, on-call readiness, team throughput, production stability, scope ownership, hiring standards.";
const DEFAULT_SECTOR_FOCUS =
  "Industry-specific fit: domain protocols, compliance, industry stack, plus cross-sector transferable skills.";
const STAFF_SUFFIX =
  " Drives depth on this specialty, owns the technical bar, and challenges the senior approach with deeper seniority, scope and long-term ownership.";
const TECH_PRINCIPAL_PREFIX =
  "Architecture and design trade-offs at scale, cross-cutting technical strategy, quality bar and mentoring for the committee. ";
const PM_PRINCIPAL_PREFIX =
  "Program governance, cross-functional strategy, delivery-quality bar and mentoring for the committee. ";

interface DomainMeta {
  managerTitle: string;
  principalTitle: string;
  principalPrefix: string;
}

const DOMAIN_META: Record<Domain, DomainMeta> = {
  AI_ENGINEERING: {
    managerTitle: "AI Engineering Manager / Team Lead",
    principalTitle: "Principal AI Engineer (Technical Architect)",
    principalPrefix: TECH_PRINCIPAL_PREFIX,
  },
  ML_ENGINEERING: {
    managerTitle: "ML Engineering Manager / Team Lead",
    principalTitle: "Principal ML Engineer (Technical Architect)",
    principalPrefix: TECH_PRINCIPAL_PREFIX,
  },
  SDE: {
    managerTitle: "Engineering Manager / Team Lead",
    principalTitle: "Principal Software Engineer (Technical Architect)",
    principalPrefix: TECH_PRINCIPAL_PREFIX,
  },
  DATA_ENGINEERING: {
    managerTitle: "Data Engineering Manager / Team Lead",
    principalTitle: "Principal Data Engineer (Technical Architect)",
    principalPrefix: TECH_PRINCIPAL_PREFIX,
  },
  DATA_SCIENCE: {
    managerTitle: "Analytics Manager / Team Lead",
    principalTitle: "Principal Data Scientist (Technical Architect)",
    principalPrefix: TECH_PRINCIPAL_PREFIX,
  },
  CYBERSECURITY: {
    managerTitle: "Security Manager / Team Lead",
    principalTitle: "Principal Security Engineer (Technical Architect)",
    principalPrefix: TECH_PRINCIPAL_PREFIX,
  },
  NETWORKING: {
    managerTitle: "Network Manager / Team Lead",
    principalTitle: "Principal Network Engineer (Technical Architect)",
    principalPrefix: TECH_PRINCIPAL_PREFIX,
  },
  DEVOPS: {
    managerTitle: "DevOps Manager / Team Lead",
    principalTitle: "Principal Platform Engineer (Technical Architect)",
    principalPrefix: TECH_PRINCIPAL_PREFIX,
  },
  PROJECT_MANAGEMENT: {
    managerTitle: "Senior Program Manager / Team Lead",
    principalTitle: "Principal Program Manager (Domain Expert)",
    principalPrefix: PM_PRINCIPAL_PREFIX,
  },
};

/** Stable per-seat names per domain bucket so one committee has 6 unique names. */
const SEAT_NAMES: Record<Domain, Record<AgentSeat, string>> = {
  SDE: { senior: "Marcus", manager: "Elena", staff: "Alex", principal: "Rohan", recruiter: "Priya", sector: "Liam" },
  AI_ENGINEERING: { senior: "Aisha", manager: "Rahul", staff: "Meera", principal: "Dr. Aris", recruiter: "Neha", sector: "Liam" },
  ML_ENGINEERING: { senior: "Vikram", manager: "Anita", staff: "Dr. Aris", principal: "Dr. Kavya", recruiter: "Sarah", sector: "Maya" },
  DATA_ENGINEERING: { senior: "Nikhil", manager: "Karen", staff: "Dr. Aris", principal: "Vikram", recruiter: "Sarah", sector: "Maya" },
  DATA_SCIENCE: { senior: "Ananya", manager: "Karen", staff: "Dr. Aris", principal: "Dr. Kavya", recruiter: "Sarah", sector: "Maya" },
  CYBERSECURITY: { senior: "Dev", manager: "Elena", staff: "Alex", principal: "Marcus", recruiter: "Priya", sector: "Liam" },
  NETWORKING: { senior: "Michael", manager: "Elena", staff: "Alex", principal: "Marcus", recruiter: "Priya", sector: "Sophia" },
  DEVOPS: { senior: "Nikhil", manager: "Anita", staff: "Alex", principal: "Marcus", recruiter: "Priya", sector: "Maya" },
  PROJECT_MANAGEMENT: { senior: "David", manager: "Chen", staff: "Sophia", principal: "Elena", recruiter: "Tina", sector: "Liam" },
};

/**
 * The role slugs -> committee specs. Keep this in lockstep with
 * `DOMAIN_ROLES`/`TEMPLATES` in apps/api/src/resume/roleRegistry.ts.
 */
export const ROLE_DETAILS: Record<string, RoleCommitteeSpec> = {
  // --- Software development (SDE) -----------------------------------------
  swe: {
    domain: "SDE",
    roleLabel: "Software Engineer",
    specialistTitle: "Software Engineer Technical Specialist",
    specialistFocus:
      "System design, concurrency, microservices, code quality, architectural trade-offs, production-scale engineering, TypeScript/Go/Java depth.",
  },
  frontend_engineer: {
    domain: "SDE",
    roleLabel: "Frontend Engineer",
    specialistTitle: "Frontend Engineering Specialist",
    specialistFocus:
      "Frontend architecture, component design, TypeScript/React depth, performance and accessibility, web platform constraints, UX implementation quality.",
  },
  backend_engineer: {
    domain: "SDE",
    roleLabel: "Backend Engineer",
    specialistTitle: "Backend Engineering Specialist",
    specialistFocus:
      "Server-side architecture, API design, databases and caches, concurrency, distributed systems, reliability and observability.",
  },
  fullstack_engineer: {
    domain: "SDE",
    roleLabel: "Full-Stack Engineer",
    specialistTitle: "Full-Stack Engineering Specialist",
    specialistFocus:
      "End-to-end feature ownership, client and server architecture, API contract design, deployment and performance across the whole stack.",
  },
  qa_engineer: {
    domain: "SDE",
    roleLabel: "QA Engineer",
    specialistTitle: "QA Automation Specialist",
    specialistFocus:
      "Test strategy, automated suites, CI quality gates, load and performance testing, defect lifecycles, shift-left practices.",
  },
  // --- AI engineering (AI_ENGINEERING) ------------------------------------
  ai_engineer: {
    domain: "AI_ENGINEERING",
    roleLabel: "AI Engineer",
    specialistTitle: "AI Engineer Technical Specialist",
    specialistFocus:
      "LLM and agentic systems, model integration, prompt and eval engineering, RAG pipelines, AI productization, guardrails and reliability.",
  },
  ai_researcher: {
    domain: "AI_ENGINEERING",
    roleLabel: "AI Researcher",
    specialistTitle: "AI Research Specialist",
    specialistFocus:
      "Research depth in AI, novel methods and architecture insight, experiment design and evaluation, literature grounding, production hand-off.",
  },
  ai_inference_engineer: {
    domain: "AI_ENGINEERING",
    roleLabel: "AI Inference Engineer",
    specialistTitle: "AI Inference Specialist",
    specialistFocus:
      "Model serving and inference optimization, GPU and accelerator utilization, latency and cost trade-offs, quantization and caching.",
  },
  ai_developer: {
    domain: "AI_ENGINEERING",
    roleLabel: "AI Developer",
    specialistTitle: "AI Application Developer",
    specialistFocus:
      "Building AI features end to end, agent and tooling integration, prompt and eval engineering, guardrails, observability of AI behavior.",
  },
  ai_implementation_engineer: {
    domain: "AI_ENGINEERING",
    roleLabel: "AI Implementations Engineer",
    specialistTitle: "AI Implementation Specialist",
    specialistFocus:
      "Shipping AI into production, integration patterns, rollout and migration, reliability of AI systems, customer-facing AI quality.",
  },
  ai_specialist: {
    domain: "AI_ENGINEERING",
    roleLabel: "AI Specialist",
    specialistTitle: "AI Specialist",
    specialistFocus:
      "Hands-on LLM and applied AI, prompt and tooling mastery, integration patterns, safety and bias reviews.",
  },
  ai_analyst: {
    domain: "AI_ENGINEERING",
    roleLabel: "AI Analyst",
    specialistTitle: "AI Analyst Specialist",
    specialistFocus:
      "Applied AI opportunities, feasibility analysis, LLM evals, ROI of AI features, data-driven product recommendations.",
  },
  nlp_engineer: {
    domain: "AI_ENGINEERING",
    roleLabel: "NLP Engineer",
    specialistTitle: "NLP Specialist",
    specialistFocus:
      "Language models, tokenization, embeddings, retrieval (RAG), evaluation of NLP systems, multilingual trade-offs.",
  },
  computer_vision_engineer: {
    domain: "AI_ENGINEERING",
    roleLabel: "Computer Vision Engineer",
    specialistTitle: "Computer Vision Specialist",
    specialistFocus:
      "Image and video ML, model architectures, vision data pipelines, deployment at scale, evaluation.",
  },
  // --- Machine learning (ML_ENGINEERING) -----------------------------------
  ml_engineer: {
    domain: "ML_ENGINEERING",
    roleLabel: "Machine Learning Engineer",
    specialistTitle: "Machine Learning Specialist",
    specialistFocus:
      "Applied ML, model design and evaluation, feature engineering, deployment trade-offs, measurement, model quality.",
  },
  mlops_engineer: {
    domain: "ML_ENGINEERING",
    roleLabel: "MLOps Engineer",
    specialistTitle: "MLOps Specialist",
    specialistFocus:
      "ML pipelines, model training and serving, experiment tracking, feature stores, drift monitoring, reproducibility and CI/CD for ML.",
  },
  data_scientist: {
    domain: "ML_ENGINEERING",
    roleLabel: "Data Scientist",
    specialistTitle: "Data Science Specialist",
    specialistFocus:
      "Statistical rigor, experiment design (A/B), model selection and evaluation, causal inference, business impact.",
  },
  research_scientist: {
    domain: "ML_ENGINEERING",
    roleLabel: "Research Scientist",
    specialistTitle: "Research Science Specialist",
    specialistFocus:
      "Research depth, method novelty, experimental rigor, publication and benchmark track record, production hand-off.",
  },
  // --- Data engineering (DATA_ENGINEERING) ---------------------------------
  data_engineer: {
    domain: "DATA_ENGINEERING",
    roleLabel: "Data Engineer",
    specialistTitle: "Data Engineering Specialist",
    specialistFocus:
      "ETL/ELT pipelines, warehousing, orchestration (Airflow), batch and streaming, data modeling, data quality and lineage.",
  },
  data_platform_engineer: {
    domain: "DATA_ENGINEERING",
    roleLabel: "Data Platform Engineer",
    specialistTitle: "Data Platform Specialist",
    specialistFocus:
      "Data infrastructure, platform reliability, lakehouse and warehouse internals, data governance, developer experience for data teams.",
  },
  data_architect: {
    domain: "DATA_ENGINEERING",
    roleLabel: "Data Architect",
    specialistTitle: "Data Architect Specialist",
    specialistFocus:
      "Enterprise data architecture, data modeling, governance, migrations, scalability of data platforms, cost trade-offs.",
  },
  // --- Data science & analytics (DATA_SCIENCE) -----------------------------
  data_analyst: {
    domain: "DATA_SCIENCE",
    roleLabel: "Data Analyst",
    specialistTitle: "Data Analysis Specialist",
    specialistFocus:
      "SQL depth, dashboarding, business metrics, statistical literacy, insight communication, self-serve analytics.",
  },
  bi_analyst: {
    domain: "DATA_SCIENCE",
    roleLabel: "Business Intelligence Analyst",
    specialistTitle: "Business Intelligence Specialist",
    specialistFocus:
      "Warehouse queries, semantic layers, report and dashboard quality, data storytelling, BI stack performance.",
  },
  product_analyst: {
    domain: "DATA_SCIENCE",
    roleLabel: "Product Analyst",
    specialistTitle: "Product Analytics Specialist",
    specialistFocus:
      "User behavior analytics, funnel and retention analysis, experiment design, actionable product recommendations.",
  },
  gtm_analyst: {
    domain: "DATA_SCIENCE",
    roleLabel: "GTM Analyst",
    specialistTitle: "GTM Analytics Specialist",
    specialistFocus:
      "Funnel and cohort analysis, CAC/LTV, channel performance, growth experiments, sales and marketing systems.",
  },
  market_research_analyst: {
    domain: "DATA_SCIENCE",
    roleLabel: "Market Research Analyst",
    specialistTitle: "Market Research Specialist",
    specialistFocus:
      "Research design, surveys and panels, segmentation, competitive intelligence, synthesis into insight.",
  },
  pricing_analyst: {
    domain: "DATA_SCIENCE",
    roleLabel: "Pricing Analyst",
    specialistTitle: "Pricing Analytics Specialist",
    specialistFocus:
      "Price elasticity, revenue modeling, segmentation, experimentation, competitive and cost analysis.",
  },
  // --- Cybersecurity (CYBERSECURITY) ---------------------------------------
  cybersecurity_analyst: {
    domain: "CYBERSECURITY",
    roleLabel: "Cybersecurity Analyst",
    specialistTitle: "Cybersecurity Analyst Specialist",
    specialistFocus:
      "Security controls, risk assessment, compliance frameworks, incident response, hardening.",
  },
  penetration_tester: {
    domain: "CYBERSECURITY",
    roleLabel: "Penetration Tester",
    specialistTitle: "Offensive Security Specialist",
    specialistFocus:
      "Pentesting methodology, vulnerability exploitation, reporting, tools (Burp/Nmap), remediation guidance.",
  },
  soc_analyst: {
    domain: "CYBERSECURITY",
    roleLabel: "SOC Analyst",
    specialistTitle: "SOC Analyst Specialist",
    specialistFocus:
      "Detection engineering, triage and incident handling, SIEM, threat hunting, playbooks.",
  },
  cloud_security_engineer: {
    domain: "CYBERSECURITY",
    roleLabel: "Cloud Security Engineer",
    specialistTitle: "Cloud Security Specialist",
    specialistFocus:
      "Cloud IAM, network security, secrets management, cloud compliance, threat modeling.",
  },
  // --- Networking (NETWORKING) ---------------------------------------------
  network_engineer: {
    domain: "NETWORKING",
    roleLabel: "Network Engineer",
    specialistTitle: "Network Engineering Specialist",
    specialistFocus:
      "Network architecture, routing and switching, DNS and load balancing, security zones, SD-WAN and cloud networking, monitoring.",
  },
  cloud_engineer: {
    domain: "NETWORKING",
    roleLabel: "Cloud Engineer",
    specialistTitle: "Cloud Infrastructure Specialist",
    specialistFocus:
      "Cloud architecture (AWS/GCP/Azure), IaC (Terraform), networking, IAM, cost and reliability engineering, migrations.",
  },
  // --- DevOps / SRE (DEVOPS) -----------------------------------------------
  devops: {
    domain: "DEVOPS",
    roleLabel: "DevOps Engineer",
    specialistTitle: "DevOps / SRE Specialist",
    specialistFocus:
      "CI/CD pipelines, containers (Docker/Kubernetes), observability, SLOs, incident response, infrastructure automation.",
  },
  site_reliability_engineer: {
    domain: "DEVOPS",
    roleLabel: "Site Reliability Engineer",
    specialistTitle: "Site Reliability Specialist",
    specialistFocus:
      "Reliability engineering, SLOs and error budgets, incident response, capacity planning, automation and toil reduction.",
  },
  // --- Project & product management (PROJECT_MANAGEMENT) -------------------
  product_manager: {
    domain: "PROJECT_MANAGEMENT",
    roleLabel: "Product Manager",
    specialistTitle: "Product Management Specialist",
    specialistFocus:
      "Problem framing, roadmap and prioritization, discovery rigor, stakeholder alignment, delivery and outcome metrics.",
  },
  project_manager: {
    domain: "PROJECT_MANAGEMENT",
    roleLabel: "Project Manager",
    specialistTitle: "Project Management Specialist",
    specialistFocus:
      "Delivery planning, scope and dependency management, stakeholder communication, risk and resource management, outcome tracking.",
  },
  business_analyst: {
    domain: "PROJECT_MANAGEMENT",
    roleLabel: "Business Analyst",
    specialistTitle: "Business Analysis Specialist",
    specialistFocus:
      "Requirements discovery, process modeling, stakeholder management, data-driven analysis, solution design.",
  },
  operations_analyst: {
    domain: "PROJECT_MANAGEMENT",
    roleLabel: "Operations Analyst",
    specialistTitle: "Operations Analytics Specialist",
    specialistFocus:
      "Ops metrics, process improvement, forecasting, automation of reporting, cross-functional execution.",
  },
  business_strategist: {
    domain: "PROJECT_MANAGEMENT",
    roleLabel: "Business Strategist",
    specialistTitle: "Strategy Specialist",
    specialistFocus:
      "Market analysis, financial modeling, strategic frameworks, decision quality, executive communication.",
  },
  marketing_analyst: {
    domain: "PROJECT_MANAGEMENT",
    roleLabel: "Marketing Analyst",
    specialistTitle: "Marketing Analytics Specialist",
    specialistFocus:
      "Campaign measurement, attribution, experimentation, media mix, marketing funnels, dashboards.",
  },
  marketing_strategist: {
    domain: "PROJECT_MANAGEMENT",
    roleLabel: "Marketing Strategist",
    specialistTitle: "Marketing Strategy Specialist",
    specialistFocus:
      "Positioning, brand strategy, channel strategy, market segmentation, growth planning, measurement.",
  },
};

/** The six seat kinds in build order. */
export const SEAT_KINDS: readonly AgentSeat[] = [
  "senior",
  "manager",
  "staff",
  "principal",
  "recruiter",
  "sector",
] as const;

/** Candidate experience bands used to filter the committee. */
export type ExperienceBand = "entry" | "mid" | "senior" | "principal";

/**
 * Which seats sit on the committee for each experience band. `years` below 3
 * skips the Manager and all seniority seats above it; 11+ drops the Senior
 * seat (a principal-level candidate is peer-reviewed by Principal/Staff).
 */
export const SEATS_BY_BAND: Record<ExperienceBand, readonly AgentSeat[]> = {
  entry: ["senior", "recruiter", "sector"],
  mid: ["senior", "manager", "recruiter", "sector"],
  senior: ["senior", "manager", "staff", "recruiter", "sector"],
  principal: ["manager", "staff", "principal", "recruiter", "sector"],
};

/** Map estimated years of experience to a band. Undefined years = no filter. */
export function bandForYears(years?: number): ExperienceBand | undefined {
  if (years === undefined || years === null) return undefined;
  if (years <= 2) return "entry";
  if (years <= 6) return "mid";
  if (years <= 10) return "senior";
  return "principal";
}

function buildCommittee(spec: RoleCommitteeSpec): AgentConfig[] {
  const names = SEAT_NAMES[spec.domain];
  const meta = DOMAIN_META[spec.domain];
  return [
    {
      name: names.senior,
      kind: "senior",
      level: "Senior",
      role: `Senior ${spec.roleLabel}`,
      focus: spec.specialistFocus,
      domain: spec.domain,
      weight: 1,
      tone: "lead",
    },
    {
      name: names.manager,
      kind: "manager",
      level: "Manager",
      role: meta.managerTitle,
      focus: spec.leadFocus ?? DEFAULT_LEAD_FOCUS,
      domain: spec.domain,
      weight: 1,
      tone: "manager",
    },
    {
      name: names.staff,
      kind: "staff",
      level: "Staff",
      role: spec.specialistTitle,
      focus: spec.specialistFocus + STAFF_SUFFIX,
      domain: spec.domain,
      weight: 1.2,
      tone: "architect",
    },
    {
      name: names.principal,
      kind: "principal",
      level: "Principal",
      role: meta.principalTitle,
      focus: meta.principalPrefix + spec.specialistFocus,
      domain: spec.domain,
      weight: 1.3,
      tone: "architect",
    },
    {
      name: names.recruiter,
      kind: "recruiter",
      level: "Recruiter",
      role: "Lead Technical Recruiter",
      focus: spec.recruiterFocus ?? DEFAULT_RECRUITER_FOCUS,
      domain: spec.domain,
      weight: 0.8,
      tone: "recruiter",
    },
    {
      name: names.sector,
      kind: "sector",
      level: "Sector Specialist",
      role: "Industry Sector Specialist",
      focus: DEFAULT_SECTOR_FOCUS,
      domain: spec.domain,
      isSectorSpecialist: true,
      weight: 1,
      tone: "sector",
    },
  ];
}

/** roleSlug -> concrete 6-seat committee. Built once at module load. */
export const ROLE_COMMITTEES: Record<string, AgentConfig[]> = Object.fromEntries(
  Object.entries(ROLE_DETAILS).map(([slug, spec]) => [slug, buildCommittee(spec)]),
) as Record<string, AgentConfig[]>;

/** Filter a full committee to the seats allowed for the candidate's band. */
export function filterByBand(
  committee: AgentConfig[],
  experienceYears?: number,
): AgentConfig[] {
  const band = bandForYears(experienceYears);
  if (!band) return committee;
  const kinds = new Set<AgentSeat>(SEATS_BY_BAND[band]);
  return committee.filter((agent) => agent.kind && kinds.has(agent.kind));
}

/**
 * Apply the optional sector-focus override to the Sector Specialist seat,
 * which lets one role template serve arbitrary target industries. Unknown
 * sectors get the generic sector mandate.
 */
export function applySectorOverride(
  committee: AgentConfig[],
  sectorFocus?: string,
): AgentConfig[] {
  if (!sectorFocus) return committee;
  return committee.map((agent) =>
    agent.isSectorSpecialist
      ? {
          ...agent,
          role: `${sectorFocus} Sector Specialist`,
          focus: `Industry-specific fit for ${sectorFocus}: domain protocols, compliance, industry stack, plus cross-sector transferable skills.`,
        }
      : agent,
  );
}

/**
 * Resolve the committee for a role slug with the band filter and the sector
 * override applied. Returns undefined when the slug is unknown (caller falls
 * back to the domain committee).
 */
export function getCommitteeForRole(
  roleSlug: string,
  sectorFocus?: string,
  experienceYears?: number,
): AgentConfig[] | undefined {
  const committee = ROLE_COMMITTEES[roleSlug];
  if (!committee) return undefined;
  return applySectorOverride(filterByBand(committee, experienceYears), sectorFocus);
}

/** All role slugs that have a committee (should equal the 42 template slugs). */
export const ROLE_COMMITTEE_SLUGS: readonly string[] = Object.keys(ROLE_COMMITTEES);

/**
 * Opt-in level-aware panel adjustment (Layer 1, plan section 4). The candidate
 * band filter stays the base; this adds Staff/Principal seats back for a
 * Staff/Principal JD, drops the Sector Specialist seat when the sector is too
 * generic, and reports a forced "level inflation" topic when the base resume
 * title outclaims the candidate band.
 */
export interface PanelSelection {
  /** JD level extracted from the job decomposition (e.g. "Staff", "Principal"). */
  jdLevel?: string;
  /** Candidate experience years (band), used to detect level inflation. */
  experienceYears?: number;
  /** First line of the base resume (the candidate's own title). */
  baseResumeTitle?: string;
  /** False when the sector is not specific enough for a dedicated specialist seat. */
  includeSectorSpecialist?: boolean;
}

export interface SelectedPanel {
  agents: AgentConfig[];
  /** Extra mandatory discussion topics the panel rules force onto every seat. */
  forcedTopics: string[];
}

/** Normalize a JD level string to a level token, or undefined. */
export function normalizeJdLevel(level?: string): "staff" | "principal" | "senior" | undefined {
  if (!level) return undefined;
  const lower = level.toLowerCase();
  if (lower.includes("principal")) return "principal";
  if (lower.includes("staff")) return "staff";
  if (lower.includes("senior")) return "senior";
  return undefined;
}

/**
 * Apply the opt-in level-aware panel rules on top of the band-filtered
 * committee. `fullCommittee` (the unfiltered 6-seat set) is the source of any
 * Staff/Principal seats the band filter removed.
 */
export function selectPanel(
  committee: AgentConfig[],
  fullCommittee: AgentConfig[],
  selection?: PanelSelection,
): SelectedPanel {
  if (!selection) return { agents: committee, forcedTopics: [] };

  let agents = committee;
  const forcedTopics: string[] = [];

  if (selection.includeSectorSpecialist === false) {
    agents = agents.filter((a) => !a.isSectorSpecialist);
  }

  const jdLevel = normalizeJdLevel(selection.jdLevel);
  if (jdLevel === "staff" || jdLevel === "principal") {
    const kinds = new Set<AgentSeat>(
      agents.map((a) => a.kind).filter((k): k is AgentSeat => Boolean(k)),
    );
    for (const kind of ["principal", "staff"] as const) {
      if (!kinds.has(kind)) {
        const seat = fullCommittee.find((a) => a.kind === kind);
        if (seat) {
          agents = [...agents, seat];
          kinds.add(kind);
        }
      }
    }
  }

  const band = bandForYears(selection.experienceYears);
  const candidateAtMostSenior = band === "entry" || band === "mid" || band === "senior";
  const title = (selection.baseResumeTitle ?? "").toLowerCase();
  const claimsStaffPrincipal = /\b(staff|principal)\b/.test(title);
  if (claimsStaffPrincipal && candidateAtMostSenior) {
    forcedTopics.push(
      "Level inflation (title vs. actual scope): the base resume claims a Staff/Principal title, but the candidate's evidence band is at most senior. Verify the real scope and seniority behind the title.",
    );
  }

  return { agents, forcedTopics };
}
