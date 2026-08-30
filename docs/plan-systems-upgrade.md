# Rattle-Snake V2 — Systems Upgrade Plan

**Status:** Implemented (2026-08-29) - job decomposition, derived level/role-aware weighting, authenticity scrutiny, gap analysis, and the committee report as the resume-generation input are live in the pipeline; execution-layer upgrades tracked as WS-14/15/16 in `docs/feature-tracker.md`
**Scope:** Make the committee debate think like senior practitioners (not textbook checklists), fix team weighting, add candidate-authenticity scrutiny, and produce a single authoritative **committee report Markdown** (full discussion + every expert's hire/no-hire verdict) that becomes the input to resume generation. Add a strategic positioning layer to resume generation (deep gap analysis, structural credibility fixes, versioning + recommendation).

---

## 1. TL;DR — what this plan delivers

1. **The debate stops being a textbook checklist.** Each seat evaluates like a senior practitioner: it first decomposes the actual job (level, years, must-haves, the company's concrete business problems, screening filters), then audits the candidate against that with critical, logical, business, and systems thinking — including whether the experience is **genuine** or AI-fluffed.
2. **The committee is properly weighted.** Weights become role/level/domain-aware and are derived, not hardcoded; every expert surfaces explicit **reasons to hire** and **reasons not to hire**, not just a HIRE/REJECT stamp.
3. **A committee report Markdown is produced** containing the full discussion, every expert's 360 analysis, each final verdict, the weighted consensus, credibility findings, and authenticity flags — in README markdown format. **This exact file becomes the resume-generation input.**
4. **Resume generation gets a strategic layer:** deep JD→experience mapping, structural credibility fixes (dates, overlaps, brands, title-level), bullet prioritization for the target role, missing high-ROI sections, and **one primary version + variants with a recommendation** explaining trade-offs.

---

## 2. Verified current state (what exists today)

| Area | Where | What it does today |
|---|---|---|
| Debate engine | `apps/api/src/committee/debateEngine.ts` | Round 1 openings (structured 360 JSON), N cross-talk rounds, final ballot, weighted consensus |
| Seat weights | `packages/shared/src/agents/roleCommittees.ts` (`buildCommittee`) | Hardcoded: senior 1, manager 1, staff 1.2, principal 1.3, recruiter 0.8, sector 1 |
| Agent system prompt | `packages/shared/src/prompts.ts` (`buildAgentSystemPrompt`) | 8 fixed factors (Experience, Education, Technical Skills, Projects, Domain, Sector, Product Thinking, Role-specific) scored 0-5; non-neutrality laws; `[STRONG HIRE]/[STRONG REJECT]` |
| Verdict enforcement | `apps/api/src/committee/agentExecutor.ts` | Forces every turn to end in HIRE/REJECT; parses 360 JSON |
| Blueprint (GAP report) | `apps/api/src/committee/blueprintExtractor.ts` + `buildBlueprintPrompt` | objections, strengths, requiredChanges, sectorNotes, pivotFactors, verdicts, consensus |
| Resume generation | `apps/api/src/resume/engine.ts` (`generateSophisticatedResume`) | role template JSON + role prompt + committee section + divergence directive + screening checklist + moderator re-run loop (max 2 iterations) |
| Resume quality auditor | `apps/api/src/resume/moderator.ts` | Banned phrases, hallucination check, structure check on the **output** |
| Role writer prompts | `apps/api/src/resume/prompts/*.ts` (e.g. `ml_engineer.ts`) | Bullet limits, X-Y-Z, ATS keywords, banned words, skill triage |
| Trigger points | `apps/api/src/routes/jobs.ts` (POST `/:id/resume/generate`), `apps/api/src/committee/generateChain.ts` | On-demand and chained generation |
| Web UI | `apps/web/src/components/DebateView.tsx`, `ResumeGenerator.tsx` | Streams transcript/analyses/verdict; downloads one resume |

### Gaps confirmed against your critique

| Your finding | Confirmed? | Root cause |
|---|---|---|
| Surface rewriting + keyword alignment only | Yes | Role prompts optimize readability/keywords; no strategic positioning step |
| No deep JD→experience gap analysis | Yes | JD used as a word-cloud; no requirement-level mapping or gap mitigation/warning |
| No structural credibility fixes | Yes | No date/overlap/title/brand audit anywhere |
| No bullet prioritization for the target role | Yes | Flat bullet limits; no "lead with X, de-emphasize Y" logic |
| No missing-section recovery (projects, education dates) | Yes | Template renders whatever the source has; no gap-filling sections |
| No recommendation/trade-offs between versions | Yes | Each generation is a single independent output; no variants, no rationale |
| Recruiter/market psychology thin | Partial | `moderator.ts` + `screening.ts` audit output text; they do not model the 20-30s screen or narrative credibility |
| "Two versions" with no guidance | Partial | The tool produces one output per run; the two versions you saw were two separate runs |
| Debate feels textbook / not weighted | Yes | Fixed 8-factor checklist; weights hardcoded and unrelated to role seniority/domain |
| No business/systems thinking in the panel | Yes | Factors are material/tool-focused; no business impact, systems view, or decision quality |
| No authenticity (AI-generated) check | Yes | Nothing audits whether the candidate's experience reads genuine vs. generic/AI-fluffed |

---

## 3. Design targets

### 3.1 The panel thinks like senior practitioners
Replace the fixed 8-factor checklist with a **two-layer evaluation**:

- **Layer 1 — Job decomposition (new, pre-debate).** A new `jobDecomposition` step parses the JD into a structured brief that every seat receives:
  - Role level (e.g., Applied Scientist III = senior IC, expects ~5-8 yrs, system-level ownership)
  - Explicit screening filters (titles that auto-filter, "not a dashboards role" disclaimers)
  - Must-have skills, nice-to-have skills, exact stack words (Snowflake, Pandas, etc.)
  - The company's 2-4 concrete near-term problems/projects from the JD (e.g., Garner: provider tiering optimization, AI primary care doctor w/ eval harnesses + guardrails, member engagement via claims data)
  - Domain constraints (healthcare/claims), business context (what the company sells and how it makes money)
- **Layer 2 — Per-seat 360 with judgment.** Each seat scores role-specific factors (not a fixed generic list) PLUS a **senior-practitioner reasoning section**: how they would plan/approach the candidate's actual work, systems/business impact, and decision quality. The score sheet becomes evidence-driven: every score needs the specific bullet/evidence that supports it.

### 3.2 Four debate mandates (new, explicit)
Every seat MUST address:
1. **Profile understanding** — reconstruct the candidate's true career arc (seniority, trajectory, pure industry years, what each role actually was) and evaluate the *person*, not the bullets.
2. **Missing skills for the role** — an explicit, ranked gap list: required vs. absent, with a verdict on ramp-up cost vs. disqualifying.
3. **Business understanding** — does the candidate reason about business outcomes (cost/access/revenue levers, trade-offs, prioritization), mapped to the JD's own stated problems.
4. **Authenticity check** — does the experience read **genuine** (specific, coherent, verifiable, dates/logic consistent) or **AI-generated / padded** (vague, implausibly precise, generic, inconsistent)? Flag every red flag and unverifiable claim explicitly.

Plus a **structural credibility audit** (recruiter seat + a new "Screening & Credibility" lens): overlapping dates, missing graduation years, timeline compression, weak brand names without context, title-vs-level mismatch, "N+ years" claims vs. the actual timeline.

### 3.3 Role/level/domain-aware weighting
Replace hardcoded weights with a derived model, e.g.:
```
baseWeight(seat, seniorityBand, domain):
  senior     1.0   (technical ground truth)
  manager    1.0   (delivery/ownership)
  staff      1.2 + bonus for senior/principal bands (deep technical bar)
  principal  1.3 + bonus for senior/principal bands
  recruiter  0.8 (0.6 for senior roles — screening matters but can't override the bar)
  sector     0.9 + bonus for domain-critical sectors (healthcare, fintech)
```
- Ties break by the **hiring manager**, and the report states the exact weighted tally.
- Every expert's `hireReasons[]` and `rejectReasons[]` are stored and surfaced; the consensus is always accompanied by the top hire/reject reasons from the committee as a whole.

### 3.4 The committee report Markdown (the single source of truth for resume generation)
New builder `apps/api/src/committee/committeeReport.ts`. Output, in README markdown format:

```markdown
# Committee Evaluation Report — <job id>
## 1. Role & Context        (job decomposition brief)
## 2. Candidate Summary     (profile understanding: arc, seniority, timeline)
## 3. The Debate            (full transcript, grouped by round, verbatim)
## 4. Expert Analyses       (each seat: 360 scores + reasoning)
## 5. Final Verdicts        (each expert: HIRE/REJECT + reasons to hire / not hire)
## 6. Weighted Consensus    (tally math, tie-break, decision)
## 7. Executive Review      (CTO/CFO/CMO/etc. at <Company>: debate relevance,
                             role alignment, growth alignment, opinion, conditions)
## 8. Gap Report            (missing skills, ranked)
## 9. Credibility Findings  (dates, overlaps, brands, title-level)
## 10. Authenticity Flags   (genuine vs AI-padded, unverifiable claims)
## 11. Blueprint for Resume (objections → required changes, strengths to protect)
```

- Stored on the job (`committeeReportMd`), served by `GET /api/jobs/:id/report`, and rendered in the UI.
- **Resume generation consumes this file** (the full report, not a truncated 8-entry excerpt) as its authority.

### 3.5 Strategic resume layer
New module `apps/api/src/resume/strategy.ts` — a **Positioning Plan** produced before rewriting:
1. **Requirement mapping**: every major JD requirement → the evidence that proves it, or a flagged gap (with mitigation or `[ADD: ...]` + explicit warning to the user).
2. **Credibility fixes**: concrete edits — `[ADD: graduation year]`, split/clarify overlapping roles, compress legacy stints, reframe weak brands with impact amplification, correct title-vs-level.
3. **Lead/de-emphasize decision**: which experience leads (ordered by relevance to the target role, not recency alone) and which to shrink.
4. **Section plan**: which high-ROI sections to add (Selected Technical Work, Projects, Education dates, multi-objective optimization examples) with placeholder sourcing.
5. **Narrative identity**: reframe from Analyst/Engineer → Applied Scientist/Quant where the evidence supports it (honest elevation, never fabrication).
6. **Protect list**: the exact bullets/specifics (e.g., `pgvector ANN + CUDA cross-encoder reranking`, `GxP compliance`) that must survive polishing.

Then generation runs **once per version**: primary (aggressive alignment, "Version A") + 1 optional variant ("Version B") with explicit trade-offs, and a **recommendation** stating which to submit and why. Version A keeps technical specificity; Version B optimizes readability — never the reverse.

### 3.6 Executive Review — the Moderator's Opinion (advisory, NOT final)
A single executive seat that closes the pipeline after the blueprint. The moderator reads the JD, the candidate's resume, the full debate, and the blueprint, then gives **their opinion** on whether the debate and the candidate are actually relevant to **the company's growth** — not just to the job spec.

> **Important:** the moderator's decision is an *opinion, never the final word*. The committee consensus remains the run's verdict. The moderator only says whether, in that exec's judgment, the debate and the candidate fairly benefit the organization or not. The candidate can then read everything and respond (§3.7).

**Persona is company- and function-aware (auto-derived, no hardcoding a fake CEO):**
- The moderator is always the most senior exec for the role's function and speaks as an executive **of the actual hiring company** (role becomes e.g. `CTO at Garner`). The persona brief is built from `businessContext` + the JD's stated problems.
- Function mapping (driven by `roleSlug` overrides first, then domain):
  - Engineering / ML / AI / Data-engineering / DevOps / Networking → **CTO**
  - Pure security → **CISO**
  - Data science / analytics → **CDO** (or CTO when the JD is engineering-led)
  - Finance / quant / accounting roles (roleSlug overrides) → **CFO** (or CEO for chief-level)
  - Marketing / GTM / growth roles → **CMO**
  - Product roles → **CPO**
  - Program / operations / management → **COO**
  - Everything else / exec-general → **CEO**
- If the company name is absent from the JD, the role becomes `<Function> (hiring company)` and the persona uses the sector.

**What the moderator must do (four checks):**
1. **Debate relevance**: was the committee debate actually about this company's stated problems, or generic? Calls out drift (e.g., "the panel evaluated a generic ML engineer, not an Applied Scientist who would own provider-tiering optimization").
2. **Role alignment**: does the candidate profile meet the *posting requirements* (level, must-haves, stack) on the evidence, with the same rigor as the committee?
3. **Growth alignment**: if hired, would this person move the company's stated 2-4 business problems forward? (e.g., Garner: provider tiering optimization, AI primary care doctor with eval harnesses/guardrails, claims-data member engagement.)
4. **Opinion verdict**: SHORTLISTED / REJECTED *in the moderator's opinion*, with conditions. This is explicitly framed as the exec's view — it does **not** override the committee consensus and never changes `finalVerdict`.

**Pipeline position (in `runner.ts`):**
```
jdMeta → jobDecomposition → debate (openings → crosstalk → ballot)
      → blueprint → EXECUTIVE OPINION (new) → committee report markdown → done
```
- Streamed to the UI as a new SSE event type `executive`.
- A moderator failure is isolated: the report shows "Executive review could not be completed" instead of failing the run.

### 3.7 Candidate Response — the right of reply (persisted to SQLite)
After the debate and the moderator's opinion, the **candidate** (the person whose resume was evaluated) can read the full chat (transcript + every expert's analysis + the moderator's opinion) and file a categorized response. This is the human side of the loop: the tool produced an opinion; the candidate gets to evaluate the evaluation.

**Categorized options (pick one; configurable list):**
| Code | Label shown to candidate |
|---|---|
| `FAIR_SATISFIED` | Panel discussion is fair — I am satisfied |
| `PARTIALLY_FAIR` | Mostly fair, but it missed important context about my background |
| `NEUTRAL` | No strong opinion either way |
| `UNFAIR_DISAGREE` | Panel discussion does not make sense — I am not at all satisfied |
| `DISPUTE_VERDICT` | I disagree with the verdict / specific points (I will list them) |

Plus **free text** (required only for `DISPUTE_VERDICT`): the candidate can quote the exact points they dispute and give their counter-evidence.

**Storage & flow:**
- New SQLite table `candidate_responses` (`job_id` PK, `sentiment`, `comment`, `disputed_points` JSON, `updated_at`) in `apps/api/src/db/store.ts`.
- API: `GET /api/jobs/:id/candidate-response` and `PUT /api/jobs/:id/candidate-response` (upsert; require the run to be `completed`; the response can be edited later — it always stores the latest).
- UI: a "Your Response" panel in `DebateView.tsx`, shown once the run is completed and the moderator opinion is available. Contains the categorized options, a textarea, a submit/update button, and a "saved" confirmation. The candidate can return anytime and revise.
- The stored response is available to future pipeline steps (it is not baked into the resume), and can optionally be appended to the committee report on regeneration.

---

## 4. Schema changes (`packages/shared/src/`)

| Type | Change |
|---|---|
| `SmeAnalysis` | add `hireReasons: string[]`, `rejectReasons: string[]`, `missingSkills: string[]`, `authenticityFlags: { flag: string; severity: "low"\|"medium"\|"high" }[]`, `credibilityFindings: string[]`, `businessAssessment: string` |
| `JobDecomposition` (new) | `level`, `seniorityExpectation`, `screeningFilters`, `mustHave[]`, `niceToHave[]`, `stackWords[]`, `businessProblems[{problem, detail, mappedRequirement}]`, `domainConstraints[]`, `businessContext` |
| `ExecutiveReview` (new) | `persona` (`"CTO"\|"CFO"\|"CMO"\|"CISO"\|"CDO"\|"COO"\|"CPO"\|"CEO"`), `company`, `debateRelevance: { score, note }`, `roleAlignment: { score, note }`, `growthAlignment: { score, note }`, `requirementAssessment`, `conditionsToHire: string[]`, `opinion: "FAVORABLE"\|"NEUTRAL"\|"UNFAVORABLE"`, `opinionReason`, `summary` — an *opinion*, never a verdict; it never changes `finalVerdict` |
| `CandidateResponse` (new) | `jobId`, `sentiment: "FAIR_SATISFIED"\|"PARTIALLY_FAIR"\|"NEUTRAL"\|"UNFAIR_DISAGREE"\|"DISPUTE_VERDICT"`, `label` (resolved from configurable list §3.7), `comment`, `disputedPoints?: string[]`, `updatedAt` — persisted in SQLite table `candidate_responses`, not on `JobState` |
| `JobState` | add `jobDecomposition?`, `executiveReview?`, `committeeReportMd?`, `positioningPlan?`, `resumeVersions?: { id, label, markdown, json, tradeoffs }[]`, `resumeRecommendation?` |
| `Blueprint` | add `credibilityFindings: string[]`, `authenticityFlags[]`, `missingSkillsRanked[]`, `requirementMap: { requirement, evidence, status: "proven"\|"partial"\|"missing"\|"unverifiable", action }[]` |
| `ResumeMeta` | add `strategy: { leadingExperiences[], protectedBullets[], addedSections[], credibilityFixes[], recommendation }` |

---

## 5. Prompt rewrites

### 5.1 Committee prompts — `packages/shared/src/prompts.ts`
- Replace the fixed 8-factor list with **role-conditional factors + the four mandates**.
- Add the job-decomposition brief block to every system prompt.
- New "Senior Practitioner" framing replacing the current one-line "Evaluation Style":

  > *"You are a working senior <role> who has sat on interview loops and read thousands of resumes. You evaluate the candidate as you would a real peer: decompose the actual job, weigh business impact, and call out when experience reads padded or AI-generated. You give concrete reasons, not labels."*

- Add the **Business & Systems Reasoning** and **Authenticity** law blocks.
- Keep non-neutrality law, but ballots now also emit `hireReasons`/`rejectReasons` (structured).

### 5.2 Role writer prompts — `apps/api/src/resume/prompts/*.ts` (42 files)
- Add a shared strategic block (referencing `positioningPlan` + `committeeReportMd`).
- Update per-role `specialistFocus` in `roleCommittees.ts` with senior-practitioner, business-aware language; for domain-heavy roles add explicit business-problem framing (healthcare/claims for Applied Scientist, etc.).
- Add the exact-stack rule: JD stack words must appear verbatim in a bullet where honestly used; missing-but-required tools surface as `[ADD: ...]`, not silence.

### 5.3 New prompts
- `buildJobDecompositionPrompt` — JD → `JobDecomposition` JSON (schema above).
- `buildPositioningPrompt` — committee report + JD + source resume → `PositioningPlan` JSON.
- `buildReportPrompt` (or deterministic assembly) — committee report markdown.
- `buildExecutiveReviewPrompt` — JD decomposition + base resume + full transcript + ballot/consensus + blueprint → `ExecutiveReview` JSON. Persona is resolved by `executiveForRole(roleSlug, domain, company)` (§3.6); the prompt embeds the company name, its `businessContext`, and the JD's stated business problems, and instructs the exec to judge **debate relevance, role alignment, growth alignment** and give an **opinion** (favorable/neutral/unfavorable) with reasons. The prompt is explicit that this is advisory — the exec does not override the committee and cannot change `finalVerdict`.

---

## 6. Implementation phases

### Phase 1 — Debate depth & weighting (core)
1. **Schema** (§4): `SmeAnalysis`, `JobDecomposition`, `JobState`, `Blueprint` additions. Update `smeAnalysisSchema`/`smeOpeningResponseSchema` in `validation.ts`. Rebuild shared.
2. **Job decomposition** — new `apps/api/src/committee/jobDecomposition.ts` (+ prompt in `prompts.ts`, + tests). Run it in `runner.ts` right after jdMeta extraction; store on job; include in every agent prompt.
3. **Prompt rewrite** — `buildAgentSystemPrompt` (§5.1): mandates, senior-practitioner persona, business/authenticity laws, role-conditional factors.
4. **Weighting model** — new `apps/api/src/committee/weighting.ts` (or in shared): `computeWeights(roleSlug, seniority, domain)`. Wire into `buildCommittee`/`aggregateVotes`; store computed weights on `AgentConfig` at job-creation time (so ballots/UI reflect them).
5. **Reasons on ballot** — extend structured ballot output to carry `hireReasons`/`rejectReasons`; enforce in `agentExecutor.ts`; surface in UI verdict card.
6. **Executive opinion** — new `apps/api/src/committee/executiveReview.ts` (+ `executiveForRole` persona resolver + `buildExecutiveReviewPrompt` + tests). Wire into `runner.ts` between blueprint extraction and `setStatus("completed")`; publish a new SSE event `executive`. Failure is isolated (report shows "could not be completed"). Purely advisory — `finalVerdict` is untouched.
7. **Tests** — `debateEngine.test.ts`, `agentExecutor.test.ts`, `blueprintExtractor.test.ts`, new `jobDecomposition.test.ts`, `weighting.test.ts`, `executiveReview.test.ts`.

### Phase 2 — Committee report Markdown
1. `apps/api/src/committee/committeeReport.ts` — assemble §3.4 markdown from decomposition + transcript + analyses + ballot + blueprint + executive opinion + weighting.
2. Persist `committeeReportMd` on the job in `runner.ts` (after executive opinion, before `done`).
3. `GET /api/jobs/:id/report` in `routes/jobs.ts`.
4. Web: render the report (tab in `DebateView.tsx`); "Download report.md" button; show the **Executive Opinion** card (persona + company, alignment scores, conditions) framed as advisory.
5. **Candidate Response** — SQLite table `candidate_responses` in `apps/api/src/db/store.ts` + `saveCandidateResponse`/`getCandidateResponse`; routes `GET/PUT /api/jobs/:id/candidate-response` (upsert; requires run `completed`); "Your Response" panel in `DebateView.tsx` (categorized options §3.7 + textarea + save/update + "saved" confirmation; revision allowed anytime).
6. Tests + smoke.

### Phase 3 — Resume strategic layer
1. `apps/api/src/resume/strategy.ts` + `buildPositioningPrompt` — produce `PositioningPlan` (mapping, credibility fixes, lead/de-emphasize, sections, protect list, narrative).
2. `apps/api/src/resume/engine.ts` — consume `committeeReportMd` (full) + `positioningPlan`; generate primary + optional variant; build `resumeRecommendation` with explicit trade-offs.
3. `jobs.ts` resume routes + `generateChain.ts` — persist versions + recommendation; SSE `resume` event carries them.
4. `ResumeGenerator.tsx` / `RewrittenResume` — version picker + recommendation banner + trade-off summary; download for each version.
5. Update role prompts (§5.2). Tests for strategy + engine.

### Phase 4 — UX polish
- Debate page: show decomposed job brief (must-haves, business problems, screening filters) at the top.
- Verdict card: weighted tally + per-expert hire/reject reasons.
- Authenticity + credibility callouts styled as warnings (not buried in prose).

### Phase 5 — Evaluation & gates
- Add a "Garner-style" fixture test: an Applied Scientist III JD + a mid-level analyst resume; assert the report contains the three Garner problems, an authenticity flag, and a credibility finding (dates/brand).
- Full gate: shared build → api/web typecheck → api/shared/web tests → build → e2e → smoke:routes → em-dash grep on UI strings.

---

## 7. Honesty & guardrails (non-negotiable)
- Nothing invented: `PositioningPlan` maps evidence the source actually contains; everything else is `[ADD: ...]` or a surfaced warning.
- Credibility fixes only add what the candidate can confirm (graduation years, date splits) — the tool **asks for** the facts and marks placeholders, it never fabricates.
- Authenticity flags are advisory, phrased as "reads like" + why, never as accusations.
- `atsScoreNote` framing (keyword overlap ≠ prediction) stays.

---

## 8. Open questions to confirm
1. **Variant count:** always two versions (A aggressive / B readable) or one primary + optional on-demand variant? Default: primary + one optional variant.
2. **Authenticity data:** any source of truth for dates/claims (e.g., resume JSON fields, LinkedIn import) to power the credibility audit deterministically before the LLM weighs in?
3. **Report scope:** should the committee report also feed cold email / cover letter / interview mock (it currently only feeds resume)? Recommendation: yes for cover letter, no for interview mock.
4. **Where the report lives:** a new tab on the run page vs. a standalone route (`/jobs/:id/report`). Recommendation: both (tab + download link).
5. **Executive opinion vs. committee verdict:** **RESOLVED** — the executive view is an advisory opinion and never drives `finalVerdict`; it is shown to the candidate as the moderator's perspective, and the candidate gets the right of reply (§3.7).
6. **Candidate response options:** the sentiment list in §3.7 is a starting set — confirm the exact labels/wording the candidate should see (can add/remove in one place, `CANDIDATE_RESPONSE_OPTIONS`).
7. **Moderator persona name:** a stable persona name per function (e.g., `CTO at <Company>`) vs. a real-looking name — recommendation: title + company only, no invented human name.
