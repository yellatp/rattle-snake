# Rattle-Snake V2 — Sprint Tracker (Agile)

> **Purpose:** chronological record of every sprint — when it started, when it completed, what was implemented, and what is still outstanding. Companion to `docs/strategy.md` (plan) and `docs/feature-tracker.md` (requirement-level status).
> **Cadence:** continuous goal-based sprints (one active at a time, ~hourly/daily), per `docs/strategy.md` §1.
> **Last updated:** 2026-08-12 18:30

---

## Sprint 0 — Foundations (Docs & Governance)

| Field | Value |
|---|---|
| **Started** | 2026-08-12 (early session) |
| **Completed** | 2026-08-12 |
| **Goal** | Turn the stated requirements into a verifiable PRD, a strategy, and a feature tracking system before touching code. |
| **Done when** | `docs/PRD.md`, `docs/strategy.md`, `docs/feature-tracker.md` exist and every requirement has an ID + tracking row. |

### Implemented
- `docs/PRD.md` — requirements as FR-1…FR-5 + NFR-1…NFR-8, Domain Committee Matrix, non-neutrality framework, prompt contracts, API surface.
- `docs/strategy.md` — continuous sprint methodology, sprint-by-sprint plan (Sprints 0–5+), definition of done.
- `docs/feature-tracker.md` — requirement → status → code reference → verification evidence for every PRD ID.

### Not implemented (deferred to later sprints)
- Everything under the feature-tracker ⏳ rows; this sprint was documentation-only by design.

---

## Sprint 1 — Core Completion (tests · docs · docker · git)

| Field | Value |
|---|---|
| **Started** | 2026-08-12 |
| **Completed** | 2026-08-12 (commit `d6f9f99`) |
| **Goal** | Bring the app to "complete" by PRD standards: automated tests, full docs, README, Dockerization, verified prod start, and version control. |
| **Done when** | `pnpm test` green (44 tests), build 3/3, typecheck 4/4, web prod start verified, Docker compose validated, `git init` + initial commit. |

### Implemented
- **vitest suite (44 tests)** — 13 shared + 31 api:
  - `packages/shared/src/agents/index.test.ts` — `detectDomain` + committee shape.
  - `apps/api/src/committee/nonNeutrality.test.ts` (10) — verdict parsing incl. case-insensitive markers + neutral-language rejection.
  - `apps/api/src/committee/debateEngine.test.ts` (6) — weighted consensus math incl. 0.5 tiebreak.
  - `apps/api/src/committee/agentExecutor.test.ts` (4) — redress re-prompt loop + prior-vote fallback.
  - `apps/api/src/committee/blueprintExtractor.test.ts` (4) — rule-based fallback path.
  - `apps/api/src/routes/jobs.test.ts` (7) — HTTP API E2E via `app.request()` with temp SQLite DB.
- **Test infra:** vitest devDeps in `@rattlesnake/api` + `@rattlesnake/shared`; `"test": "vitest run"` scripts + root `"test": "turbo run test"`; test files excluded from tsc build.
- **Bug fixed (found by tests):** `parseDecision` returned lowercase `"hire"` for case-insensitive markers — fixed `apps/api/src/committee/nonNeutrality.ts:33` (`match[1]!.toUpperCase()`) + regression test.
- **React 19 fix:** `FormEvent` deprecated → `SyntheticEvent<HTMLFormElement>` in `apps/web/src/components/NewJobForm.tsx`; web typecheck 0/0/0.
- **Docs:** `docs/architecture.md` (full spec), `docs/roadmap.md` (future optimizations), `README.md`.
- **Docker:** root `Dockerfile` (multi-stage, `ARG TARGET=api|web`), `docker-compose.yml` (api + web + optional `ollama` under `profiles:["llm"]`), `entrypoint.sh`, `.dockerignore`. `docker compose config` validates.
- **Prod start verified:** `node apps/api/dist/index.js` → `/health` `{ok:true,provider:mock}`; `node apps/web/dist/server/entry.mjs` → HTTP 200 renders.
- **Git:** repo initialized, commit `30342c4` (initial) + `d6f9f99` (handover update).
- `handover.md` updated to reflect the above.

### Not implemented / deferred
- Real-LLM validation — moved to Sprint 2 (this is the last P1 item).
- Docker **image build** — compose validated but daemon was offline; carry-forward to Sprint 2.
- P2/P3 items (auth, upload, export, e2e, streaming, rate limiting, extra domains) — per `docs/strategy.md` Sprints 3+.

---

## Sprint 2 — Multi-Provider LLM + Real-LLM Validation (IN PROGRESS)

