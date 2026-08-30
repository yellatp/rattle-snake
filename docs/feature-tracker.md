# Rattle-Snake V2 — Feature Tracker

> **Purpose:** a single source of truth mapping **every PRD requirement** → implementation **status** → **code references** so completion can be verified by inspection, not just asserted.
> **Last updated:** 2026-08-29 (v2.0 systems upgrade + security hardening + performance pass; WS-14/15/16 below) - IDs below match `docs/PRD.md`. Status legend:
> - ✅ **Implemented** — code exists, builds, and was exercised (reference(s) below).
> - 🟡 **Implemented, needs verification** — code exists but not yet validated against a real LLM / not yet tested.
> - ⏳ **Planned** — scheduled in a sprint (see `docs/strategy.md`).
> - ❌ **Not implemented** — explicitly deferred / not in scope for v2.
> - 🗑️ **Removed** — built earlier, then removed/replaced by a later restructure.

---

## Legend: how to read a reference

`apps/api/src/committee/runner.ts:24` = file `runner.ts`, function starting at line 24. Trace the referenced symbols to verify the implementation yourself.

---

## 1. Domain-Specific Committee Configurations (FR-1)

| ID | Requirement | Status | Implementation reference | Verified by |
|---|---|---|---|---|
| FR-1.1 | 5-persona named committees for SWE / Data & AI / Finance | ✅ | `packages/shared/src/agents/swe.ts:8`, `dataAi.ts:7`, `finance.ts:7`; registry `packages/shared/src/agents/index.ts:7` (`DOMAIN_COMMITTEES`) | `pnpm run build`; CLI/HTTP runs produced 5 opening + 10 cross-talk + 5 ballot entries |
| FR-1.2 | SWE/SDE committee personas (Priya, Alex, Marcus, Elena, Liam) | ✅ | `packages/shared/src/agents/swe.ts:9-54` | Matrix match vs PRD §4.6.1 |
| FR-1.3 | Data & AI committee personas (Sarah, Dr. Aris, Vikram, Karen, Maya) | ✅ | `packages/shared/src/agents/dataAi.ts:8-53` | Matrix match vs PRD §4.6.1 |
| FR-1.4 | Finance committee personas (David, Elena, Michael, Chen, Sophia) | ✅ | `packages/shared/src/agents/finance.ts:8-53` | Matrix match vs PRD §4.6.1 |
| FR-1.5 | Committees are pure data + prompt functions (extensible) | ✅ | Agent = data: `packages/shared/src/types.ts:26-43` (`AgentConfig`); prompt builder `packages/shared/src/prompts.ts:34`; stateless executor `apps/api/src/committee/agentExecutor.ts:50` | New domain = one file in `packages/shared/src/agents/`; no orchestrator change |
| FR-1.6 | Domain auto-detection from JD, user-overridable | ✅ | `detectDomain()` `packages/shared/src/agents/index.ts:83`; UI pre-select + override `apps/web/src/components/NewJobForm.tsx:50-55`, `:62-67` | Unit-verify in Sprint 1 (test added) |
| FR-1.7 | Sector Specialist overridable per job (`sectorFocus`) | ✅ | `getCommitteeForDomain()` `packages/shared/src/agents/index.ts:103-119`; accepted in API `apps/api/src/routes/jobs.ts:38`; UI input `apps/web/src/components/NewJobForm.tsx:114-126` | POST with `sectorFocus` rewrites specialist role/focus |

## 2. Sector Specialist Agent — Transferable Skills (FR-2)

