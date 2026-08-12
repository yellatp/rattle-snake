# Rattle-Snake V2 — Feature Tracker

> **Purpose:** a single source of truth mapping **every PRD requirement** → implementation **status** → **code references** so completion can be verified by inspection, not just asserted.
> **Last updated:** 2026-08-12 (Sprint 2) · IDs below match `docs/PRD.md`. Status legend:
> - ✅ **Implemented** — code exists, builds, and was exercised (reference(s) below).
> - 🟡 **Implemented, needs verification** — code exists but not yet validated against a real LLM / not yet tested.
> - ⏳ **Planned** — scheduled in a sprint (see `docs/strategy.md`).
> - ❌ **Not implemented** — explicitly deferred / not in scope for v2.

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
| FR-2.4 | Sector notes flow to blueprint and drive rewrite | ✅ | Sector bullets captured into `sectorNotes` `apps/api/src/committee/blueprintExtractor.ts:77`; surfaced in UI `apps/web/src/components/DebateView.tsx:253`; rewriter reframes transferable skills `packages/shared/src/prompts.ts:142` | E2E job `msqoq644vxbtve81` blueprint contained sectorNotes |

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
| FR-4.5 | Objection-clearing resume rewrite | ✅ | `rewriteResume()` `apps/api/src/committee/resumeRewriter.ts:12`; rewriter prompt `packages/shared/src/prompts.ts:124`; `[ADD: ...]` placeholders for missing evidence | E2E rewritten-resume Markdown produced; mock includes `[ADD: ...]` lines |
| FR-4.6 | Live streaming of every stage | ✅ | SSE route `apps/api/src/routes/jobs.ts:71-93`; event bus `apps/api/src/events/bus.ts:12`; runner publishes status/entry/verdict/blueprint/resume/done/error `apps/api/src/committee/runner.ts:35-88`; UI subscribes `apps/web/src/components/DebateView.tsx:68-118` | Streamed run observed; snapshot replay for late subscribers |
| FR-4.7 | Persistence + per-job isolation | ✅ | SQLite `JobStore` `apps/api/src/db/store.ts:35`; one row per job; WAL; restart recovery `apps/api/src/app.ts:15-22` | Restart recovery marked orphaned jobs `failed` |

## 5. Weighted Consensus (FR-5)

| ID | Requirement | Status | Implementation reference | Verified by |
|---|---|---|---|---|
| FR-5.1 | Weighted votes by seat | ✅ | Per-seat weights in agent data (`swe.ts:16` =0.8, `:24` =1.2, `:32` =1, `:40` =1.2, `:48` =1); formula `apps/api/src/committee/debateEngine.ts:95-113` | Consensus math unit test in Sprint 1 |
| FR-5.2 | >0.5 SHORTLISTED, <0.5 REJECTED, =0.5 highest-weight tiebreak | ✅ | `apps/api/src/committee/debateEngine.ts:115-121` | Unit test incl. 0.5 case in Sprint 1 |
| FR-5.3 | Ballot + tallies surfaced to UI and blueprint | ✅ | Verdict card + tallies + ballot `apps/web/src/components/DebateView.tsx:211-246`; verdicts in blueprint schema `packages/shared/src/types.ts:66` | E2E run displayed HIRE/REJECT tallies |

## 6. Multi-Provider LLM Support (FR-6)

| ID | Requirement | Status | Implementation reference | Verified by |
|---|---|---|---|---|
| FR-6.1 | Provider abstraction layer — one `LLMClient` interface, pipeline is provider-agnostic | ✅ | `LLMClient` interface `apps/api/src/llm/types.ts:9-15`; all consumers call only `llm.complete` (`runner.ts:27`, `debateEngine.ts:31`, `agentExecutor.ts:65`, `blueprintExtractor.ts:41`, `resumeRewriter.ts:23`) | Grep shows zero provider branches in orchestration; build + typecheck green |
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
| NFR-2 | Async run + live streaming | ✅ | Fire-and-forget runner `apps/api/src/routes/jobs.ts:47`; SSE `:71`; status flow `pending→debating→rewriting→completed` `apps/api/src/committee/runner.ts` | UI streams full run to `completed` |
| NFR-3 | Reliability / restart recovery | ✅ | Orphaned-job recovery `apps/api/src/app.ts:15-22`; WAL mode `apps/api/src/db/store.ts:40` | Verified on restart |
| NFR-4 | Health endpoint w/ provider/model/config | ✅ | `apps/api/src/routes/health.ts:5-15` | `GET /health` returns `{ok, service, llm, debate}` |
| NFR-5 | Security (auth + injection guardrails) | ⏳ | Planned — Sprint 3 (`docs/strategy.md` §6); prompt-injection hardening noted in `packages/shared/src/prompts.ts` (content isolation) | — |
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
