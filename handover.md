# Rattle-Snake V2 — Handover

> **Last updated:** 2026-08-12 (Sprint 2 — Part A: multi-provider LLM layer shipped; Part A2: offline-first run fixed + `pnpm e2e` functional suite passing) · Session handover for a fresh assistant session.
> Location: `C:\Users\prudh\Desktop\GitHub_Manager\Rattle-Snake-V2`
> This is a **brand-new project** (not the v1 `Rattle-Snake` repo). **Git repo initialized** (commit `30342c4`, branch default).
> Governance docs: `docs/PRD.md` (requirements), `docs/strategy.md` (agile sprint plan), `docs/feature-tracker.md` (requirement → status → code references), `docs/architecture.md`, `docs/roadmap.md`.

---

## 1. What this project is

A **self-hosted, production-oriented hiring committee** system (v2 of Rattle-Snake).
Three core design goals from the spec:

1. **Domain-specific committee templates** — 5 named personas per domain (SWE / Data & AI / Finance), loaded dynamically from the target domain.
2. **Sector/Domain Transferability Specialist** — the 5th agent audits industry fit + cross-sector transferable skills.
3. **"Non-Neutral" persona guardrail** — agents MUST end every turn with `[STRONG HIRE]` or `[STRONG REJECT]`; neutral verdicts are forbidden and enforced in code (not just prompt).

Full pipeline: **committee debate (opening → cross-talk → ballot) → weighted consensus → hiring blueprint → objection-clearing resume rewrite**, streamed live to the UI over **SSE**.

Architecture (per spec): **Astro frontend + Hono/Node backend + OpenAI-compatible LLM client + SQLite**, pnpm + Turborepo monorepo, TypeScript end to end.

---

## 2. Project structure

```
rattle-snake-v2/
├── package.json              # root: turbo scripts (dev/build/typecheck/test/debate)
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── .env.example              # copy to .env
├── Dockerfile                # single image; ARG TARGET=api|web + entrypoint.sh
├── docker-compose.yml        # api + web (+ optional ollama via --profile llm)
├── entrypoint.sh
├── samples/                  # sample JD + resume + rewritten-resume output
├── docs/                     # PRD, strategy, feature-tracker, architecture, roadmap — all written
├── packages/
│   └── shared/               # @rattlesnake/shared (pure data + types + prompts)
│       └── src/
│           ├── types.ts              # Domain, AgentConfig, JobState, TranscriptEntry, Blueprint, JobEvent
│           ├── validation.ts         # Zod schemas (createJobSchema, jobSchema, blueprintSchema)
│           ├── prompts.ts            # system-prompt builder (non-neutrality framework), blueprint + rewriter prompts
│           └── agents/
│               ├── swe.ts            # Priya, Alex, Marcus, Elena, Liam (FinTech sector spec)
│               ├── dataAi.ts         # Sarah, Dr. Aris, Vikram, Karen, Maya (HealthTech sector spec)
│               ├── finance.ts        # David, Elena, Michael, Chen, Sophia (Energy/Real Estate sector spec)
│               └── index.ts          # DOMAIN_COMMITTEES map, detectDomain(), getCommitteeForDomain()
└── apps/
    ├── api/                   # @rattlesnake/api — Hono backend (port 8787)
    │   ├── src/
    │   │   ├── index.ts               # entrypoint, serve, graceful shutdown
    │   │   ├── app.ts                 # createApp(): store + llm + cors + routes + restart-recovery
    │   │   ├── config.ts              # env loading (API_PORT, LLM_*, DEBATE_*, DATABASE_PATH, CORS_ORIGINS)
    │   │   ├── llm/                    # multi-provider layer (PRD FR-6)
    │   │   │   ├── client.ts            # createLLMClient() dispatcher + preset resolution + fail-fast
    │   │   │   ├── types.ts             # LLMClient interface: complete(system, user, opts)
    │   │   │   ├── presets.ts           # provider registry (base URL, model, key env, wire format)
    │   │   │   ├── openaiCompatible.ts  # /chat/completions (OpenAI, DeepSeek, Kimi, Grok, GroQ, Qwen, OpenRouter, Ollama, vLLM, LM Studio, custom)
    │   │   │   ├── anthropic.ts         # Messages API (x-api-key, anthropic-version, top-level system)
    │   │   │   ├── google.ts            # Gemini generateContent (systemInstruction, ?key=)
    │   │   │   ├── mock.ts              # offline deterministic responses (tests/demos)
    │   │   │   └── util.ts              # withApiPath (no double /v1) + describeHttpError
    │   │   ├── events/bus.ts          # in-process pub/sub per jobId (SSE source)
    │   │   ├── db/store.ts            # better-sqlite3 JobStore (jobs table, JSON transcript/blueprint)
    │   │   ├── committee/
    │   │   │   ├── nonNeutrality.ts   # parseDecision()/hasNeutralLanguage() — verdict extraction + enforcement
    │   │   │   ├── agentExecutor.ts   # executeAgentTurn() + retry/redress loop
    │   │   │   ├── debateEngine.ts    # runDebate() rounds + aggregateVotes() weighted consensus
    │   │   │   ├── blueprintExtractor.ts  # LLM-first, rule-based fallback, Zod repair
    │   │   │   ├── resumeRewriter.ts  # rewriteResume() from blueprint + transcript
    │   │   │   └── runner.ts          # runCommittee() orchestrator, publishes JobEvents
    │   │   └── routes/
    │   │       ├── health.ts
    │   │       └── jobs.ts            # POST/GET/GET:stream/DELETE + SSE endpoint
    │   │   (+ *.test.ts colocated — see "Tests" below)
    │   └── cli/debate.ts              # offline/headless runner (pnpm debate --mock)
    └── web/                   # @rattlesnake/web — Astro 5 SSR (node adapter, port 4321)
        ├── astro.config.mjs           # output: "server", @astrojs/node standalone
        └── src/
            ├── layouts/Layout.astro
            ├── pages/index.astro, jobs/index.astro, jobs/[id].astro
            ├── components/NewJobForm.tsx, JobList.tsx, DebateView.tsx (SSE live)
            └── lib/api.ts             # fetch client; PUBLIC_API_URL env
```