| ID | Requirement | Status | Implementation reference | Verified by |
|---|---|---|---|---|
| FR-2.1 | Sector Specialist acts as industry-fit auditor | ✅ | Sector-only prompt block `packages/shared/src/prompts.ts:39-41` ("SECTOR & TRANSFERABILITY MANDATE"); seat marked `isSectorSpecialist` `packages/shared/src/types.ts:38` | Mock run entries include `[SECTOR & TRANSFERABILITY]` section |
| FR-2.2 | Domain-matched scenario → deep domain alignment checks | ✅ | Mandate requires "Industry fit: does the candidate's experience map to the target sector's protocols, compliance, and stack?" `packages/shared/src/prompts.ts:40` | Prompt contract verified in architecture doc |
| FR-2.3 | Cross-sector scenario → transferable skills + ramp-up gaps | ✅ | Mandate requires "identify 1-2 prior-sector skills that translate… AND 1-2 gaps that would require ramp-up", incl. worked example `packages/shared/src/prompts.ts:40` | Prompt contract verified |
| FR-2.4 | Sector notes flow to blueprint and drive rewrite | ✅ | Sector bullets captured into `sectorNotes` `apps/api/src/committee/blueprintExtractor.ts:77`; surfaced in UI `apps/web/src/components/DebateView.tsx:500`; rewriter reframes transferable skills `packages/shared/src/prompts.ts` | E2E job `msqoq644vxbtve81` blueprint contained sectorNotes |

## 3. Decisive Non-Neutrality Framework (FR-3)

| ID | Requirement | Status | Implementation reference | Verified by |
|---|---|---|---|---|
| FR-3.1 | Two-pass pattern: steel-man both sides → forced pivot → verdict | ✅ | Prompt laws + OUTPUT FORMAT `packages/shared/src/prompts.ts:67-89` (Phase A top-2 hire + top-2 reject; PIVOT POINT; `[VERDICT] [STRONG HIRE/REJECT]`) | Every mock turn contains all 5 sections |
| FR-3.2 | Neutral verdicts forbidden | ✅ | Law 1 `packages/shared/src/prompts.ts:68`; banned-token scan `hasNeutralLanguage()` `apps/api/src/committee/nonNeutrality.ts:75` | Unit test in Sprint 1 |
| FR-3.3 | Enforced in code (parse), not just prompt | ✅ | `parseDecision()` marker/pattern/keyword strategy `apps/api/src/committee/nonNeutrality.ts:28-72`; wired into executor `apps/api/src/committee/agentExecutor.ts:67` | Unit test in Sprint 1 |
| FR-3.4 | Redress re-prompt loop + fallback | ✅ | Retry loop `apps/api/src/committee/agentExecutor.ts:70-85`; `REDRESS_PROMPT` `:25-36`; fallback inherits prior vote or `REJECT` `:82-84`; retries config `apps/api/src/config.ts:30` | `AGENT_MAX_RETRIES` respected; mock always compliant |
| FR-3.5 | Debate engagement — agents address each other by name | ✅ | Law 4 `packages/shared/src/prompts.ts:73`; cross-talk phase block `:47`; `[DEBATE RESPONSE]` output section `:82` | Transcript shows named cross-talk |

## 4. End-to-End Orchestration (FR-4)

