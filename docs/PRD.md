# Rattle-Snake V2 — Product Requirements Document (PRD)

> **Version:** 2.0.0 · **Status:** Approved · **Last updated:** 2026-08-12
> **Owner:** Product / Platform Engineering · **Repo:** `Rattle-Snake-V2`
> Companion docs: `docs/strategy.md` (sprint plan), `docs/feature-tracker.md` (implementation status + code references), `docs/architecture.md` (technical spec).

---

## 1. Vision

**Rattle-Snake V2** is a self-hosted, production-oriented **hiring committee** that runs a structured, multi-agent **debate** between named domain-expert personas against a Job Description (JD) and a Candidate Resume. The committee is forced to reach a **non-neutral** verdict (SHORTLISTED or REJECTED), produces an auditable **Hiring Committee Blueprint** of objections, and rewrites the candidate's resume to **resolve every raised objection**.

It solves three core architectural challenges:

1. **Domain-Specific Committee Templates** — instantiate tailored committee personas based on the target job domain (Finance, Data/AI, Software Engineering).
2. **The Sector/Domain Transferability Specialist** — a 5th agent who evaluates industry-specific nuances, domain compliance, and cross-sector transferable skills.
3. **The "Non-Neutral" Persona Guardrail** — prompting techniques that force agents to weigh both pros and cons dynamically while requiring a decisive, non-neutral final stance.

---

## 2. Goals / Non-Goals

### 2.1 Goals
- **G1** Provide 5-persona, named, domain-tailored hiring committees for at least 3 domains: **SWE / SDE**, **Data & AI**, **Finance & Banking**.
- **G2** Every committee includes a **Sector/Domain Transferability Specialist** seat that audits industry fit and cross-sector transferable skills.
- **G3** Force every agent turn to end in a non-neutral, unambiguous verdict (`[STRONG HIRE]` / `[STRONG REJECT]`), enforced in code, not just prompt.
- **G4** Run a multi-round debate: Round 1 openings → Round 2+ cross-talk/rebuttals → Round 3 final ballot with **weighted consensus**.
- **G5** Convert the debate into a **Hiring Committee Blueprint** (objections, strengths, required changes, sector notes, pivot factors, per-agent verdicts, consensus).
- **G6** Generate an **objection-clearing rewritten resume** driven by the blueprint + full debate transcript.
- **G7** **Stream the debate live** to the frontend (SSE) and persist every run (SQLite).
- **G8** Be fully **self-hostable and open-source**: TypeScript, Astro frontend, Node/Hono backend, OpenAI-compatible LLM (Ollama / vLLM / LocalAI / llama.cpp), SQLite persistence.

### 2.2 Non-Goals (v2)
- No candidate CRM, applicant tracking system, or scheduling.
- No multi-user accounts / org separation (P3 extension, see roadmap).
- No direct integration with LinkedIn / job boards / email.
- No automated PDF/DOCX resume parsing in v2 core (P2 extension).
- The verdict is **advisory** — the system produces a recommendation, never a binding hiring decision.

---

## 3. Personas & Use Cases

| Persona | Need | Use Case |
|---|---|---|
| **Hiring Manager / Recruiter** | Fast, defensible screening signal | Paste JD + resume, pick domain, get a live committee verdict + blueprint within minutes. |
| **Candidate** | A resume that survives rigorous scrutiny | Receive a rewritten resume that resolves the committee's concrete objections. |
| **Self-hosted operator** | Private, offline, low-cost AI | Run everything locally against Ollama/vLLM with no cloud dependency. |
| **Platform engineer** | Extensible, testable system | Add committees/domains via pure data; swap LLM backend via env config. |

---

## 4. Functional Requirements

> Each requirement carries an **ID** used throughout the sprint plan (`docs/strategy.md`) and the feature tracker (`docs/feature-tracker.md`) to map status → code references.

