# Rattle-Snake V2

A **self-hosted hiring committee**: five role-driven personas that evaluate one candidate against one job description. You paste a JD + resume (optionally attaching a saved candidate profile and pinning one of 32 role templates), and the system extracts structured **JD metadata** (company, role, sector, location, team), uses it to select the committee seats, and runs a live **SME panel**: every seat delivers a **360-degree scored analysis**, then the committee cross-talks and is forced to a non-neutral verdict, producing a **Hiring Committee Blueprint**. Resume generation is an **explicit, on-demand handoff** — you choose when and with which role template to run it, and the result is ATS re-scored, moderated, and streamed live to the browser. Every run links to a per-application **cold-email killer intro** and a **5-expert interview mock**.

TypeScript · Astro frontend · Hono/Node backend · **multi-provider LLM** (OpenAI, Anthropic, Google, DeepSeek, Kimi, Grok, GroQ, Qwen, Ollama, OpenRouter, or any OpenAI-compatible endpoint) · SQLite · pnpm + Turborepo monorepo.

> Docs: [How it works](docs/how-it-works.md) · [PRD](docs/PRD.md) · [Architecture](docs/architecture.md) · [Feature tracker](docs/feature-tracker.md) · [Roadmap](docs/roadmap.md) · [Sprint plan](docs/strategy.md) · [Sprint tracker](docs/sprint-tracker.md)
>
> Developer docs: [Developer guide](docs/developer-guide.md) · [System prompts](docs/developer/system-prompts.md) · [API reference](docs/developer/api-reference.md) · [Frontend map](docs/developer/frontend-map.md)

---

## What it does

1. **Role-driven committees** - the JD's role (one of 32 role templates) picks a 5-seat committee: Recruiter + Technical Specialist + Team Lead + Hiring Manager + a Sector Specialist composed from the job's sector. Level-aware adjustment adds a Principal/Staff seat for Staff/Principal-level JDs.
2. **JD metadata extraction** — at run start an LLM (with a deterministic rule-based fallback) reads the posting and produces concrete metadata: company, role, sector, location and team, plus the resolved role slug. It drives committee selection (sector + role), the US/UK English variant, and the run page's metadata card.
3. **SME panel with 360-degree analyses** — every seat's opening turn is a structured, scored assessment: canonical role-specific factors (0–5 each), evidence-backed strengths, high-risk concerns, a forced HIRE/REJECT decision, and the single pivot factor. The panel renders live as each analysis lands.
4. **Sector transferability audit** — the Sector Specialist seat (overridable per job) checks industry fit and cross-sector transferable skills.
5. **Non-neutral guardrail** — every turn ends in `[STRONG HIRE]` or `[STRONG REJECT]`, enforced by structured-output parsing + a redress re-prompt loop, not just prompting.
6. **Evaluation → verdict → blueprint**: openings (360 analyses) → cross-talk → weighted ballot → `SHORTLISTED`/`REJECTED` → Hiring Committee Blueprint. Resumes are **never rewritten automatically**.
7. **Explicit resume handoff** — when a run completes, the run page offers "Proceed to Resume Generation"; the Resume page (or the handoff link) generates the resume on demand against the blueprint, optionally with a different role template.
8. **Template library** — browse all 32 role templates by category on the Resume page, or pre-select a role in the SME Panel form (`?role=`, `?domain=`).
9. **Multiple candidate profiles** — the Profile page manages structured profiles (contact, experience, education, skills, projects, work authorization); the first profile is the **master** (default input for new runs), with optional PIN lock. Profiles drive generation so output matches a real candidate.
10. **SaaS execution layer** - runs execute through a queue + worker (memory or Redis; at-least-once with crash recovery), the event bus fans out across instances, outbound webhooks are HMAC-signed and SSRF-guarded, an audit log records every sensitive action, and all data is tenant-scoped behind a security middleware chain (API-key auth with secure production defaults, rate limiting, body limits).
10. **Resume downloads** — from the job page, download the final resume as **PDF / DOCX / TXT** in formats (`modern | classic | plain`), layout presets (`standard | minimalist | compact`) and page size (`letter | a4`).
11. **Live streaming** via Server-Sent Events + SQLite persistence per run.
12. **Cold-email killer intro** — per application, generate a short, high-signal outreach draft (subject + body) for a recruiter, founder, or hiring manager, built from the role, JD, and the strengths the committee confirmed.
13. **5-expert interview mock** — per application, the same committee that evaluated the resume plans the interview: typical phases for the role, what each expert expects, how each will drill the candidate from the JD, and the red flags they probe.