| ID | Requirement | Status | Implementation reference | Verified by |
|---|---|---|---|---|
| FR-4.1 | Committee auto-selection from JD + domain | ✅ | Domain resolution `apps/api/src/routes/jobs.ts:29`; committee load `apps/api/src/committee/runner.ts:33` | POST /api/jobs resolves domain then loads template |
| FR-4.2 | Round 1 — opening arguments + sector fit, forced verdicts | ✅ | `runDebate()` openings loop `apps/api/src/committee/debateEngine.ts:41-50`; phase prompt `packages/shared/src/prompts.ts:45` | E2E: 5 opening entries, each with decision |
| FR-4.3 | Round 2 — committee cross-talk loop | ✅ | Cross-talk passes `apps/api/src/committee/debateEngine.ts:53-66` (order alternated per pass); count from `DEBATE_CROSS_TALK_ROUNDS` `apps/api/src/config.ts:29` | E2E: 10 cross-talk entries (2 passes × 5) |
| FR-4.4 | Round 3 — final ballot + weighted consensus + blueprint | ✅ | Ballot loop `apps/api/src/committee/debateEngine.ts:69-83`; consensus `aggregateVotes()` `:95-124`; blueprint extraction `apps/api/src/committee/runner.ts:69` | E2E job reached `completed`, `SHORTLISTED`, blueprint published |
| FR-4.5 | Objection-clearing resume generation (**explicit on-demand handoff**, never automatic) | ✅ | `POST /api/jobs/:id/resume/generate` `apps/api/src/routes/jobs.ts` → `generateSophisticatedResume()` `apps/api/src/resume/engine.ts` — V1 32-role prompts/templates (`roleRegistry.ts`), ATS scorer (`ats.ts`), moderation loop (`moderator.ts`, max 2 iterations), committee GAP report + 360 analyses injected into the system prompt; US/UK English variant from job location (`locale.ts`); `[ADD: ...]` placeholders for missing evidence; 400 unless `completed` with a blueprint | E2E: no auto-resume, `POST resume/generate` → 200 + persisted; unit tests `resume/engine.test.ts`, `resume/ats.test.ts`, `resume/roleRegistry.test.ts`, `resume/serialize.test.ts`, `resume/locale.test.ts` |
| FR-4.6 | Live streaming of every stage | ✅ | SSE route `apps/api/src/routes/jobs.ts:232`; event bus `apps/api/src/events/bus.ts`; runner publishes status/entry/jdMeta/analysis/verdict/blueprint/resume/done/error `apps/api/src/committee/runner.ts:34-96`; UI subscribes `apps/web/src/components/DebateView.tsx` | Streamed run observed; snapshot replay for late subscribers |
| FR-4.7 | Persistence + per-job isolation | ✅ | SQLite `JobStore` `apps/api/src/db/store.ts:35`; one row per job; WAL; restart recovery `apps/api/src/app.ts:15-22` | Restart recovery marked orphaned jobs `failed` |

## 5. Weighted Consensus (FR-5)

| ID | Requirement | Status | Implementation reference | Verified by |
|---|---|---|---|---|
| FR-5.1 | Weighted votes by seat | ✅ | Per-seat weights in agent data (`swe.ts:16` =0.8, `:24` =1.2, `:32` =1, `:40` =1.2, `:48` =1); formula `apps/api/src/committee/debateEngine.ts:95-113` | Consensus math unit test in Sprint 1 |
| FR-5.2 | >0.5 SHORTLISTED, <0.5 REJECTED, =0.5 highest-weight tiebreak | ✅ | `apps/api/src/committee/debateEngine.ts:115-121` | Unit test incl. 0.5 case in Sprint 1 |
| FR-5.3 | Ballot + tallies surfaced to UI and blueprint | ✅ | Verdict card + tallies + ballot `apps/web/src/components/DebateView.tsx:458` (`VerdictCard`, mounted at `:245`); verdicts in blueprint schema `packages/shared/src/types.ts` | E2E run displayed HIRE/REJECT tallies |

## 6. Multi-Provider LLM Support (FR-6)

| ID | Requirement | Status | Implementation reference | Verified by |
|---|---|---|---|---|
| FR-6.1 | Provider abstraction layer — one `LLMClient` interface, pipeline is provider-agnostic | ✅ | `LLMClient` interface `apps/api/src/llm/types.ts:9-15`; all consumers call only `llm.complete` (`runner.ts:27`, `debateEngine.ts:31`, `agentExecutor.ts:65`, `blueprintExtractor.ts:41`, `resume/engine.ts`) | Grep shows zero provider branches in orchestration; build + typecheck green |
| FR-6.2 | Native presets: OpenAI, Anthropic, Google, DeepSeek, Kimi, Grok, GroQ, Qwen, OpenRouter, Ollama | ✅ | Provider registry `apps/api/src/llm/presets.ts:26-153` (base URL, model, key env, wire format); dispatcher `apps/api/src/llm/client.ts:62-87` | `providers.test.ts` — preset presence + defaults for every must-have provider |
| FR-6.3 | Anthropic native support (Messages API) | ✅ | Adapter `apps/api/src/llm/anthropic.ts` (`x-api-key`, `anthropic-version`, top-level `system`, `max_tokens`); versioned URL `util.ts` `withApiPath` | `providers.test.ts` — URL, headers, body shape, parsing, errors |
| FR-6.4 | Google Gemini native support (`generateContent`) | ✅ | Adapter `apps/api/src/llm/google.ts` (`systemInstruction`, `generationConfig`, `?key=`); response parsed from `candidates[].content.parts` | `providers.test.ts` — URL, body, key param, part-joining, errors |
| FR-6.5 | Generic any-provider fallback (custom / unknown name = OpenAI-compatible) | ✅ | `createLLMClient` unknown-name branch `apps/api/src/llm/client.ts:65-69`; `CUSTOM_PRESET` `apps/api/src/llm/presets.ts:18-28` | `providers.test.ts` — `LLM_PROVIDER=acme` posts to `/chat/completions` |
| FR-6.6 | Smart credential & model resolution (override + standard key env vars + fail-fast) | ✅ | `resolveEndpointConfig` `apps/api/src/llm/client.ts:26-58` (key: `LLM_API_KEY` → `firstPresent(...keyEnv)`); fail-fast errors for missing key/baseUrl/model | `providers.test.ts` — OpenAI key env fallback, anthropic missing-key error, custom missing-baseUrl error, vllm missing-model error, base URL override |
| FR-6.7 | Offline mock preserved | ✅ | `createMockClient` `apps/api/src/llm/mock.ts:56`; `mock` preset `apps/api/src/llm/presets.ts:149-159`; dispatch branch `apps/api/src/llm/client.ts:71` | `pnpm test` 64/64 offline; `--mock` CLI + HTTP E2E still green |