---

## 3. Current state — VERIFIED working

Everything below was built and smoke-tested this session.

| Capability | Status |
|---|---|
| pnpm + Turborepo monorepo, 3 packages build clean | ✅ `pnpm run build` — 3/3 |
| Typecheck (shared, api, web via `astro check`) | ✅ `pnpm exec turbo run typecheck` — 4/4, 0 errors |
| better-sqlite3 native install on Windows/Node 22 | ✅ (approved via root `package.json` → `pnpm.onlyBuiltDependencies`) |
| **Multi-provider LLM layer (FR-6)** | ✅ OpenAI, Anthropic, Google, DeepSeek, Kimi, Grok, GroQ, Qwen, OpenRouter, Ollama, vLLM, LM Studio, LocalAI, `custom` (any OpenAI-compatible), `mock` — native adapters + preset registry + fail-fast resolution |
| LLM client — **offline mock provider** | ✅ |
| Non-neutrality enforcer (parse + redress retries) | ✅ |
| Debate engine: R1 openings → 2× cross-talk → ballot, weighted consensus | ✅ |
| Blueprint extraction (LLM + rule-based fallback) | ✅ |
| Resume rewriter (objection-clearing, `[ADD: ...]` placeholders) | ✅ |
| CLI runner end-to-end with mock | ✅ `pnpm debate -- --jd samples/fintech-jd.md --resume samples/candidate-resume.md --domain SWE --mock --out samples/rewritten-resume.md` |
| HTTP API end-to-end with mock | ✅ health, POST /api/jobs, GET /api/jobs/:id (20 entries, verdict SHORTLISTED, blueprint, rewritten resume) |
| SSE live streaming | ✅ `GET /api/jobs/:id/stream` replays snapshot + pushes events |
| Web build (Astro SSR) | ✅ `astro build` |
| Web typecheck | ✅ |
| **vitest suite** — 64 tests (shared 13 + api 51) | ✅ `pnpm test` — provider adapters/dispatch (20), non-neutrality, consensus math incl. 0.5 tiebreak, redress loop, blueprint fallback, jobs routes E2E, domain detection |
| **Production start scripts** | ✅ `node apps/api/dist/index.js` + `node apps/web/dist/server/entry.mjs` both serve (health 200, web 200/renders) |
| **Docs (PRD / strategy / feature-tracker / architecture / roadmap)** | ✅ all in `docs/` |
| **README.md** | ✅ |
| **Docker** | ✅ `Dockerfile` (TARGET api|web) + `entrypoint.sh` + `docker-compose.yml` (compose config validates; **image build not yet run** — Docker Desktop was off) |
| **git** | ✅ initialized, initial commit `30342c4` |

**E2E evidence captured this session** (mock provider):
- Job `msqoq644vxbtve81` → `status=completed`, `finalVerdict=SHORTLISTED`, 20 transcript entries (5 opening + 10 cross-talk + 5 ballot), blueprint with 10 objections/10 strengths/10 required changes, rewritten resume in Markdown.
- Every agent turn contains `[STRONG POSITIVES] / [HIGH-RISK CONCERNS] / [PIVOT POINT] / [VERDICT] [STRONG HIRE]`.
- **Bug fixed this session:** `parseDecision` was not uppercasing a case-insensitive marker match — `[strong hire]` produced the invalid lowercase decision `"hire"`. Fixed at `apps/api/src/committee/nonNeutrality.ts:33` (`match[1]!.toUpperCase()`) + regression test.