---

## Quick start

Prerequisites: **Node ≥ 22**, **pnpm ≥ 10**.

```powershell
pnpm install                    # first time (native deps auto-build)
Copy-Item .env.example .env     # optional — offline-first defaults are sane
pnpm dev:api                    # API on http://localhost:8787
pnpm dev:web                    # Astro on http://localhost:4321
```

Open http://localhost:4321 → the **Dashboard** lists every evaluation; the **SME Panel** page starts a new one. Click **Load sample** (or paste your own JD + resume), pick a domain, and start the run. The form also offers a role template picker, a candidate profile picker (defaults to the master), a sector specialist focus, and a saved JD / saved resume loader.

### Offline by default — the mock is the fallback

Out of the box (no `.env` at all) `LLM_PROVIDER` defaults to `mock`, so `pnpm dev:api` runs with zero configuration. Set any provider to take the real path:

```powershell
# in .env set:
LLM_PROVIDER=anthropic
LLM_API_KEY=sk-ant-...
```

The mock returns correctly-formatted responses so the entire pipeline (JD metadata, 360 analyses, debate, verdict, blueprint, resume handoff) runs fully offline — great for demos, CI, and tests.

### Pointing at a real model

Pick any provider by name. The preset supplies the correct base URL, auth scheme, message format, and a default model — set the API key (or rely on the provider's standard env var):

```powershell
# e.g. Anthropic
LLM_PROVIDER=anthropic
LLM_API_KEY=sk-ant-...            # or set ANTHROPIC_API_KEY

# e.g. Google Gemini
LLM_PROVIDER=google
LLM_API_KEY=AIza...               # or set GEMINI_API_KEY

# e.g. local Ollama (no key needed)
LLM_PROVIDER=ollama
LLM_MODEL=llama3.1
```

**Supported providers:** `openai` · `anthropic` · `google` · `deepseek` · `kimi` · `grok` · `groq` · `qwen` · `openrouter` · `ollama` · `vllm` · `lmstudio` · `localai` · `custom` · `mock`. Override anything with `LLM_BASE_URL` / `LLM_MODEL`. Any **other** vendor = use `LLM_PROVIDER=custom` (or any unknown name) with an OpenAI-compatible `LLM_BASE_URL` — full provider table in [docs/architecture.md §11](docs/architecture.md).

### Bring your own LLM — per run, from the UI

No env edits needed. On the **SME Panel** form tick **"Bring your own LLM API"**: pick a provider (or a custom OpenAI-compatible endpoint), paste your API key + model, and that run uses your endpoint instead of the server default. Settings are remembered in your browser; the key is sent to the API **per run only** and is never written to the database. Every run records which provider/model actually ran it (`llmUsed`), shown on the run page. The same picker is available on the Resume Generation page for the resume handoff.

Per-run overrides are also accepted in the API: `POST /api/jobs` with `{ ..., llm: { provider, baseUrl, apiKey, model, temperature } }`.

### Settings — profile, saved resumes/JDs, stored LLM connections

The **Settings** page (`/settings`) manages your persistent data:

- **Profile** — name + email, shown and editable from one panel.
- **Saved resumes & job descriptions** — save any resume/JD once, then load it into the New Debate form with a dropdown (no more re-pasting).
- **LLM API connections** — store named connections (provider, base URL, model, temperature, API key) and pick them per run from a dropdown. One connection can be marked **default** so it's pre-selected on every new debate.

Connection API keys are **encrypted at rest** (AES-256-GCM) with a per-install master key kept in `data/.secret` (auto-generated, mode `0600`). The API never returns a stored key — responses include `hasKey` + a masked preview (e.g. `sk-abc1…xyz`) — and it is only ever decrypted server-side for the run it belongs to. A job may use a stored connection (`POST /api/jobs` with `llmConnectionId`) **or** an inline `llm` override, never both (400 otherwise).

### Profiles — multi-profile manager

The **Profile** page (`/profile`) manages structured **candidate profiles**: personal info
(first/last name, headline, phone, location, LinkedIn/GitHub/portfolio), work authorization,
total experience, employment preference, experience entries (with per-line bullets), education,
skills (grouped into categories), projects, certifications and languages.

- The **first profile you create becomes the master** — the default candidate for new debates.
- Profiles can be edited, deleted (the last one cannot be), or promoted to master; a **PIN**
  (scrypt-hashed server-side) can be attached to a profile to gate set-as-master actions.
- A selected profile's structured fields are **merged into the resume template** before the
  committee rewrite, so generation is profile-driven rather than resume-text-driven alone.

### Resume page — explicit handoff + template library + generated resumes

The **Resume Generation** page (`/resume`) is where resumes are produced. Pick a completed
run (or arrive via the "Proceed to Resume Generation" handoff on a finished run page), optionally
choose a role template, and generate on demand — the blueprint is applied, the ATS keyword gap is
fed into the generator, and an elite quality auditor moderates the output. Below the generator the
page shows the browsable **template library** (all 32 role templates grouped by category — AI & ML,
Data Science & Analytics, Software Engineering, Cloud & Data Engineering, Product & Business,
Marketing & Strategy, Security) and your generated resumes with role, keyword-overlap %, and auditor
score. Selecting a template pre-fills the SME Panel form (role + domain) — or deep-link with
`?role=<slug>&domain=<domain>`.

---

## CLI (no server)

```powershell
pnpm debate -- --jd samples/fintech-jd.md --resume samples/candidate-resume.md `
  --domain SWE --mock --out samples/rewritten-resume.md
```

## Tests & checks

```powershell
pnpm test        # vitest: api 246 + web 23 + shared suite - pipeline stages, routes, webhooks, exports
pnpm typecheck   # tsc + astro check (3/3)
pnpm run build   # turbo build (3/3)
pnpm e2e         # functional suite: all 3 provider wire formats over real HTTP + full API/SSE flow
pnpm smoke:routes# prod-build route smoke (every page 200)
```

## Docker (self-host)

```powershell
docker compose up --build    # builds api + web; optionally adds ollama
# api on :8787 · web on :4321
```

---

## Architecture (summary)

```
 Browser (Astro SSR app, :4321)
    |  HTTP + SSE
    v
 Hono API (:8787)   security chain: CORS -> headers -> body limit -> auth -> audit -> rate limit
    |
    v
 Job queue (in-memory, or Redis for multi-instance)     POST /api/jobs -> 202 immediately
    |
    v
 Worker pool (concurrent loops, crash-safe)
    |
    v
 Committee orchestrator
    jdMeta -> job decomposition -> panel weights -> 360-degree openings -> cross-talk
    -> ballot -> weighted consensus -> blueprint -> director audit -> executive review
    -> gap analysis
    |
    |-- LLM layer: provider adapters (OpenAI-compatible / Anthropic / Gemini | offline mock)
    |-- SQLite (WAL): jobs, profiles, connections, webhooks | indexes + transactions
    |
    v
 Event bus (in-process with replay, or Redis pub/sub fan-out)
    |                                     |
    v                                     v
 SSE stream (live debate UI)       outbound webhooks (HMAC-signed, retried, SSRF-guarded)

 On-demand generation (explicit handoff, never automatic):
    resume (32 role templates + ATS + moderator loop) -> cold email -> interview mock
```

Full detail: [docs/architecture.md](docs/architecture.md) - [docs/how-it-works.md](docs/how-it-works.md).

---

## API surface

| Method | Path | Description |
|---|---|---|
| GET | `/health` | liveness probe: `{ ok, service, db, llm }`; 503 on DB failure; bypasses auth + rate limiting |
| POST | `/api/jobs` | `{ domain?, roleSlug?, profileId?, jobDescription, baseResume, sectorFocus?, location?, llm?, llmConnectionId? }` → 202 + job (see BYOK below); `llm` and `llmConnectionId` are mutually exclusive; `roleSlug` locks the role instead of auto-detecting; `profileId` attaches a candidate profile (defaults to the master); `location` (e.g. "London, UK") drives the US/UK English variant |
| GET | `/api/jobs` | compact list |
| GET | `/api/jobs/:id` | full state (transcript, jdMeta, analyses, verdict, blueprint, rewritten resume) |
| GET | `/api/jobs/:id/stream` | SSE live events (`job`, `entry`, `status`, `phase`, `jdMeta`, `jobDecomposition`, `analysis`, `director`, `verdict`, `blueprint`, `executive`, `gapAnalysis`, `resume`, `coverLetter`, `coldEmail`, `interview`, `done`, `error`, `ping`) |
| POST | `/api/jobs/:id/resume/generate` | on-demand resume handoff: `{ roleSlug?, llm?, llmConnectionId? }` → `{ markdown, json, meta }`; 400 unless the job is `completed` with a blueprint |
| PUT | `/api/jobs/:id/resume` | persist manual resume JSON edits; server re-renders the markdown |
| POST | `/api/jobs/:id/cold-email` | `{ audience? ("recruiter"\|"founder"\|"hiring_manager"), targetName?, tone?, llm?, llmConnectionId? }` → cold-email `{ subject, body }` draft |
| POST | `/api/jobs/:id/interview-mock` | `{ llm?, llmConnectionId? }` → 5-expert `InterviewPrepPlan` (pipeline, per-expert expectations/drills, topics, tips) |
| DELETE | `/api/jobs/:id` | 204 / 404 |
| GET/PUT | `/api/profile` | legacy single profile (`{ name, email }`) — maps to the master profile |
| GET/POST | `/api/profiles` | list / create candidate profiles (first becomes master) |
| GET/PUT | `/api/profiles/:id` | read / update a profile |
| PUT | `/api/profiles/:id/master` | set-as-master (optional `pin`) |
| PUT | `/api/profiles/:id/pin` | set / change the profile PIN |
| DELETE | `/api/profiles/:id` | 204 (last profile → 400; deleting master promotes the oldest) |
| GET | `/api/resume/templates` | the 32-template catalog (grouped by category) |
| GET/POST | `/api/resumes` | list / create saved resume (`{ title, content }`) |
| PUT/DELETE | `/api/resumes/:id` | update / delete saved resume |
| GET/POST | `/api/jds` | list / create saved job description (`{ title, content }`) |
| PUT/DELETE | `/api/jds/:id` | update / delete saved JD |
| GET/POST | `/api/llm-connections` | list / create stored connection (`{ name, provider, baseUrl?, model?, temperature?, apiKey?, isDefault? }`) — key stored encrypted, response has `hasKey` + `keyPreview` only |
| PUT/DELETE | `/api/llm-connections/:id` | update (omit `apiKey` to keep the stored one) / delete |
| GET/POST/PUT/DELETE | `/api/webhooks` | tenant-scoped outbound webhook CRUD; deliveries are HMAC-SHA256-signed, retried (3x), SSRF-guarded; secrets encrypted at rest and never returned |
| GET | `/api/exports` | auto-saved dossiers (discussion + resume files) with job summary metadata |
| GET | `/api/exports/:jobId/:file` | download one dossier artifact (PDF-ready markdown/JSON) |
| DELETE | `/api/exports/:jobId` | delete a dossier from disk (the run row is kept) |
| GET | `/api/storage` | all runs grouped by candidate profile, then company + role |

## Environment reference

See `.env.example` and [docs/architecture.md §10](docs/architecture.md).

| Var | Default | Purpose |
|---|---|---|
| `API_PORT` | `8787` | API port |
| `LLM_PROVIDER` | `mock` | provider name — `openai`, `anthropic`, `google`, `deepseek`, `kimi`, `grok`, `groq`, `qwen`, `openrouter`, `ollama`, `vllm`, `lmstudio`, `localai`, `custom`, `mock`; unknown name = OpenAI-compatible |
| `LLM_BASE_URL` | per-provider default | override base URL (required for `custom`) |
| `LLM_API_KEY` | provider env var | override key; else falls back to `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` / `DEEPSEEK_API_KEY` / `MOONSHOT_API_KEY` / `XAI_API_KEY` / `GROQ_API_KEY` / `DASHSCOPE_API_KEY` / `OPENROUTER_API_KEY` |
| `LLM_MODEL` | per-provider default | override model id (required when a preset has no default, e.g. `vllm`) |
| `LLM_TEMPERATURE` | `0.3` | sampling temperature |
| `DEBATE_CROSS_TALK_ROUNDS` | `2` | cross-talk passes |
| `AGENT_MAX_RETRIES` | `2` | redress re-prompts |
| `DATABASE_PATH` | `./data/rattle-snake.db` | SQLite file |
| `CORS_ORIGINS` | empty | comma list; empty = allow all |
| `PUBLIC_API_URL` | `http://localhost:8787` | web→api base URL |

> The API writes a per-install master key to `data/.secret` (next to the SQLite file) the first time it starts; it is used to encrypt stored LLM API keys. Back it up together with the database, and never commit it.

---

## Repository layout

```
packages/shared   # types, Zod schemas, domain + role committees (pure data), prompt builders
apps/api          # Hono backend: runner (jdMeta → SME panel/debate → blueprint → resume handoff), outreach (cold email), interview mock, LLM client, SQLite store, SSE routes, CLI
apps/web          # Astro SSR UI (React islands): NewJobForm, JobList, DebateView (+ SME panel, ColdEmailPanel, InterviewMockPanel), ResumeGenerator, ProfilesView, TemplateLibrary
docs/             # how-it-works, PRD, architecture, feature tracker, roadmap, strategy, sprint tracker
samples/          # sample JD + resume + rewritten output
```

## Roadmap

The next minor release (v2.1.0) is fully designed and queued; each phase lands independently with the whole gate green:

- **Cold-email content engine** - first-person candidate voice, user-selected angle/tone/audience/length, narrative driven by committee insights, and a deterministic voice gate (no third-person drafts, no tech laundry lists).
- **Resume A/B iteration** - generate v1, evaluate it against the same job description with a 3-reviewer panel, generate v2 that addresses the findings, score both versions fairly, show the side-by-side comparison, and let you pick the winner.
- **SaaS foundations** - user accounts (users / orgs / sessions / roles with scrypt password hashing), a login page behind a feature flag for one release, and a versioned JSON envelope plus input/output adapter registry for plug-and-play integrations.
- **UI** - one run workspace with a visible stage tracker, a resume comparison view, a single Export Center (PDF / DOCX / TXT / MD including the full expert discussion), and professional polish: simple vocabulary, no decorative artwork, pages that render smoothly even when the API is down.

Full phase plan: [docs/roadmap.md](docs/roadmap.md). Longer-term: job application auto-fill (browser extension), job-board aggregation with committee-based match scoring, and an all-in-one application tracker.

## Project status

Core pipeline **complete and verified end-to-end** (JD metadata, job decomposition, 360-degree SME analyses, debate, verdict, blueprint, explicit resume handoff, live SSE) with a **multi-provider LLM layer** (OpenAI, Anthropic, Google, DeepSeek, Kimi, Grok, GroQ, Qwen, Ollama, OpenRouter, and any OpenAI-compatible endpoint) plus V1 parity: 32-template library, multi-profile manager with master + PIN (up to 7 per account), PDF/DOCX/TXT/MD downloads. The **v2.0 systems upgrade** is in: async queue + worker execution (memory or Redis, at-least-once with crash recovery), an event bus with replay and Redis fan-out, HMAC-signed SSRF-guarded outbound webhooks, a structured audit log, tenant isolation on every table, and a security middleware chain (API-key auth with secure production defaults, rate limiting, body limits). Remaining production-readiness items - user accounts, real-LLM validation, Playwright e2e - are tracked in [docs/feature-tracker.md](docs/feature-tracker.md), [docs/sprint-tracker.md](docs/sprint-tracker.md) and [docs/roadmap.md](docs/roadmap.md).

## License

MIT.