## 7. Non-Functional Requirements (NFR)

| ID | Requirement | Status | Implementation reference | Verified by |
|---|---|---|---|---|
| NFR-1 | Multi-provider LLM agnosticism + offline mock | ✅ | Provider layer `apps/api/src/llm/` (see FR-6); `LLM_PROVIDER` select `apps/api/src/config.ts:22-29`; offline `createMockClient` `apps/api/src/llm/mock.ts` | CLI + HTTP E2E with mock; provider unit tests (20); real-LLM run planned Sprint 2 |
| NFR-2 | Async run + live streaming | ✅ | Fire-and-forget runner `apps/api/src/committee/runner.ts`; SSE `apps/api/src/routes/jobs.ts:232`; status flow `pending→debating→completed` | UI streams full run to `completed` |
| NFR-3 | Reliability / restart recovery | ✅ | Orphaned-job recovery `apps/api/src/app.ts:15-22`; WAL mode `apps/api/src/db/store.ts:40` | Verified on restart |
| NFR-4 | Health endpoint as a real liveness probe | Done. | `apps/api/src/routes/health.ts` - `{ ok, service, db, llm }`, 503 on DB probe failure, bypasses auth + rate limiting | `routes/jobs.test.ts` health test; manual probe with API key required OFF |
| NFR-5 | Security (auth + injection guardrails) | Done. | Security middleware chain `apps/api/src/middleware/security.ts` (CORS-first order, API-key auth with secure prod default, body limit, rate limit with eviction, security headers); tenant scoping in `db/store.ts` + all routers; webhook SSRF guard `webhooks/validate.ts`; HMAC-signed webhooks; AES-256-GCM secrets (LLM keys, webhook secrets); XSS sanitizer `apps/web/src/lib/sanitize.ts`; prompt-injection hardening in `packages/shared/src/prompts.ts` | `webhooks.test.ts` (7 incl. SSRF 400s), settings/jobs route tests, full gate `pnpm e2e` + `smoke:routes` |
| NFR-6 | Automated tests for core logic | ✅ | vitest suite (64 tests): provider adapters/dispatch `apps/api/src/llm/providers.test.ts`, `nonNeutrality.test.ts`, `debateEngine.test.ts`, `blueprintExtractor.test.ts`, `agentExecutor.test.ts`, `routes/jobs.test.ts`, shared `packages/shared/src/agents/index.test.ts` | `pnpm test` = 13 shared + 51 api, all green |
| NFR-7 | Portability / self-host (Docker) | ✅ | `Dockerfile` (TARGET api/web), `docker-compose.yml`, `entrypoint.sh`, `.dockerignore`; `@astrojs/node` standalone output `apps/web/astro.config.mjs` | `docker compose config` validates; **image build pending** (daemon was offline in Sprint 2) |
| NFR-8 | End-to-end type safety | ✅ | `noUncheckedIndexedAccess` (tsconfigs); Zod schemas `packages/shared/src/validation.ts`; shared types `packages/shared/src/types.ts`; `pnpm run typecheck` = 4/4 | `pnpm run build` + `typecheck` green |

