# Developer Guide

The developer's entry point to Rattle-Snake V2: what the monorepo looks like,
how to run it, how a run flows through the pipeline, the conventions you must
follow, and how to extend it.

Companion documents in `docs/developer/`:

| Document | What it covers |
|---|---|
| [docs/developer/system-prompts.md](developer/system-prompts.md) | Every system prompt that drives the committee discussion and resume generation, with exact paths |
| [docs/developer/three-layer-committee.md](developer/three-layer-committee.md) | The design plan: persona / director / resume layers, panel rules, confidence weights, enhancement policy |
| [docs/developer/api-reference.md](developer/api-reference.md) | The full HTTP API: every route, its file, its line, payloads, SSE contract |
| [docs/developer/frontend-map.md](developer/frontend-map.md) | The skeletal page structure: pages, React islands, lib modules, nav |

All paths below are relative to the repository root unless stated otherwise.

---

## 1. Monorepo layout

```
Rattle-Snake-V2/
├── package.json                 # workspace scripts: dev / build / test / e2e / smoke:routes / debate
├── pnpm-workspace.yaml          # apps/* and packages/* are the workspace
├── turbo.json                   # Turborepo task graph (dev, build, test, typecheck)
├── tsconfig.base.json           # shared strict TS settings (ES2022, NodeNext-style ESM)
├── .env.example                 # every environment variable with a sane default
├── README.md                    # product overview, quick start, API surface
├── docker-compose.yml           # self-host: api + web (+ optional ollama)
├── Dockerfile / entrypoint.sh   # container build
├── samples/                     # sample JD, candidate resume, rewritten output
├── docs/                        # product docs + this developer guide
│   └── developer/               #   system-prompts.md, api-reference.md, frontend-map.md
├── packages/
│   └── shared/                  # @rattlesnake/shared - the source of truth for the domain model
│       └── src/
│           ├── index.ts         # public barrel (re-exports everything below)
│           ├── types.ts         # JobState + every committee/blueprint/profile type + JobEvent
│           ├── validation.ts    # all Zod schemas (request + persisted-entity contracts)
│           ├── prompts.ts       # the committee + blueprint + exec-review PROMPT BUILDERS
│           ├── personas.ts      # templated IC / Sector Specialist persona builders (Layer 1)
│           ├── sectors.ts       # 12 sector personas + isSpecificSector()
│           ├── agents/
│           │   ├── index.ts             # 9 domain committees, detectDomain(), getCommitteeForDomain()
│           │   └── roleCommittees.ts    # 42 role committees + seat kinds + band filtering + level-aware panel
│           └── export/
│               └── transcript.ts        # discussion export: MD / plaintext / JSON
├── apps/
│   ├── api/                     # @rattlesnake/api - Hono/Node backend
│   │   ├── cli/                 # functional-test.ts (pnpm e2e), debate.ts (pnpm debate), fake-llm.ts
│   │   ├── src/
│   │   │   ├── index.ts         # entry: loadEnv -> loadConfig -> createApp -> listen
│   │   │   ├── app.ts           # createApp(): CORS + router mounts + orphaned-job recovery
│   │   │   ├── config.ts        # env parsing (port, db, exports dir, llm, debate, cors)
│   │   │   ├── env.ts           # dotenv load order
│   │   │   ├── committee/       # runner.ts + debate engine, agents, director audit, extractors, generate chain
│   │   │   ├── resume/          # resume engine, shared core rules, 32 role prompts/, 32 templates/, moderator, ATS, ...
│   │   │   ├── routes/          # jobs.ts, settings.ts, exports.ts, storage.ts, health.ts
│   │   │   ├── db/store.ts      # SQLite persistence (better-sqlite3), profiles, connections
│   │   │   ├── events/bus.ts    # in-process pub/sub backing SSE
│   │   │   ├── exports/dossier.ts # auto-save discussion + resume to disk
│   │   │   ├── llm/             # provider adapters (openai/anthropic/google/.../mock) + presets
│   │   │   ├── outreach/        # cold email, cover letter
│   │   │   ├── interview/       # interview mock plan
│   │   │   └── security/crypto.ts # AES-256-GCM key encryption
│   │   └── data/                # runtime data (rattle-snake.db, exports/, .secret) - gitignored
│   └── web/                     # @rattlesnake/web - Astro SSR + React islands
│       └── src/
│           ├── pages/           # one .astro per URL (see frontend-map.md)
│           ├── components/      # React islands (DebateView, NewJobForm, StorageView, ...)
│           ├── layouts/Layout.astro # shell + sidebar nav
│           ├── lib/api.ts       # the browser API client (every endpoint has a wrapper)
│           ├── lib/export/      # resume export pipeline (md/docx/pdf/txt/json)
│           └── styles/global.css
```

