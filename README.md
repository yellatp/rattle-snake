# Rattle-Snake V2

A **self-hosted hiring committee**: five named domain-expert personas debate a candidate against a Job Description in three rounds, are **forced to a non-neutral verdict**, then generate a **blueprint** and an **objection-clearing resume rewrite** — streamed live to the browser.

TypeScript · Astro frontend · Hono/Node backend · OpenAI-compatible LLM (Ollama / vLLM / LocalAI / llama.cpp) · SQLite · pnpm + Turborepo monorepo.

> Docs: [PRD](docs/PRD.md) · [Architecture](docs/architecture.md) · [Feature tracker](docs/feature-tracker.md) · [Roadmap](docs/roadmap.md) · [Sprint plan](docs/strategy.md)

---

## What it does

1. **Domain-specific committees** — 5 named personas per domain:
   - **SWE / SDE**: Priya (Tech Recruiter) · Alex (Staff Architect) · Marcus (Team Lead) · Elena (VP Engineering) · **Liam (FinTech Sector Specialist)**
   - **Data & AI**: Sarah · Dr. Aris · Vikram · Director Karen · **Maya (HealthTech Sector Specialist)**
   - **Finance & Banking**: David · Elena (VP Quant) · Michael · Managing Director Chen · **Sophia (Energy/Real Estate Sector Specialist)**
2. **Sector transferability audit** — the 5th seat (overridable per job) checks industry fit and cross-sector transferable skills.
3. **Non-neutral guardrail** — every turn ends in `[STRONG HIRE]` or `[STRONG REJECT]`, enforced by parsing + a redress re-prompt loop, not just prompting.
4. **Debate → verdict → blueprint → rewrite**: opening arguments → cross-talk → weighted ballot → `SHORTLISTED`/`REJECTED` → Hiring Committee Blueprint → rewritten resume that resolves every raised objection.
5. **Live streaming** via Server-Sent Events + SQLite persistence per run.

---

## Quick start

Prerequisites: **Node ≥ 22**, **pnpm ≥ 10**.

```powershell
pnpm install                    # first time (native deps auto-build)
Copy-Item .env.example .env     # optional — defaults are sane
pnpm dev:api                    # API on http://localhost:8787
pnpm dev:web                    # Astro on http://localhost:4321
```

Open http://localhost:4321, click **Load sample** (or paste your own JD + resume), pick a domain, and start the committee debate.

### No LLM handy? Use the offline mock

```powershell
# in .env set:
LLM_PROVIDER=mock
```

The mock returns correctly-formatted responses so the entire pipeline (debate, verdict, blueprint, rewrite) runs fully offline — great for demos, CI, and tests.

### Pointing at a real model

The default `LLM_BASE_URL=http://localhost:11434/v1` targets **Ollama** (model `llama3.1`). Any OpenAI-compatible server works — set in `.env`:

```
LLM_PROVIDER=openai
LLM_BASE_URL=http://localhost:11434/v1    # or vLLM / LocalAI / LM Studio / cloud
LLM_API_KEY=ollama                        # required by the SDK, ignored by Ollama
LLM_MODEL=llama3.1
```

---

## CLI (no server)

```powershell
pnpm debate -- --jd samples/fintech-jd.md --resume samples/candidate-resume.md `
  --domain SWE --mock --out samples/rewritten-resume.md
```

## Tests & checks

```powershell
pnpm test        # vitest: 44 tests (non-neutrality, consensus math, blueprint, routes, domain detection)
pnpm typecheck   # tsc + astro check (4/4)
pnpm run build   # turbo build (3/3)
```

## Docker (self-host)

```powershell
docker compose up --build    # builds api + web; optionally adds ollama
# api on :8787 · web on :4321
```

---

## Architecture (summary)

```
Astro SSR (web, :4321)
   │ HTTP + SSE
Hono/Node API (api, :8787)
   │
Committee Orchestrator ── agents are pure data + prompts (packages/shared)
   ├─ runDebate   : Round 1 openings → 2× cross-talk → final ballot
   ├─ aggregateVotes : weighted consensus (>0.5 SHORTLISTED, =0.5 tiebreak)
   ├─ executeAgentTurn : non-neutrality enforcement + redress loop
   ├─ extractBlueprint : LLM-first, rule-based fallback
   └─ rewriteResume    : objection-clearing Markdown
   │
   ├─ LLM client (openai SDK → Ollama/vLLM/… | mock)
   └─ SQLite (better-sqlite3, WAL) + in-process SSE event bus
```

Full detail: [docs/architecture.md](docs/architecture.md).

---

## API surface

| Method | Path | Description |
|---|---|---|
| GET | `/health` | provider/model/debate config |
| POST | `/api/jobs` | `{ domain?, jobDescription, baseResume, sectorFocus? }` → 202 + job |
| GET | `/api/jobs` | compact list |
| GET | `/api/jobs/:id` | full state (transcript, verdict, blueprint, rewritten resume) |
| GET | `/api/jobs/:id/stream` | SSE live events (`job`, `entry`, `status`, `verdict`, `blueprint`, `resume`, `done`, `error`, `ping`) |
| DELETE | `/api/jobs/:id` | 204 / 404 |

## Environment reference

See `.env.example` and [docs/architecture.md §10](docs/architecture.md).

| Var | Default | Purpose |
|---|---|---|
| `API_PORT` | `8787` | API port |
| `LLM_PROVIDER` | `openai` | `openai` \| `mock` |
| `LLM_BASE_URL` | `http://localhost:11434/v1` | OpenAI-compatible endpoint |
| `LLM_API_KEY` | `ollama` | key |
| `LLM_MODEL` | `llama3.1` | model id |
| `LLM_TEMPERATURE` | `0.3` | sampling temperature |
| `DEBATE_CROSS_TALK_ROUNDS` | `2` | cross-talk passes |
| `AGENT_MAX_RETRIES` | `2` | redress re-prompts |
| `DATABASE_PATH` | `./data/rattle-snake.db` | SQLite file |
| `CORS_ORIGINS` | empty | comma list; empty = allow all |
| `PUBLIC_API_URL` | `http://localhost:8787` | web→api base URL |

---

## Repository layout

```
packages/shared   # types, Zod schemas, domain committees (pure data), prompt builders
apps/api          # Hono backend: orchestrator, LLM client, SQLite store, SSE routes, CLI
apps/web          # Astro SSR UI (React islands): NewJobForm, JobList, DebateView
docs/             # PRD, architecture, feature tracker, roadmap, strategy
samples/          # sample JD + resume + rewritten output
```

## Project status

Core pipeline **complete and verified end-to-end with the offline mock** (debate → verdict → blueprint → rewrite → live SSE). The remaining "call it production-ready" items — real-LLM validation, auth, file upload, PDF export, Docker-based deployments, and Playwright e2e — are tracked in [docs/feature-tracker.md](docs/feature-tracker.md) and [docs/roadmap.md](docs/roadmap.md).

## License

MIT.