### 4.1 Domain-Specific Committee Configurations (FR-1)

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-1.1 | System must define **named, 5-persona committees** per domain: **SWE/SDE**, **Data & AI**, **Finance & Banking**. | Each domain template lists 5 named personas with a role and a focus (evaluation lens). |
| FR-1.2 | The **SWE/SDE Committee** must include personas covering: Recruiter (Priya), Technical Specialist (Alex — Staff Architect), Team Lead (Marcus), Hiring Manager (Elena — VP Eng), Sector Specialist (Liam — FinTech). | Template matches the Domain Committee Matrix in §4.6. |
| FR-1.3 | The **Data & AI Committee** must include: Recruiter (Sarah), Technical Specialist (Dr. Aris — Principal ML), Team Lead (Vikram — Data Platform), Hiring Manager (Director Karen — Head of AI/Data), Sector Specialist (Maya — HealthTech). | Template matches the Domain Committee Matrix in §4.6. |
| FR-1.4 | The **Finance & Banking Committee** must include: Talent Partner (David), Technical Specialist (Elena — VP Quant), Team Lead (Michael — Portfolio/Desk), Hiring Manager (Chen — MD Finance), Sector Specialist (Sophia — Energy/Real Estate). | Template matches the Domain Committee Matrix in §4.6. |
| FR-1.5 | Committees must be **pure data + prompt functions** (no in-memory agent state), making new domains trivial to add. | Adding a domain = one new data file; no orchestrator changes. |
| FR-1.6 | **Domain auto-detection** from the JD text (keyword scoring), overridable by the user. | `detectDomain(jd)` returns `SWE` / `DATA_AI` / `FINANCE` or `null`; UI pre-selects; user can override. |
| FR-1.7 | The Sector Specialist seat must be **overridable per job** via a `sectorFocus` input. | `getCommitteeForDomain(domain, sectorFocus)` rewrites the specialist's role/focus. |

### 4.2 Sector Specialist Agent: Evaluating Transferable Skills (FR-2)

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-2.1 | The Sector Specialist must act as an **industry-fit auditor**, not a generic reviewer. | Its system prompt carries a **SECTOR & TRANSFERABILITY MANDATE** (§4.6.3). |
| FR-2.2 | **Domain-Matched Scenario:** when candidate experience matches the target sector, the specialist checks for **deep domain alignment** (e.g., low-latency payments, PCI-DSS, double-entry ledgers). | Prompt + output includes domain-protocol/compliance scrutiny. |
| FR-2.3 | **Cross-Sector Scenario:** the specialist evaluates **transferable skills** and names 1–2 skills that translate AND 1–2 gaps requiring ramp-up. | Prompt template contains a concrete transferability example and demands named skills/gaps. |
| FR-2.4 | Sector notes must flow into the **blueprint** (`sectorNotes`) and drive resume reframing. | `blueprint.sectorNotes` populated; rewriter prompt maps transferable skills to the target sector. |

### 4.3 The "Decisive Non-Neutrality" Prompting Framework (FR-3)

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-3.1 | **Two-Pass Critical Thinking Pattern:** Phase A — steel-man BOTH sides (top 2 HIRE + top 2 REJECT reasons); Phase B — **Forced Pivot** (the single factor that tipped the decision) + **final unambiguous verdict**. | Agent system prompt contains `[STRONG POSITIVES]`, `[HIGH-RISK CONCERNS]`, `[PIVOT POINT]`, `[VERDICT]` sections (§4.6.2). |
| FR-3.2 | **Neutral verdicts forbidden.** Verdict must be `[STRONG HIRE]` or `[STRONG REJECT]`. Neutral scores (3/5, "weak lean") are explicitly banned. | Prompt law #1 forbids neutrality; the mock always emits a strong verdict. |
| FR-3.3 | **Enforced in code**, not just prompt: response must parse to `HIRE`/`REJECT`. | `parseDecision()` extracts the verdict; `hasNeutralLanguage()` flags evasive text. |
| FR-3.4 | **Redress loop:** if an agent violates the verdict format, it is re-prompted with a corrective instruction (up to `AGENT_MAX_RETRIES`). | Retry loop observed; fallback inherits the agent's prior vote, else `REJECT`. |
| FR-3.5 | **Debate engagement law:** each turn must address fellow committee members by name in cross-talk. | Prompt law #4 + cross-talk phase block enforce this. |