---

## 2. Quick start

Prerequisites: Node >= 22, pnpm >= 10.

```powershell
pnpm install            # first time (native deps: better-sqlite3, esbuild, sharp)
Copy-Item .env.example .env
pnpm dev:api            # Hono API on http://localhost:8787
pnpm dev:web            # Astro UI on http://localhost:4321
```

Offline by default: `LLM_PROVIDER` defaults to `mock`, so the whole pipeline
runs with canned responses and no API key. Point at a real model by setting
`LLM_PROVIDER` + `LLM_API_KEY` (or the provider's standard env var) in `.env`.
See `README.md` and `docs/developer/system-prompts.md` for the provider table.

### Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Turbo dev across api + web |
| `pnpm dev:api` | API only (tsx watch) |
| `pnpm dev:web` | Web only (astro dev) |
| `pnpm build` | Turbo build (shared -> api -> web) |
| `pnpm typecheck` | tsc (api, shared) + `astro check` (web) |
| `pnpm test` | Vitest across shared + api + web |
| `pnpm e2e` | Functional suite over real HTTP (all 3 provider wire formats + full API/SSE flow) |
| `pnpm smoke:routes` | Boot the built web server and assert every page returns its expected status |
| `pnpm debate -- --jd samples/fintech-jd.md --resume samples/candidate-resume.md --domain SDE --mock` | Headless offline debate from the CLI |

---

## 3. Architecture at a glance

```
Browser (Astro SSR, :4321)
   |  HTTP (JSON) + SSE stream
Hono/Node API (:8787)
   |
Committee Orchestrator .......... agents are pure data + prompts in packages/shared
   |- extractJdMeta            : JD -> { company, role, sector, location, team }  (LLM-first, rule fallback)
   |- extractJobDecomposition  : structured role brief                          (LLM-first, rule fallback)
   |- getCommitteeForDomain    : picks the seats from role/domain + band + sector
   |- selectPanelForLevel      : level-aware seat adjustment + forced topics    (Layer 1)
   |- runDebate               : openings (360 analyses) -> cross-talk -> ballot
   |- executeAgentTurn        : one turn + Decisive Non-Neutrality redress loop
   |- aggregateVotes          : confidence-weighted consensus (High 1.0 / Med 0.7 / Low 0.4)
   |- runDirectorReview       : fairness audit + ONE targeted re-ballot         (Layer 2, has teeth)
   |- extractBlueprint        : Hiring Committee Blueprint from the transcript  (LLM-first, rule fallback)
   |- runExecutiveReview      : advisory C-suite opinion (never overrides verdict)
   |
   |- generateSophisticatedResume : ON-DEMAND handoff (never automatic)         (Layer 3)
   |     shared core rules + role prompt (32) + role template (32) + source-resume merge + profile layer
   |     + US/UK locale + ATS gap + enhancement tier + moderator loop (max 2 iterations)
   |- generateColdEmail / generateCoverLetter / generateInterviewMock
   |
   |- LLM client (adapters: OpenAI-compatible / Anthropic / Gemini | mock)
   |- SQLite store (WAL) + in-process SSE event bus
   |- writeDossier: <data>/exports/<jobId>/{discussion.md, discussion.json, resume.md, resume.json}
```

Key architectural decision: **three clean layers** - personas debate, a
Director audits fairness (with limited teeth), and the resume agent only
consumes the Blueprint. No prompt or model call ever mixes debate and
rewriting. And **agents are data, not classes**: a committee seat is just an
`AgentConfig` record (name, role, focus, level, weight) plus a prompt built
from it. Committees live in `packages/shared/src/agents/`, prompts live in
`packages/shared/src/prompts.ts`, and the API orchestrates calls to them.

---

## 4. The committee run pipeline

Orchestrated by `runCommittee()` in `apps/api/src/committee/runner.ts:70`,
started fire-and-forget from `POST /api/jobs` (`apps/api/src/routes/jobs.ts:51`).
Each stage persists to the store and emits an SSE event; cooperative cancel
checks (`RunCancelledError`) run between stages.

| # | Stage | Module | Emits |
|---|---|---|---|
| 1 | status `debating` | `runner.ts:106` | `status` |
| 2 | JD metadata | `apps/api/src/committee/jdMetaExtractor.ts:22` (`extractJdMeta`, LLM first, `extractViaRules` at :56) | `jdMeta` |
| 3 | Job decomposition | `apps/api/src/committee/jobDecomposition.ts:24` | `jobDecomposition` |
| 4 | Panel assembly + weights | `estimateExperienceYears` (`apps/api/src/resume/experience.ts:15`), `getCommitteeForDomain` (`packages/shared/src/agents/index.ts:184`), `selectPanelForLevel` (level-aware seats + forced topics), `applyComputedWeights` (`apps/api/src/committee/weighting.ts:95`) | `phase` |
| 5 | Debate | `runDebate` (`apps/api/src/committee/debateEngine.ts:44`); one turn = `executeAgentTurn` (`agentExecutor.ts:63`), non-neutrality = `parseDecision`/`hasNeutralLanguage`/`parseConfidence`/`parseInflatedClaims` (`nonNeutrality.ts:28`) | `entry`, `analysis` |
| 6 | Director audit | `runDirectorReview` (`apps/api/src/committee/directorReview.ts`); fairness checklist + one targeted re-ballot on a single factor (can never flip the verdict alone) | `director` |
| 7 | Weighted consensus | `aggregateVotes` (`debateEngine.ts:132`, confidence-weighted High 1.0 / Med 0.7 / Low 0.4) sets `finalVerdict` | `verdict` |
| 8 | Blueprint | `extractBlueprint` (`apps/api/src/committee/blueprintExtractor.ts:20`) - now includes `inflatedClaims` + `jdRequirements` tiers | `blueprint` |
| 9 | Executive review | `runExecutiveReview` (`apps/api/src/committee/executiveReview.ts:78`), advisory only | `executive` |
| 10 | `completed` + `done` | `runner.ts:223`; if `job.generate` was requested, `runGenerateChain` (`generateChain.ts:19`) runs resume -> cover letter -> cold email -> interview | `resume`, `coverLetter`, `coldEmail`, `interview`, `done` |
| 11 | finally | `writeDossier` (`apps/api/src/exports/dossier.ts:16`) persists whatever exists | - |

Resume generation itself is `generateSophisticatedResume` in
`apps/api/src/resume/engine.ts` (the pipeline for a single resume is detailed in
`docs/developer/system-prompts.md`).

---

## 5. Conventions you must follow

1. **ESM with explicit `.js` extensions.** Every relative import ends in `.js`
   (`import { x } from "./config.js"`). This is required by NodeNext ESM. New
   files must do the same.
2. **LLM-first, deterministic-fallback.** Every LLM consumer in the API has a
   rule-based fallback so the app works fully offline and in CI. New extractors
   must provide one.
3. **Colocated Vitest tests.** A `foo.ts` module ships a `foo.test.ts` next to
   it. There are no vitest config files; defaults pick up `*.test.ts`.
4. **Zod at every route boundary.** Request bodies are validated with shared
   schemas from `packages/shared/src/validation.ts` via `zValidator`.
5. **Types and prompts live in `@rattlesnake/shared`, logic in the API.** New
   domain types, Zod schemas, agent personas, and prompt builders go in
   `packages/shared`; business logic goes in `apps/api`.
5b. **Three-layer separation.** Persona prompts evaluate only; the Director
   audits fairness only; resume prompts rewrite only. Never let a debate prompt
   give rewriting instructions or a resume prompt re-litigate the debate
   (see `docs/developer/three-layer-committee.md`).
6. **ASCII typography hygiene.** Resumes and transcripts must not contain
   em-dashes, en-dashes, ellipses, smart quotes, or emojis. Enforced by
   `apps/api/src/resume/sanitize.ts` (`sanitizeText`, `buildTypographyDirective`)
   and by the moderator. Keep new UI copy ASCII-safe too.
7. **`noUncheckedIndexedAccess`.** Array/record indexing yields `T | undefined`;
   handle it. Keep the gate green.
8. **Resume generation is never automatic.** It only runs on an explicit
   `POST /api/jobs/:id/resume/generate` (or a chained `generate` flag chosen by
   the user at creation). Do not add code that rewrites resumes as a side effect.
9. **SSE via the in-process bus.** Live events go through
   `apps/api/src/events/bus.ts`; the store is the source of truth, the bus only
   notifies. `GET /api/jobs/:id/stream` replays the snapshot for late joiners.
10. **Storage is read/delete only.** Auto-saved dossiers are written by
    `writeDossier`; browsing is `GET /api/exports` and `GET /api/storage`;
    deletion is `DELETE /api/exports/:jobId` (files) and
    `DELETE /api/jobs/:id` (run + files). No in-place edits.

### The gates (run after ANY change)

Re-run the full chain from the repo root; everything must stay green:

```powershell
# shared changed?  ->  pnpm --filter @rattlesnake/shared build
pnpm --filter @rattlesnake/api exec tsc -p tsconfig.json --noEmit
pnpm --filter @rattlesnake/api exec vitest run
pnpm --filter @rattlesnake/web exec astro check
pnpm --filter @rattlesnake/web exec astro build
pnpm --filter @rattlesnake/web exec vitest run
pnpm e2e                 # ALL PASSED
pnpm smoke:routes        # ALL ROUTES SMOKE PASSED
```

---

## 6. Where things live - quick index

| You want to change... | Go to |
|---|---|
| Agent system prompts (discussion) | `packages/shared/src/prompts.ts` - `buildAgentSystemPrompt` (:80) |
| Templated IC / Sector Specialist personas | `packages/shared/src/personas.ts` |
| Blueprint / JD meta / decomposition / exec-review prompts | `packages/shared/src/prompts.ts` (:198, :268, :298, :339) |
| Role-driven committees (42 roles, seats, bands, level panel) | `packages/shared/src/agents/roleCommittees.ts` |
| Domain committees + `detectDomain` | `packages/shared/src/agents/index.ts` |
| Sector personas (12) + sector specificity | `packages/shared/src/sectors.ts` |
| Confidence / inflation parsing | `apps/api/src/committee/nonNeutrality.ts` |
| Director fairness audit + re-vote | `apps/api/src/committee/directorReview.ts` |
| 32 role system prompts (resume generation) | `apps/api/src/resume/prompts/*.ts` |
| Shared resume core rules (C-A-R, skill split, anti-bot) | `apps/api/src/resume/core.ts` |
| 32 role resume templates | `apps/api/src/resume/templates/*.ts` |
| Resume template/prompt registry | `apps/api/src/resume/roleRegistry.ts` |
| Resume quality moderator prompt | `apps/api/src/resume/moderator.ts` (`MODERATOR_SYSTEM_PROMPT`, :26) |
| Resume engine (assembles all of the above) | `apps/api/src/resume/engine.ts` |
| API routes | `apps/api/src/routes/*.ts` (see api-reference.md) |
| Web pages / components | `apps/web/src/pages`, `apps/web/src/components` (see frontend-map.md) |
| Browser API client | `apps/web/src/lib/api.ts` |
| Job persistence + profiles + connections | `apps/api/src/db/store.ts` |
| Config / env vars | `apps/api/src/config.ts` + `.env.example` |
| Auto-save / export dossiers | `apps/api/src/exports/dossier.ts` + `apps/api/src/routes/exports.ts` |
| LLM providers | `apps/api/src/llm/` (`client.ts` factory, `presets.ts` registry, `resolve.ts` per-run) |
| Job types + Zod schemas | `packages/shared/src/types.ts`, `packages/shared/src/validation.ts` |
| Discussion export (MD/plaintext/JSON) | `packages/shared/src/export/transcript.ts` |
| e2e / smoke | `apps/api/cli/functional-test.ts`, `apps/web/scripts/smoke-routes.mjs` |

---

## 7. Extending the project

### 7.1 Add a role template + system prompt (resume generation)

1. Create `apps/api/src/resume/templates/<slug>.ts` exporting a
   `ResumeTemplate` with an `ats_keywords` array.
2. Create `apps/api/src/resume/prompts/<slug>.ts` exporting
   `<SLUG>_SYSTEM_PROMPT`.
3. Register both in `apps/api/src/resume/roleRegistry.ts` (import + add to the
   templates/prompts registries). Keep `DOMAIN_ROLES` up to date.
4. If the role should drive its own committee, add a
   `RoleCommitteeSpec` to `ROLE_DETAILS` in
   `packages/shared/src/agents/roleCommittees.ts` AND keep the 42-slug parity
   test (`packages/shared/src/agents/roleCommittees.test.ts`) and
   `apps/api/src/resume/roleRegistry.test.ts` in sync.

### 7.2 Add an HTTP route

1. Add the handler to the right router in `apps/api/src/routes/*.ts`.
2. Add a Zod schema for the request in `packages/shared/src/validation.ts`.
3. Add a wrapper in `apps/web/src/lib/api.ts` so the UI can call it.
4. Add/extend the Vitest coverage in the route's co-located test.

### 7.3 Add a web page

1. Create `apps/web/src/pages/<name>.astro` using the `Layout` and one React
   island (`client:load`). See `docs/developer/frontend-map.md` for the pattern.
2. Add the link to `NAV` in `apps/web/src/layouts/Layout.astro`.
3. Add the route to `apps/web/scripts/smoke-routes.mjs` and to
   `docs/developer/frontend-map.md`.

### 7.4 Add an LLM provider

1. Add a preset to `apps/api/src/llm/presets.ts` (base URL, default model, key
   env var). If it is OpenAI-compatible, nothing more is needed.
2. Otherwise add an adapter in `apps/api/src/llm/<name>.ts` implementing the
   `LLMClient` interface (`complete(system, user, opts)`), and wire it in
   `apps/api/src/llm/client.ts`.
3. Add the provider to `apps/web/src/lib/providers.ts` so the Settings form and
   BYOK pickers know about it.
4. Prove the wire format in `apps/api/cli/fake-llm.ts` + `functional-test.ts`.

### 7.5 Add a committee seat / change weights

1. Seat kinds are `SEAT_KINDS` and weights are per-seat in
   `packages/shared/src/agents/roleCommittees.ts` (senior 1, manager 1, staff
   1.2, principal 1.3, recruiter 0.8, sector 1).
2. Band filtering: `SEATS_BY_BAND` and `bandForYears` in the same file.
3. Level-aware panel adjustment (Staff/Principal JD keeps a Principal seat;
   title inflation forces a level discussion): `selectPanelForLevel` in the
   same file.
4. Per-run derived weights: `apps/api/src/committee/weighting.ts`
   (`computeWeights` :49, `applyComputedWeights` :95).
5. Confidence weights (High 1.0 / Med 0.7 / Low 0.4) apply on top inside
   `aggregateVotes` (`apps/api/src/committee/debateEngine.ts:132`).

### 7.6 Add a sector persona

Add an entry to `SECTOR_REGISTRY` in `packages/shared/src/sectors.ts` (id,
label, persona). Unknown sectors already get a generic persona via
`sectorPersona`.

---

## 8. Data at rest

- SQLite at `DATABASE_PATH` (default `apps/api/data/rattle-snake.db`), WAL mode.
- Tables: `jobs`, `profile` (legacy), `profiles`, `saved_resumes`, `saved_jds`,
  `llm_connections`, `meta` (job serial). Created in
  `apps/api/src/db/store.ts:113-189`; migrations are sequential
  `ALTER TABLE` blocks (:190-288).
- Stored LLM keys are AES-256-GCM encrypted with a per-install master key in
  `data/.secret` (mode 0600) - `apps/api/src/security/crypto.ts`. Back up the
  secret together with the database; never commit it.
- Auto-saved result dossiers land under `EXPORTS_DIR`
  (default `apps/api/data/exports/<jobId>/`).
