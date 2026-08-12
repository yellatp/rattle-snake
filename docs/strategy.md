# Rattle-Snake V2 — Implementation Strategy & Sprint Plan

> **Last updated:** 2026-08-12 · Companion docs: `docs/PRD.md` (requirements), `docs/feature-tracker.md` (status + code references), `docs/architecture.md` (spec).
> Sprint methodology: **continuous sprints** — a sprint closes as soon as its goal is met (hourly/daily cadence, not weekly). Each sprint has a single goal, a definition of done, and ends with an updated feature tracker.

---

## 1. Working agreement (how we run sprints)

- Sprints are **goal-based, not calendar-based**. A sprint is done when its Definition of Done is met.
- **One active sprint at a time.** Sprint backlog items are pulled from the roadmap in priority order (P1 → P2 → P3).
- Each sprint ends with: tests green, typecheck green, feature tracker updated, and (when the user asks) a commit.
- Every requirement carries an ID from the PRD (`FR-x.y`). The tracker links each ID → status → code reference so completion is verifiable, not just claimed.
- "Done" means **verified**: an item is only marked ✅ when there is a code reference + a passing check/run behind it.

## 2. Sprint roadmap overview

| Sprint | Goal (from PRD milestone) | Key deliverables | Status |
|---|---|---|---|
| **Sprint 0** | M0 — Docs & planning | `docs/PRD.md`, `docs/strategy.md`, `docs/feature-tracker.md`, `docs/architecture.md`, `docs/roadmap.md` | **DONE** |
| **Sprint 1** | M1 — Core complete (P1) | Automated tests, README, Dockerize, web-start verification, git init + initial commit | In progress |
| **Sprint 2** | M2a — Real-LLM validation (P1#1) | Full pipeline against Ollama/vLLM; fix format/redress/blueprint/rewriter issues found | Planned |
| **Sprint 3** | M2b — Production hardening (P2) | Basic auth, file upload (PDF/DOCX), export PDF/DOCX, rate limiting, prompt-injection guardrails | Planned |
| **Sprint 4** | M2c — Observability & streaming (P2) | Token-level streaming, per-agent telemetry, playwright e2e | Planned |
| **Sprint 5+** | M3 — Extensions (P3) | More domain committees, structured JSON output, multi-user separation, historical eval | Backlog |

---

## 3. Sprint 0 — Docs & planning (COMPLETE)

Created the governance layer the team works from:
- `docs/PRD.md` — product requirements (FR-1…FR-5, NFR-1…NFR-8, matrix, prompt contracts).
- `docs/strategy.md` — this file.
- `docs/feature-tracker.md` — every requirement → status → file:line references.
- `docs/architecture.md` — technical spec (components, data model, flows, TS design).
- `docs/roadmap.md` — prioritized future work, architecture & performance notes.

**DoD:** all five docs exist and PRD IDs match the tracker.

## 4. Sprint 1 — Core complete (P1) · IN PROGRESS

Goal: close every open "P1 — required to call the app complete" item from the handover.

| # | Task | PRD link | DoD |
|---|---|---|---|
| 1.1 | **vitest test suite** in `apps/api` + `packages/shared` | NFR-6 | `pnpm test` green. Coverage: `parseDecision`/`hasNeutralLanguage`, `aggregateVotes` (incl. 0.5 tiebreak), `runDebate` end-to-end w/ mock, `extractBlueprint` rule-based fallback, `createApp`/`jobs` routes via `app.request()`, `detectDomain`. |
| 1.2 | **`docs/architecture.md`** | G-*, NFR-* | Full spec: component diagram, data flow, debate rounds, non-neutrality enforcement, TS types. |
| 1.3 | **`docs/roadmap.md`** | P2/P3 | Future work + architecture/performance notes for deeper builds. |
| 1.4 | **`README.md`** | — | Install, config, run instructions, API surface, ASCII architecture, screenshots placeholder. |
| 1.5 | **Dockerize** | NFR-7 | `Dockerfile` for api + web, root `docker-compose.yml` (api, web, optional ollama), `.dockerignore`. |
| 1.6 | **Web start verification** | NFR-2 | `pnpm build` then `node ./dist/server/entry.mjs` serves the UI; smoke-test with API running. |
| 1.7 | **git init + initial commit** | — | Repo initialized, `.gitignore` honored, single clean initial commit. |

## 5. Sprint 2 — Real-LLM validation (P1#1) · PLANNED

Goal: prove the pipeline against a real OpenAI-compatible model, not just the mock.

| Task | How to verify |
|---|---|
| Point `LLM_BASE_URL`/`LLM_MODEL` at Ollama or vLLM | `pnpm dev:api` → `/health` shows provider/model. |
| Run CLI with real LLM | `pnpm debate -- --jd samples/fintech-jd.md --resume samples/candidate-resume.md --domain SWE --out out.md` |
| Full UI flow | Create a run, watch SSE stream to `completed`, verdict + blueprint + rewritten resume render. |
| Check response-format adherence | % turns with parsed `[STRONG HIRE/REJECT]`; watch redress retries fire. |
| Check blueprint JSON parse rate | Ratio of LLM-path successes vs rule-based fallback. |
| Check rewriter output quality | Objections resolved; no fabricated facts; `[ADD: ...]` placeholders where evidence is missing. |

**DoD:** full pipeline completes against a real LLM; any format gaps found are fixed and re-tested; tracker updated.

## 6. Sprint 3 — Production hardening (P2) · PLANNED

| Task | Notes |
|---|---|
| Basic auth (web + API) | Hono middleware (bearer token) + Astro middleware; `AUTH_TOKEN` env. |
| Resume/JD **file upload** | `.pdf`/`.docx` → text extraction (pdf-parse + mammoth) in `NewJobForm`. |
| **Export rewritten resume** | PDF/DOCX download button in `DebateView`. |
| Rate-limit / queue concurrent debates | In-process semaphore first; BullMQ+Redis later. |
| Prompt-injection guardrails | Sanitize/isolate JD + resume text; instruct LLM to ignore instructions inside job content. |

**DoD:** each hardening feature demonstrated in the UI/API; tests updated.

## 7. Sprint 4 — Observability & streaming (P2) · PLANNED

- **Token-level streaming** of agent turns (SSE chunked) so the debate appears live, not turn-by-turn.
- **Per-agent telemetry**: latency, retry counts, token usage per agent/turn.
- **Playwright e2e**: create → stream → verdict → blueprint → rewritten resume flow.

## 8. Sprint 5+ — Extensions (P3) · BACKLOG

- More domain committees (Design/Product, Cybersecurity, Cloud/DevOps) — add a file to `packages/shared/src/agents/`.
- Structured JSON output mode (`response_format`) where supported by the LLM backend.
- Multi-user job separation / auth providers.
- Historical evaluation: same candidate vs. multiple JDs; diff rewritten resumes.

---

## 9. Definition of Done (project-wide)

For any feature to be marked **implemented** in the tracker:
1. Code exists at the referenced path (and the path is stable/committed).
2. It typechecks and builds (`pnpm run typecheck` + `pnpm run build`).
3. It has a passing test where core logic is involved.
4. It has been exercised at least once (mock or real LLM) end-to-end.
5. The feature tracker's status/verification column reflects it.