## 8. Cross-cutting: what's verified vs pending

| Area | Verified (mock) | Pending real-LLM validation (Sprint 2) |
|---|---|---|
| Debate format adherence | 100% of mock turns carry `[STRONG HIRE/REJECT]` + all sections | Real-model format adherence + redress retries firing |
| Blueprint extraction | LLM path + rule-based fallback both produce schema-valid blueprints | LLM JSON parse rate ≥90% |
| Resume rewrite | Objection-clearing Markdown with `[ADD: ...]` placeholders | Rewriter quality on a real model |
| E2E | CLI + HTTP + SSE + web build all green | Full UI flow against a real provider |

## 9. Next-Round workstreams (WS-1 … WS-9, from `docs/plan-next-round.md`)

Statuses: ✅ implemented & tested (unit suite now **213 tests**: 25 shared + 178 api + 10 web) · 🟡 implemented, awaiting real-LLM validation.

| WS | Feature | Status | Implementation reference | Verified by |
|---|---|---|---|---|
| WS-1 | Resume rewrite quality: source pre-merge, placeholder bullets, divergence directive | ✅ | `apps/api/src/resume/merge.ts` (`mergeSourceIntoTemplate`), `engine.ts` (divergence block + pre-merged template in user prompt) | `resume/merge.test.ts` (7), `resume/engine.test.ts` (9), functional test markdown assertions |
| WS-2 | Em-dash/emoji hygiene: central sanitizer, strict typography in prompts, moderator typography audit, transcript sanitizing | ✅ | `apps/api/src/resume/sanitize.ts`; punctuation block + variant directive in `engine.ts`; moderator §7 typography check `resume/moderator.ts`; runner/agentExecutor sanitize transcript text | `resume/sanitize.test.ts` (10), `resume/moderator.test.ts` (4), engine `containsEmDash(markdown) === false` test, `pnpm e2e` transcript hygiene |
| WS-3 | Debate formatting: `**bold**` positives/negatives rendered in the UI | ✅ | Prompt OUTPUT FORMAT `packages/shared/src/prompts.ts`; `**…**` span renderer (`Line` component) in `apps/web/src/components/DebateView.tsx:434` | functional-test asserts `**` in transcript; visual render |
| WS-4 | Role-driven committees: 32 role→committee map, sector registry, role detection at creation, `?role=` deep-link | ✅ | `packages/shared/src/agents/roleCommittees.ts`, `sectors.ts`; `getCommitteeForDomain(domain, sectorFocus, roleSlug)` `agents/index.ts:117`; `roleSlug` on `POST /api/jobs` + `JobState`; role picker `NewJobForm.tsx` | `agents/roleCommittees.test.ts` (12), `resume/roleRegistry.test.ts` (11), jobs-route role tests |
| WS-5 | Advisory Mentorship Board: pre-debate stage, report fed to agents + engine, SSE + page | 🗑️ | **Removed in the WS-13 restructure.** The advisory stage, `AdvisoryReport` type, `advisoryExtractor.ts`, `buildAdvisoryPrompt`, the `/advisory` page and `AdvisoryView.tsx` were deleted. Its role is replaced by JD metadata extraction + the per-seat 360-degree analyses (WS-13) — see `packages/shared/src/types.ts` (`JdMeta`, `SmeAnalysis`), `apps/api/src/committee/jdMetaExtractor.ts`, `agentExecutor.ts` | `committee/advisoryExtractor.test.ts` deleted; engine advisory-in-prompt test removed |
| WS-6 | V1 parity: template library (32, categorized) · multi-profile (master + PIN) · downloads (PDF/DOCX/TXT, formats × presets × page) | ✅ | `apps/api/src/resume/roleRegistry.ts` (`listTemplateInfo`, `TEMPLATE_CATEGORIES`); `routes/settings.ts` (`/api/resume/templates`, `/api/profiles` CRUD + master + pin); `db/store.ts` (`profiles` table, scrypt PIN, `jobs.profile_id`); `resume/profile.ts`; `engine.ts` profile param; web `TemplateLibrary.tsx`, `ProfilesView.tsx`, `lib/export/*` + `ExportBar` in `DebateView.tsx` | `routes/settings.test.ts` (20, incl. 4 profiles tests), `resume/profile.test.ts` (5), engine profile-injection test, jobs-route profileId tests, `export.test.ts` (10), `pnpm smoke:routes` |
| WS-7 | Sidebar navigation (5 pages, legacy redirects) | ✅ | `apps/web/src/layouts/Layout.astro` (Dashboard · SME Panel · Resume Generation · Profile · Settings); pages `dashboard`/`sme-panel`/`resume`/`profile`/`settings`; legacy redirects: `/` → `/dashboard`, `/jobs` → `/dashboard`, `/debate` → `/sme-panel` | `pnpm smoke:routes` all 200/302 |
| WS-8 | Documentation of the current version | ✅ | `docs/how-it-works.md` (new), refreshed `README.md`, `docs/architecture.md`, `docs/feature-tracker.md`, `docs/sprint-tracker.md` | — |
| WS-9 | Recruiter-standard qualification audit: WHAT/HOW/WHY/WHERE grading, screening checklists, divergence upgrades, ATS honesty | ✅ | `apps/api/src/resume/screening.ts` (`SCREENING_CHECKLISTS`, `auditScreening`), `moderator.ts` §8 qualification + §9 screening audits, `engine.ts` checklist + divergence directives, `resumeMeta.screeningCoverage`, UI badge labelled "keyword overlap" | `resume/screening.test.ts` (8), `resume/ats.test.ts` (8), `resume/moderator.test.ts`, functional-test resume-meta assertions |
| WS-10 | Applications board homepage (periodic table of processed applications, per-profile grouping, filter chips, color-coded verdicts) | 🗑️ | **Removed in the WS-13 restructure.** `ApplicationsBoard.tsx`, the `index.astro` hero + board CSS were deleted; `/` now redirects to `/dashboard` and the Dashboard `JobList` is the run index | `pnpm smoke:routes` (`/` → 302 → `/dashboard` 200) |
| WS-11 | Cold-email killer intro per application (recruiter / founder / hiring manager, tone + target name, LLM-first + rule-based fallback, ASCII hygiene) | ✅ | `apps/api/src/outreach/coldEmail.ts`; `POST /api/jobs/:id/cold-email` `apps/api/src/routes/jobs.ts`; mock marker `apps/api/src/llm/mock.ts` (`cold outreach writer`); `apps/web/src/components/ColdEmailPanel.tsx` (mounted in `DebateView.tsx`), client `apps/web/src/lib/api.ts` | `outreach/coldEmail.test.ts` (4), jobs-route cold-email tests (3), `pnpm e2e`, `smoke:routes` |
| WS-12 | 5-expert interview mock per application (typical phases, per-seat expectations/drills/red flags, topics, prep tips) | ✅ | `InterviewPrepPlan` + `interviewPrepPlanSchema` `packages/shared/src/types.ts` / `validation.ts`; `apps/api/src/interview/mock.ts`; `POST /api/jobs/:id/interview-mock` `apps/api/src/routes/jobs.ts`; mock marker `apps/api/src/llm/mock.ts` (`interview coach`); `apps/web/src/components/InterviewMockPanel.tsx` (mounted in `DebateView.tsx`), client `apps/web/src/lib/api.ts` | `interview/mock.test.ts` (3), jobs-route interview-mock tests (2), `pnpm e2e`, `smoke:routes` |