| Field | Value |
|---|---|
| **Started** | 2026-08-12 18:30 |
| **Completed** | _(pending)_ |
| **Goal** | (A) Build a multi-provider LLM layer so OpenAI, Anthropic, Google, DeepSeek, Kimi, Grok, GroQ, Qwen, OpenRouter, Ollama — and any other OpenAI-compatible endpoint — all work; (B) validate the full pipeline against a **real** LLM (format adherence, redress retries, blueprint parse rate, rewrite quality); (C) verify the Docker image build. |
| **Done when** | Part A shipped with tests (done); ≥1 full debate runs against a real provider with zero neutral-verdict escapes and a parsable blueprint; CLI + HTTP + web flow exercised; Docker build verified; tracker/sprint logs updated. |
| **LLM endpoint** | _(pending — user chose "I'll provide an API endpoint/key" but details not yet supplied)_ |

### Implemented (Part A — provider layer, FR-6)
- **PRD updated** — new §4.6 FR-6 "Multi-Provider LLM Support" (FR-6.1…FR-6.7); G8/NFR-1/personas/release-plan aligned; appendix renumbered 4.6→4.7.
- **Provider abstraction** — `LLMClient` interface `apps/api/src/llm/types.ts` (`complete(system, user, opts)`); all orchestration untouched (still calls only `llm.complete`).
- **Registry** — `apps/api/src/llm/presets.ts`: `custom` + `openai`, `anthropic`, `google`, `deepseek`, `kimi`, `grok`, `groq`, `qwen`, `openrouter`, `ollama`, `vllm`, `lmstudio`, `localai`, `mock` (base URL, default model, key env vars, wire format, requiresKey).
- **Adapters**:
  - `apps/api/src/llm/openaiCompatible.ts` — raw `fetch` `/chat/completions` (OpenAI, DeepSeek, Kimi, Grok, GroQ, Qwen, OpenRouter, Ollama, vLLM, LM Studio, custom).
  - `apps/api/src/llm/anthropic.ts` — Messages API (`x-api-key`, `anthropic-version`, top-level `system`, required `max_tokens`).
  - `apps/api/src/llm/google.ts` — Gemini `generateContent` (`systemInstruction`, `?key=`).
  - `apps/api/src/llm/mock.ts` — offline mock moved out of the old client.
  - `apps/api/src/llm/util.ts` — `withApiPath` (no double `/v1`) + `describeHttpError`.
- **Dispatcher** — `apps/api/src/llm/client.ts`: known names → native adapter; unknown name → generic OpenAI-compatible. `resolveEndpointConfig` resolves `LLM_API_KEY` → provider key env → fail-fast; `LLM_BASE_URL`/`LLM_MODEL` override presets.
- **Config** — `apps/api/src/config.ts` accepts any `LLM_PROVIDER`; `LLM_BASE_URL`/`LLM_API_KEY`/`LLM_MODEL` optional (preset defaults apply). `index.ts` logs the resolved provider/model from the client.
- **Dependency** — removed the `openai` SDK (raw fetch now); `pnpm install` pruned −46 packages.
- **Tests** — `apps/api/src/llm/providers.test.ts` (20 tests): URL/headers/body shape for all three wire formats, response parsing, non-2xx errors, preset completeness, dispatch, key-env fallback, fail-fast errors, base-URL override. Full suite now **64 tests** (13 shared + 51 api), build 3/3, typecheck 4/4.
- **Smoke test** — API boots with `LLM_PROVIDER=mock`, `/health` reports `{provider:"mock", model:"mock-response-1"}`.
- **Docs synced** — `.env.example`, README (provider list + model section + env table + test count), `docs/architecture.md` §11 provider table + diagram + layout, `docs/feature-tracker.md` FR-6 section + NFR status refresh, `docs/strategy.md` Sprint 2 rescope.

### Yet to implement / next actions (Part B + C)
- **Await user-provided** `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL`.
- Run CLI + HTTP + web UI flow against the real provider; measure format adherence, redress retry count, blueprint parse rate, rewrite quality.
- Start Docker Desktop, `docker compose up --build`, verify api + web containers.
- Fix anything surfaced; commit; close sprint.

---

## Completed-sprint rollup

| Sprint | Started | Completed | Core outcome |
|---|---|---|---|
| Sprint 0 — Foundations | 2026-08-12 | 2026-08-12 | PRD + strategy + feature tracker + architecture + roadmap written |
| Sprint 1 — Core Completion | 2026-08-12 | 2026-08-12 | 44 tests green, bug fixes, README, Docker files, prod-start verified, git initialized |
| Sprint 2 — Multi-Provider LLM + Real-LLM Validation | 2026-08-12 18:30 | — | IN PROGRESS — Part A (FR-6 provider layer) implemented + 20 new tests (suite now 64); Part B awaits user LLM endpoint; Part C awaits Docker |