### 4.4 End-to-End Orchestration (FR-4)

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-4.1 | **Committee Auto-Selection** — system reads JD + domain, dynamically loads the matching 5-persona committee. | POST `/api/jobs` resolves domain (body → detection → default) and loads the template. |
| FR-4.2 | **Round 1 — Opening Arguments & Sector Fit** — each persona presents initial assessment with 2 pros, 2 cons, and a forced initial verdict; Sector Specialist explicitly analyzes industry context + transferability. | 5 opening transcript entries, each with `decision`. |
| FR-4.3 | **Round 2 — Committee Debate Loop** — agents respond to one another in a shared chat transcript, challenging/agreeing by name. | ≥2 cross-talk passes (`DEBATE_CROSS_TALK_ROUNDS`), 5 entries each. |
| FR-4.4 | **Round 3 — Final Ballot & Verdict** — weighted vote; majority → SHORTLISTED else REJECTED; generates the **Hiring Committee Blueprint**. | Ballot entries (5) + consensus; blueprint published. |
| FR-4.5 | **Objection-Clearing Resume Generation** — rewrite driven by Blueprint + Debate Transcript + Base Resume. | `rewrittenResume` resolves objections; unverifiable gaps become `[ADD: ...]` placeholders. |
| FR-4.6 | **Live streaming** of every stage to the UI. | SSE endpoint replays snapshot + pushes `entry/status/verdict/blueprint/resume/done/error`. |
| FR-4.7 | **Persistence + job isolation** — one isolated `JobState` per candidate evaluation. | SQLite row per job; crash mid-debate loses only in-flight turns. |

### 4.5 Weighted Consensus (FR-5)

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-5.1 | Votes are **weighted** by seat (e.g., technical specialist and hiring manager weigh more than recruiter). | `aggregateVotes()`: score = Σ(HIRE weights)/Σ(all weights). |
| FR-5.2 | `> 0.5` → SHORTLISTED, `< 0.5` → REJECTED, `= 0.5` → **tie-break by highest-weight seat** (hiring manager). | Unit-tested consensus math incl. the 0.5 case. |
| FR-5.3 | Ballot + tallies are surfaced to the UI and stored in the blueprint. | Verdict card shows HIRE/REJECT tallies + per-agent ballot. |

### 4.6 Appendix: Required Prompt & Template Contracts

#### 4.6.1 Domain Committee Matrix
| Role | SWE / SDE Committee | Data & AI Committee | Finance & Banking Committee |
|---|---|---|---|
| **Screener** | Priya (Tech Recruiter) — code bases, system scale, core DSA, CS fundamentals | Sarah (Data/AI Recruiter) — math background, ML stack, data pipelines, SQL | David (Finance Talent Partner) — licenses (CFA/CPA), financial modeling, pedigree, risk exposure |
| **Technical Specialist** | Alex (Staff Software Architect) — design patterns, concurrency, microservices, code quality | Dr. Aris (Principal ML/Data Scientist) — algorithmic depth, model metrics, data drift, feature engineering | Elena (VP Quantitative Analytics) — financial math, Monte Carlo, valuation models, market risk |
| **Team Lead** | Marcus (Engineering Lead) — sprint velocity, CI/CD, debugging, production readiness | Vikram (Data Platform Lead) — ETL pipelines, data governance, latency, infra cost | Michael (Portfolio/Desk Lead) — deal execution, trade velocity, PnL impact, audit trails |
| **Hiring Manager** | Elena (VP Engineering) — technical debt, developer productivity, product impact | Director Karen (Head of AI/Data) — strategic AI adoption, data monetization, business ROI | Managing Director Chen — capital allocation, regulatory risk, bottom-line growth |
| **Sector Specialist** | Liam (Domain Expert — FinTech) — domain protocols, industry stack, compliance | Maya (Domain Expert — HealthTech/Retail AI) — HIPAA/GDPR, domain metrics | Sophia (Sector Expert — Energy/Real Estate) — asset class nuances, macro drivers, compliance |

#### 4.6.2 Non-Neutral Persona System Prompt (template contract)
- **IDENTITY & CONTEXT:** name, title, domain focus, evaluation style.
- **CRITICAL ENGAGEMENT LAWS:**
  1. **NO NEUTRALITY ALLOWED** — must end with `[STRONG HIRE]` or `[STRONG REJECT]`.
  2. **BALANCED EVALUATION REQUIRED** — top 2 hire reasons + top 2 reject reasons (steel-man both sides).
  3. **THE PIVOT POINT** — declare the single factor that tipped the decision.
  4. **DEBATE ENGAGEMENT** — address fellow members by name.
  5. **SECTOR & TRANSFERABILITY MANDATE** (Sector Specialist only).