## 10. WS-13 — JD metadata → SME 360 panel → explicit resume handoff

Statuses: ✅ implemented & tested (unit suite still **213 tests**: 25 shared + 178 api + 10 web).

| WS | Feature | Status | Implementation reference | Verified by |
|---|---|---|---|---|
| WS-13.1 | JD metadata extraction (company, role, sector, location, team) — LLM-first, rule-based fallback | ✅ | `apps/api/src/committee/jdMetaExtractor.ts`; `JdMeta` type + `jdMetaSchema` `packages/shared/src/types.ts` / `validation.ts`; mock marker `job-description metadata extractor` `apps/api/src/llm/mock.ts`; runner stage `apps/api/src/committee/runner.ts`; `jobLocation` backfill from `jdMeta.location` | `routes/jobs.test.ts` jdMeta assertions; HTTP E2E `jdMeta.company === "FinPay"`; SSE `jdMeta` event |
| WS-13.2 | Role+domain-driven committee selection from JD metadata | ✅ | `getCommitteeForDomain(domain, sectorFocus ?? jdMeta.sector, roleSlug)` `apps/api/src/committee/runner.ts` | jobs-route committee tests |
| WS-13.3 | 360-degree scored SME analyses per seat (structured JSON opening) | ✅ | `SmeAnalysis`/`SmeFactorScore` `packages/shared/src/types.ts`; `smeOpeningResponseSchema` `validation.ts`; parse in `apps/api/src/committee/agentExecutor.ts` (JSON authoritative, prose + redress fallback); `onAnalysis` `debateEngine.ts`; `job.analyses` + SSE `analysis` event | `committee/agentExecutor.test.ts` (7) incl. JSON-opening tests; jobs-route analyses assertions (5); HTTP E2E `analyses=5`; SSE `analysis` events |
| WS-13.4 | Live SME panel UI (jdMeta card, per-seat fit/decision/factors/strengths/concerns) | ✅ | `apps/web/src/components/DebateView.tsx` (`JdMetaCard`, `SmePanel`, `SeatCard`, `FactorRow`) | `astro check`, `astro build`, `pnpm smoke:routes` |
| WS-13.5 | Resume generation is an explicit on-demand handoff (no auto-rewrite) | ✅ | `POST /api/jobs/:id/resume/generate` (400 unless `completed` + blueprint) `apps/api/src/routes/jobs.ts`; runner no longer rewrites; `apps/web/src/components/ResumeGenerator.tsx` + `/resume?job=`; run-page "Proceed to Resume Generation" CTA | jobs-route tests (generate-on-demand, not-completed 400, roleSlug override, BYOK conflict 400, persistence); HTTP E2E asserts `rewrittenResume === undefined` before generate |
| WS-13.6 | Nav restructure: remove Home/Advisory/Debate, add SME Panel; legacy redirects | ✅ | `apps/web/src/layouts/Layout.astro`; pages `dashboard`/`sme-panel`/`resume`/`profile`/`settings`; redirects `/` → `/dashboard`, `/jobs` → `/dashboard`, `/debate` → `/sme-panel` | `pnpm smoke:routes` all 200/302 |

