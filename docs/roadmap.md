# Rattle-Snake V2 — Roadmap & Future Optimizations

> **Last updated:** 2026-08-31 - v2.1.0 shipped; next up: auto-fill extension + job-board aggregation. Companion: `docs/strategy.md`.

---

## P1 — Required to call the app "complete"

| # | Item | Status | Notes |
|---|---|---|---|
| 1 | **Test against a real LLM** | Planned (Sprint 2) | Everything so far verified with the mock provider. Point `LLM_BASE_URL`/`LLM_MODEL` at Ollama/vLLM, run CLI + full UI flow. Check: format adherence, redress retries firing, blueprint JSON parse rate, rewriter quality. |
| 2 | **Automated tests (vitest)** | Planned (Sprint 1.1) | `nonNeutrality.ts`, `debateEngine.ts` (incl. 0.5 tiebreak), `blueprintExtractor.ts` fallback, `routes/jobs.ts`, `detectDomain`. |
| 3 | **README.md** | Planned (Sprint 1.4) | Install, config, run, API surface, ASCII architecture. |
| 4 | **Dockerize** | Planned (Sprint 1.5) | Dockerfiles (api + web) + docker-compose (api, web, optional ollama). |
| 5 | **git init + initial commit** | Planned (Sprint 1.7) | `.gitignore` already written. |

## P2 — Production hardening

| # | Item | Priority notes |
|---|---|---|
| 6 | **Web `start` verification** | `node ./dist/server/entry.mjs` — build + preview smoke test. |
| 7 | **Basic auth (web + API)** | Self-hosted exposure. Bearer-token Hono middleware + Astro middleware; `AUTH_TOKEN` env. |
| 8 | **Resume/JD file upload** | Parse `.pdf`/`.docx` → text in `NewJobForm` (pdf-parse + mammoth). |
| 9 | **Export rewritten resume** | Done. - client-side PDF/DOCX/TXT/MD (`apps/web/src/lib/export/`); Export Center per-run lands in v2.1.0 |
| 10 | **Frontend e2e (Playwright)** | create → stream → verdict flow. |
| 11 | **Token-level streaming** | Currently whole-turn completion → SSE chunked agent turns for a "live" feel. |
| 12 | **Per-agent telemetry** | Latency, retries, token usage per agent/turn. |
| 13 | **Rate-limit / queue debates** | Done. - queue + worker with memory/Redis drivers, at-least-once Redis ack + crash recovery; rate-limit middleware (0 in dev, 60/min in prod); Redis-backed limiter for multi-node lands with v2.1.0 auth |
| 14 | **Prompt-injection guardrails** | JD/resume text can contain adversarial instructions; isolate candidate content and instruct the model to ignore directives inside it. |

## P3 — Nice-to-have / spec extensions

| # | Item | Notes |
|---|---|---|
| 15 | More domain committees | Design/Product, Cybersecurity, Cloud/DevOps — one new file per domain in `packages/shared/src/agents/`. |
| 16 | Structured JSON output mode | OpenAI `response_format` / OAI-compatible equivalents to replace text parsing where supported. |
| 17 | Multi-user separation | `@hono/oauth-provider` or user accounts; per-user job scoping. |
| 18 | Historical evaluation | Same candidate vs. multiple JDs; diff rewritten resumes across runs. |

---

## Architecture & performance notes for deeper builds

### Streaming the debate live (SSE chunked)
- Current: one `complete()` per turn → publish one `entry` event. 
- Future: use streaming completions (`.stream()` on the OpenAI SDK). Emit `delta` events per token/chunk; the frontend appends to the active agent card. Keep the *final* parsed entry on the `entry` event for persistence. Job event union already isolates per-job channels (`events/bus.ts`).

### Scale-out path
1. Swap in-process bus → **Redis pub/sub** (channel `job:{id}`) — frontend API is unchanged.
2. Move `runCommittee` into a **BullMQ worker** (separate process); API enqueues, worker publishes events.
3. SQLite → **Postgres** (schema already JSON-transcript based; migration is mechanical) with `pg` + a `JobStore` interface swap.

### Consensus & fairness tuning
- Weights live in agent data (`AgentConfig.weight`) — tune per seat without code changes.
- Consider adding a **confidence score** per agent turn (parsed from the response) as a future weighting input.

### Evaluation harness
- Build a corpus of JDs × resumes with known-good verdicts to measure: domain detection accuracy, verdict stability across seeds, blueprint parse rate, and rewriter fact-fidelity (no fabrication).
- Add an `LLM_TEMPERATURE=0` "golden" regression suite using the mock provider for CI.

### Cost / latency budget (local models)
- 5 openings + (2×5) cross-talk + 5 ballot = **20 turns** + blueprint + rewrite per job.
- With Ollama `llama3.1`, budget ~2–4 min/job on CPU; GPU or a smaller quantized model cuts this materially. Consider `LLM_TEMPERATURE` per phase (ballot already uses 0.2).
- Token usage telemetry (P2#12) should drive a per-job cost figure.

---

## v2.1.0 - Content engine, A/B resumes, SaaS foundations (SHIPPED 2026-08-31)

All five phases shipped (c57b9c6, 2cb2374, cf2e08d, 6828fdb, f24c5ed) with the full gate green at each merge:

| Phase | Scope |
|---|---|
| P1 | Cold-email content engine: first-person voice gate, user-selected angle/tone/audience/length, committee-insight-driven narrative, JSON `cold_email.v2` contract |
| P2 | Resume A/B: v1 -> 3-reviewer evaluation against the same JD -> v2 addressing the findings -> deterministic comparison -> user picks the winner; `resume_versions` table + crash-safe phase cursor |
| P3 + P3b | UI: single run workspace with stage tracker, Compare tab, Export Center (PDF/DOCX/TXT/MD incl. the full expert discussion), professional polish (naming, copy rules, no AI-style artwork, rendering resilience, API-down states) |
| P4 | Auth: users / orgs / memberships / sessions (scrypt, hashed session ids, HttpOnly cookies, CSRF), owner/admin/member roles, login page behind a feature flag for one release |
| P5 | JSON envelope `rattle-snake.envelope.v1` + input/output adapter registry (plug-and-play integrations; webhook payloads move to the envelope) |
| Future | Job application auto-fill (browser extension), job-board aggregation with committee-lite match scoring, all-in-one application tracker |