- **OUTPUT FORMAT (strict):** `[STRONG POSITIVES]` / `[HIGH-RISK CONCERNS]` / `[DEBATE RESPONSE]` / `[PIVOT POINT]` / `[VERDICT] [STRONG HIRE|REJECT]`.

#### 4.6.3 Synthesis prompts
- **Blueprint extractor:** debate transcript → JSON matching the `Blueprint` schema (objections, strengths, requiredChanges, sectorNotes, pivotFactors, verdicts, consensus).
- **Resume transformer:** base resume + JD + blueprint + transcript → rewritten Markdown resume resolving every objection; unknown metrics become `[ADD: ...]` placeholders; never fabricate.

---

## 5. Non-Functional Requirements

| ID | Category | Requirement | Acceptance criteria |
|---|---|---|---|
| NFR-1 | **LLM agnosticism** | Must run against any OpenAI-compatible endpoint (Ollama, vLLM, LocalAI, llama.cpp, LM Studio, cloud). | Single client; `LLM_BASE_URL`/`LLM_MODEL` config; **offline mock provider** for CI/demo. |
| NFR-2 | **Performance** | A full committee run completes without manual intervention. | Async job + SSE; typical run < a few minutes on local LLM. |
| NFR-3 | **Reliability** | Failed/aborted runs must not corrupt stored data. | Status transitions persisted; restart recovery marks orphaned jobs `failed`. |
| NFR-4 | **Observability** | Health endpoint exposes provider/model/debate config. | `GET /health` returns `{ ok, service, llm, debate }`. |
| NFR-5 | **Security (self-hosting)** | Docs/code must support adding simple auth and guard against prompt injection in JD/resume text. | Roadmap/strategy tracks auth middleware + injection guardrails. |
| NFR-6 | **Testing** | Core logic must be unit/integration tested. | vitest suite for non-neutrality, consensus math, blueprint fallback, routes, domain detection. |
| NFR-7 | **Portability / self-host** | One-command startup; containerized option. | Dockerfiles (api + web) + `docker-compose.yml`; `.env.example`. |
| NFR-8 | **Type safety** | All shared contracts typed end-to-end. | `noUncheckedIndexedAccess` on; Zod validation on API boundaries; `pnpm run typecheck` green. |

---

## 6. Constraints & Assumptions

- **Monorepo:** pnpm workspaces + Turborepo; shared types package (`@rattlesnake/shared`).
- **Frontend:** Astro (SSR, `@astrojs/node` standalone) + React islands.
- **Backend:** Node 22 + Hono (`@hono/node-server`), SSE streaming.
- **Persistence:** better-sqlite3 (local dev) — Postgres/Redis are roadmap swaps.
- **Verdicts are advisory.** Final hiring decisions remain human-owned.
- The rewritten resume **must never fabricate** facts absent from the base resume.
- Long-running debates run in a **dedicated backend process**, not Astro API routes.

---

## 7. Success Metrics

| Metric | Target |
|---|---|
| Debate format adherence (every turn ends in a strong verdict) | 100% enforced (parse + redress + fallback) |
| Blueprint JSON parse rate (real LLM) | ≥ 90% without the rule-based fallback |
| Domain detection accuracy (curated JD corpus) | ≥ 85% |
| E2E run success (mock) | 100% — job reaches `completed` |
| Build + typecheck | `pnpm run build` + `typecheck` green |
| Test coverage of core modules | ≥ 80% of core (non-neutrality, debate, blueprint, routes) |

---

## 8. Release Plan (aligned with `docs/strategy.md`)

| Milestone | Sprint | Contents |
|---|---|---|
| **M0 — Docs & planning** | Sprint 0 | PRD, strategy, feature tracker, architecture, roadmap |
| **M1 — Core complete (P1)** | Sprint 1 | Automated tests, README, Docker, web-start verification, git init |
| **M2 — Production hardening (P2)** | Sprint 2 | Real-LLM validation, auth, file upload/export, e2e, token streaming, rate limiting |
| **M3 — Extensions (P3)** | Sprint 3+ | More domains, structured JSON mode, multi-user, historical eval |