## 11. WS-14 - v2.0 systems upgrade (SaaS execution layer)

Statuses: Done. implemented & tested (unit suite now **269+ tests**: api 246 + web 23 + shared suite). Reference design: repo working documents (GLM audit + design plan); systems plan: `docs/plan-systems-upgrade.md` (implemented).

| ID | Feature | Status | Implementation reference | Verified by |
|---|---|---|---|---|
| WS-14.1 | Queue + worker execution (async runs leave the HTTP request path) | Done. | `apps/api/src/queue/` (memory + Redis drivers behind `Queue`), `worker/runner.ts` (N loops, guarded against queue outages, bounded stop), POST /api/jobs enqueues 202 | api suite green; e2e runs complete via worker |
| WS-14.2 | Redis queue at-least-once delivery + crash recovery | Done. | `queue/redis.ts` (BRPOPLPUSH processing list, LREM ack, retries, dead-letter list, boot-time `recover()`); `queue/factory.ts` | typecheck + tests; manual Redis smoke pending infra |
| WS-14.3 | Event bus abstraction (memory replay + Redis fan-out) | Done. | `apps/api/src/events/` (`EventBus`, memory 200-event replay ring, Redis pub/sub, factory); SSE subscribes before liveness check | e2e SSE assertions (entry/jdMeta/analysis/done) |
| WS-14.4 | Outbound webhooks with HMAC + retries + SSRF guard | Done. | `apps/api/src/webhooks/` (dispatcher, validate, types); `/api/webhooks` CRUD `routes/webhooks.ts`; bus hook in `app.ts` | `routes/webhooks.test.ts` (7) incl. SSRF 400s |
| WS-14.5 | Structured audit log | Done. | `apps/api/src/audit/` (pino logger, child context middleware, action registry incl. webhooks/auth-deny/rate-limit) | audit lines in route test output |
| WS-14.6 | Tenant isolation across all tables + routers | Done. | `tenant_id` on jobs/profiles/saved resumes/JDs/LLM connections/webhooks + migrations; tenant-scoped store methods; exports + storage scoped | settings/jobs/storage route tests |
| WS-14.7 | Security middleware chain (CORS-first, API keys, body limit, rate limit, headers) | Done. | `apps/api/src/middleware/security.ts`; `REQUIRE_API_KEY` secure prod default `config.ts`; `TRUST_PROXY`-aware IP resolution | api suite; CORS preflight verified against running dev stack |