---

## 4. How to run

```powershell
# from repo root
pnpm install                       # (first time)
Copy-Item .env.example .env        # optional; defaults are sane
pnpm dev:api                       # API on http://localhost:8787
pnpm dev:web                       # Astro on http://localhost:4321
```

- **Default LLM = offline `mock`** (zero config). Set `LLM_PROVIDER` to use a real provider: `openai` · `anthropic` · `google` · `deepseek` · `kimi` · `grok` · `groq` · `qwen` · `openrouter` · `ollama` · `vllm` · `lmstudio` · `localai` · `custom` · `mock`. Keys: set `LLM_API_KEY` or the provider's standard env var (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `DEEPSEEK_API_KEY`, `MOONSHOT_API_KEY`, `XAI_API_KEY`, `GROQ_API_KEY`, `DASHSCOPE_API_KEY`, `OPENROUTER_API_KEY`). Unknown provider names + `LLM_BASE_URL` = generic OpenAI-compatible. Full table: `docs/architecture.md §11`.
- **`.env` is loaded by code** (`apps/api/src/env.ts` via dotenv): `apps/api/.env` first, then repo-root `.env`. Without this the process silently used defaults (and crashed on the old `openai` default).
- CLI (no server): `pnpm debate -- --jd samples/fintech-jd.md --resume samples/candidate-resume.md --domain SWE --mock --out out.md`
- Ports: API **8787**, Web **4321**. Frontend reads `PUBLIC_API_URL` (default `http://localhost:8787`).
- SQLite data: `data/rattle-snake.db` (gitignored). On restart, jobs left mid-debate are marked `failed`.
- **Tests/checks:** `pnpm test` (64 tests) · `pnpm typecheck` (4/4) · `pnpm run build` (3/3) · `pnpm e2e` (functional: all 3 provider wire formats over real HTTP + full API/SSE flow — no keys needed).
- **Docker:** `docker compose up --build` (api+web, offline `mock` default) · `docker compose --profile llm up --build` (adds local Ollama). Note: image build unverified locally (Docker Desktop off).

---

## 5. Key implementation notes (for the next session)

- **Agents are pure data + prompt functions** (`AgentConfig` + `buildAgentSystemPrompt`), stateless; all memory lives in the shared `JobState.transcript`.
- **Forced non-neutrality** is enforced twice: in the system prompt (laws 1–4) AND by parsing (`parseDecision`) with a redress re-prompt loop; ultimate fallback inherits the agent's prior vote.
- **Weighted consensus**: `aggregateVotes()` — score = Σ(HIRE weights)/Σ(all weights); >0.5 SHORTLISTED, <0.5 REJECTED, =0.5 tiebreak by highest-weight seat (hiring manager). Weights in the agent data (recruiter 0.8, tech specialist 1.2, lead 1, manager 1.2, sector specialist 1).
- **Sector Specialist is overridable** per job via `sectorFocus` in the POST body (`getCommitteeForDomain` rewrites its role/focus).
- **Domain auto-detection**: `detectDomain(jd)` keyword scoring in shared; UI pre-selects; user can override.
- **SSE bus is in-process only** (`events/bus.ts`). Swap for Redis pub/sub before scaling out (roadmap).
- **Mock LLM** (`createMockClient` in `apps/api/src/llm/mock.ts`) produces schema-compliant outputs so the entire pipeline (including blueprint rule-based fallback) runs offline.
- **Provider layer is fetch-based** — no `openai` SDK dependency. `createLLMClient(config)` (`apps/api/src/llm/client.ts`) dispatches on `LLM_PROVIDER`: `anthropic` → Messages adapter, `google` → Gemini adapter, known OpenAI-compatible names / unknown / `custom` → `/chat/completions`, `mock` → offline. `resolveEndpointConfig` resolves key/model/baseUrl with preset defaults + provider key-env fallbacks and fails fast with actionable errors.
- **Job isolation**: every evaluation is its own `JobState` + row in SQLite; a crash mid-debate loses only in-flight turns.

---

## 6. Still to do / next steps (in priority order)

Sprint plan + full status per requirement: `docs/strategy.md` + `docs/feature-tracker.md`.

### P1 — Required to call the app "complete"
1. **Test against a real LLM (Sprint 2 Part B).** Everything is verified against the offline mock and the fake-wire-format functional suite (`pnpm e2e`), but not yet against a **real** provider. **The user chose to supply an OpenAI-compatible endpoint** (base URL + key + model) but the details are NOT yet provided — ask for them. Then run the CLI + a full UI flow and sanity-check: response format adherence, redress retries actually firing, blueprint JSON parse rate, rewriter output quality.
2. **Verify the Docker image build (Sprint 2 Part C)** — compose file validated (now defaults to offline `mock`), but `docker build` was not run (Docker Desktop was off).