## 12. WS-15 - Security hardening pass

| ID | Feature | Status | Implementation reference | Verified by |
|---|---|---|---|---|
| WS-15.1 | Stored XSS fix: sanitize all markdown rendered as HTML | Done. | `apps/web/src/lib/sanitize.ts` (DOMPurify) applied in `DebateView.tsx` + `StorageViewer.tsx` | `astro check`; DOMPurify dependency pinned |
| WS-15.2 | Webhook secrets encrypted at rest, never returned | Done. | `db/store.ts` create/update encrypt with master key; API exposes `hasSecret` only | `webhooks.test.ts` asserts secret absence |
| WS-15.3 | LLM provider timeouts + bounded retries | Done. | `llm/util.ts fetchLlm` (120s timeout, 3 attempts, backoff, Retry-After) wired into openaiCompatible/anthropic/google | `providers.test.ts` (incl. non-2xx) |
| WS-15.4 | Non-neutrality word-boundary matching (verdict integrity) | Done. | `committee/nonNeutrality.ts` count() word-boundary regex ("knowledge" no longer counts as "no") | `agentExecutor.test.ts` updated fixture |
| WS-15.5 | Concurrent-edit protection: runner no longer clobbers user edits | Done. | `committee/runner.ts` persist() re-merges user-owned fields; gap analysis re-reads amendment notes mid-run | jobs-route tests |
| WS-15.6 | CORS before auth + PATCH allowed (preflight fix) | Done. | `app.ts` middleware order | preflight 204 verified on running stack |
| WS-15.7 | Worker resilience + bounded graceful shutdown + store close | Done. | `worker/runner.ts`, `index.ts` shutdown sequence | code review + tests |

## 13. WS-16 - Performance, health, and product limits

| ID | Feature | Status | Implementation reference | Verified by |
|---|---|---|---|---|
| WS-16.1 | Lean dashboard/storage projection (no blob parsing) | Done. | `db/store.ts listRunSummaries()` (SQL-computed transcript length + artifact booleans); `routes/jobs.ts` + `routes/storage.ts` use it | jobs/storage route tests |
| WS-16.2 | Health probe with DB check + liveness bypass | Done. | `routes/health.ts` (503 on DB failure); probe paths skip auth + rate limit `middleware/security.ts` | jobs-route health test |
| WS-16.3 | Webhook dispatch tenant memoization | Done. | `app.ts` per-job tenant cache (capped) | code review |
| WS-16.4 | Candidate profile cap (7 per tenant) | Done. | `db/store.ts MAX_PROFILES_PER_TENANT`; settings route returns 400 with clear message | settings route tests |
| WS-16.5 | SQLite hardening: indexes, schema version, transactions | Done. | `db/store.ts` (idx_jobs_*, idx_profiles_master, idx_webhooks_tenant; `user_version = 3`; transactional multi-step ops) | api suite |
| WS-16.6 | CI pipeline enforcing the full gate | Done. | `.github/workflows/ci.yml` (shared build, tsc, vitest, astro check, e2e, smoke on ubuntu) | workflow file; first run pending remote push |