### P2 — Production hardening
3. **Basic auth** for the web/API (self-hosted exposure). Simple token via middleware or basic-auth Hono package.
4. Frontend **resume/JD file upload** (parse `.pdf`/`.docx` → text) in `NewJobForm`.
5. **Export rewritten resume** to PDF/DOCX from the UI.
6. Frontend e2e (`playwright`) for the create → stream → verdict flow.
7. **Token-level streaming** of agent turns (currently whole-turn completion → could be SSE chunked) + per-agent latency/retry telemetry.
8. Rate-limit / queue concurrent debates; guardrail against prompt-injection in JD/resume text.

### P3 — Nice-to-have / spec extensions
9. More domain committees (Design/Product, Cybersecurity, Cloud/DevOps) — trivial: add a file to `packages/shared/src/agents/`.
10. `LLM_TEMPERATURE` tuning; structured JSON output mode (OpenAI `response_format`) instead of text parsing where supported.
11. `@hono/oauth-provider` or user accounts; multi-user job separation.
12. Historical eval: run same candidate vs. multiple JDs, diff rewritten resumes.

---

## 7. Environment / gotchas

- OS **Windows**, shell **PowerShell 5.1**, Node **v22.20.0**, pnpm **10.33.2**, Turbo **2.10.9**, Astro **5.18.2**, Hono **4.x**, better-sqlite3 **11.10.0**, React **19**.
- `pnpm.onlyBuiltDependencies` in root `package.json` is required so `better-sqlite3` / `esbuild` / `sharp` build scripts run (pnpm 10 blocks them by default).
- PowerShell 5.1 `Invoke-RestMethod` mangles UTF-8 (em-dashes) when posting; use `curl.exe --data-binary @file.json` for API testing (or PS7).
- **`.env` is not loaded automatically** — `apps/api/src/env.ts` (`loadEnv()`) must run at the entry point (it does: `src/index.ts`, `cli/debate.ts`, `cli/functional-test.ts`). It reads `apps/api/.env` first, then repo-root `.env`. The old default `LLM_PROVIDER=openai` + missing loader caused a boot-time crash (`missing API key`); default is now `mock`.
- Turbo prints a benign `node.exe` PowerShell "RemoteException" on success — ignore it; check `Tasks: N successful`.
- `noUncheckedIndexedAccess: true` is on everywhere — use `!`/`??` for map/array access (several fixes already applied for this).
- **Non-ASCII chars in source (—, ·, ⇒) are fine and intentional** (prompt quality), UTF-8 files.
- **vitest specifics:** test files are excluded from `tsc` build via `exclude: ["src/**/*.test.ts"]` in `apps/api/tsconfig.json` + `packages/shared/tsconfig.json` (vitest transpiles them itself; build/typecheck stay green). When writing route tests that create jobs, the fire-and-forget `runCommittee` keeps running — **close the store only after jobs reach a terminal status** (see `drainActiveJobs` in `apps/api/src/routes/jobs.test.ts`), and never `rmSync` an open SQLite file on Windows (EBUSY).
- **React 19 note:** `FormEvent` is deprecated in React 19 types — use `SyntheticEvent<HTMLFormElement>` for onSubmit handlers (`apps/web/src/components/NewJobForm.tsx`).

## 8. Config reference (.env)

```
API_PORT=8787
LLM_PROVIDER=mock               # mock is the offline default; openai|anthropic|google|deepseek|kimi|grok|groq|qwen|openrouter|ollama|vllm|lmstudio|localai|custom|mock (unknown name = OpenAI-compatible)
LLM_BASE_URL=                  # override base URL (per-provider default if empty; REQUIRED for custom)
LLM_API_KEY=                   # override key; else provider env (OPENAI_API_KEY, ANTHROPIC_API_KEY, ...)
LLM_MODEL=                     # override model (per-provider default if empty; REQUIRED for vllm/lmstudio/localai/custom)
LLM_TEMPERATURE=0.3
DEBATE_CROSS_TALK_ROUNDS=2
AGENT_MAX_RETRIES=2
DATABASE_PATH=./data/rattle-snake.db
CORS_ORIGINS=                  # empty = allow all (localhost)
PUBLIC_API_URL=http://localhost:8787   # used by the web app
```

## 9. API surface

- `GET  /health` — status + LLM provider/model + debate config
- `POST /api/jobs` — `{ domain?, jobDescription, baseResume, sectorFocus? }` → 202 + job
- `GET  /api/jobs` — summary list
- `GET  /api/jobs/:id` — full job (transcript, verdict, blueprint, rewrittenResume)
- `GET  /api/jobs/:id/stream` — SSE (`job` snapshot then `entry|status|verdict|blueprint|resume|done|error|ping`)
- `DELETE /api/jobs/:id`
