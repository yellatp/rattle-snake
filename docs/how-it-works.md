# Rattle-Snake V2 — How It Works (end-to-end)

> **Last updated:** 2026-08-29 - A plain-language walkthrough of the current system. Runs now execute asynchronously: the API queues the run and a worker pool processes it while the page streams live over SSE.
> Companion docs: [PRD](PRD.md) · [Architecture](architecture.md) · [Feature tracker](feature-tracker.md) · [Strategy](strategy.md) · [Sprint tracker](sprint-tracker.md).

---

## 1. The 10-second summary

You paste a **job description** and a **candidate resume** (optionally attaching a saved
**candidate profile** and pinning a **role template**), pick a committee domain, and start the
run. The system then:

1. Extracts **JD metadata** (company, role, sector, location, team) and assembles a 5-seat
   **SME committee** specific to the role.
2. Runs a **360-degree panel**: every seat scores the candidate across role-specific factors
   and commits to a forced non-neutral decision.
3. Runs **cross-talk rounds** and a **weighted ballot** with forced non-neutral verdicts.
4. Produces a **Hiring Committee Blueprint** (objections → required changes).
5. Hands off: when the run completes you explicitly **generate the resume** against the
   blueprint — ATS re-scored and quality-moderated — never automatically.
6. Streams everything to the browser live over **SSE**, stores it in **SQLite**, and lets you
   **download** the final resume as **PDF / DOCX / TXT** in multiple styles.
7. The **Dashboard** lists every evaluation; the **SME Panel** page starts new ones.
8. On any finished run you can generate a **cold-email killer intro** (recruiter / founder /
   hiring manager) and a **5-expert interview mock** (typical phases, what each expert expects,
   how they will drill you from the JD, and the red flags they probe).

Everything works fully **offline** with a built-in mock LLM, and against any real model
(OpenAI, Anthropic, Gemini, DeepSeek, Ollama, and any OpenAI-compatible endpoint).

---

## 2. The pipeline, stage by stage

```
POST /api/jobs
   │   { domain?, roleSlug?, profileId?, sectorFocus?, location?, jd, resume, llm?, llmConnectionId? }
   ▼
1. RESOLUTION (jobs.ts + roleRegistry.ts)    status = "pending"
   │   role = explicit roleSlug  ??  resolveRoleSlug(domain, jd)   // title signal + keyword overlap
   │   profile = explicit profileId ?? master profile (if any)
   │   locale = jobLocation / JD markers -> "us" | "uk"
   ▼
2. JD METADATA  (jdMetaExtractor.ts)         status = "debating"
   │   LLM extracts { company, role, sector, location, team, roleSlug? }
   │   (rule-based fallback if the model fails) -> stored + SSE "jdMeta" event
   │   committee = getCommitteeForDomain(domain, sector, roleSlug)
   │   jobLocation <- jdMeta.location if the form left it blank
   ▼
3. SME PANEL + DEBATE  (debateEngine.ts)     status = "debating"
   │   5-seat committee (role-driven, sector-aware specialist)
   │   R1 openings  : 5 turns, each returns a structured 360 analysis
   │        { fitScore, factors (0-5), strengths, concerns, decision,
   │          decisionReason, pivotFactor }  -> SSE "analysis" per seat
   │   R2 cross-talk: 2 passes (configurable) of back-and-forth rebuttals
   │   R3 ballot    : 5 final votes (temperature 0.2)
   │   every turn: non-neutrality enforced in code (JSON parse + redress loop)
   ▼
4. CONSENSUS (aggregateVotes) + BLUEPRINT (blueprintExtractor.ts)
   │   weighted votes -> SHORTLISTED | REJECTED (0.5 tiebreak by seat weight)
   │   Blueprint { objections, strengths, requiredChanges, sectorNotes,
   │               pivotFactors, verdicts, consensus }   (LLM-first, rule-based fallback)
   ▼
5. HANDOFF — COMPLETED (status = "completed"; NO automatic resume rewrite)
   │   run page offers "Proceed to Resume Generation" ->
   ▼
6. RESUME  (POST /api/jobs/:id/resume/generate → resume/engine.ts)
   │   { roleSlug?, llm?, llmConnectionId? }   (only when status == "completed")
   │   a. gap analysis on the base resume vs the JD
   │   b. template = roleRegistry template  +  applyProfileToTemplate(profile)
   │   c. source text pre-merged into the template (bullets left as placeholders)
   │   d. system prompt = role prompt + English-variant directive + screening
   │        checklist + committee feedback (blueprint + up to 8 transcript excerpts)
   │   e. user prompt = JD + candidate profile bio + pre-merged template JSON +
   │        matched/missing keywords + tone
   │   f. llm.complete -> JSON -> sanitize -> ATS re-score -> quality moderator
   │        (max 2 iterations; rejection injects MODERATOR FEEDBACK and regenerates)
   │   g. serialize -> Markdown + editable JSON + meta (role / ATS% / auditor / locale)
   ▼
7. PERSIST + STREAM (runner.ts + routes/jobs.ts + events/bus.ts)
       status -> completed   (or failed with a recorded error)
       SSE: job · jdMeta · analysis · entry · status · verdict · blueprint · resume · done
   ▼
8. UI (web)   DebateView shows the JD metadata card, the live SME panel (per-seat
       analyses with factor scores), the transcript, verdict card, blueprint, and the
       rewritten resume (Markdown | JSON tabs) with ExportBar: format (modern|classic|plain)
       × preset (standard|minimalist|compact) × page (letter|a4) → PDF | DOCX | TXT downloads.
```

### Status flow

`pending → debating → completed` (or `failed`). Each transition is persisted and streamed; the UI
replays the current snapshot on load, then follows live events.

---

## 3. Data model

| Table | Holds |
|---|---|
| `jobs` | One row per evaluation: JD, base resume, domain, `roleSlug`, `jobLocation`, `profileId`, transcript (JSON), jdMeta (JSON), analyses (JSON), blueprint (JSON), rewritten resume JSON + markdown, `resumeMeta`, `llmUsed`, status, timestamps. |
| `profiles` | Candidate profiles. First created profile is the **master** (default for new runs). Structured `personalInfo` / `experience[]` / `education[]` / `skills[]` / `certifications[]` / `projects[]` / `totalWorkExperience` / `workAuthorization` / ... plus an optional scrypt-hashed **PIN** and `isMaster`. The legacy single profile migrates into the master automatically. |
| `saved_resumes` | Reusable resume text pasted back into the SME Panel form. |
| `saved_jds` | Reusable job descriptions. |
| `llm_connections` | Named LLM endpoints; API keys encrypted at rest (AES-256-GCM, per-install key in `data/.secret`); responses expose `hasKey` + a masked preview only. |
| `profile` (legacy) | Single-row name/email, mapped to the master profile. |

**Key types** (all in `packages/shared/src/types.ts`): `JobState`, `TranscriptEntry`,
`JdMeta`, `SmeAnalysis`, `SmeFactorScore`, `Blueprint`, `UserProfile` (+ `ProfilePersonalInfo`,
`ProfileExperience`, `ProfileSkillCategory`, ...), `ResumeTemplateInfo`, `SavedResume`, `SavedJd`,
`LlmConnection`, `ResumeMeta`, plus the per-application helper types `ColdEmailDraft`,
`ColdEmailAudience`, `InterviewPhase`, `InterviewExpertDrill`, `InterviewPrepPlan`.

### The resume JSON (editable, single source of truth)

```
{ role, slug, contact {name,email,phone,location,linkedin,github,portfolio},
  sections { summary, skills{categories}, experience[], education[],
             certifications[], projects[] },
  ats_keywords, changed_sections }
```

Editing the JSON on the job page persists it via `PUT /api/jobs/:id/resume` and re-renders the
Markdown **server-side** (the serializer is the only renderer).

---

## 4. Role-driven committees & sectors

- **32 role templates** (`apps/api/src/resume/roleRegistry.ts`) map to a concrete 5-seat
  committee (`packages/shared/src/agents/roleCommittees.ts`): Recruiter · Technical Specialist
  (role-specific focus) · Team Lead · Hiring Manager · **Sector Specialist**.
- Role resolution: explicit `roleSlug` wins; otherwise the JD **title signal** scores candidates,
  then **keyword overlap** against each role's `ats_keywords`; flagship fallback per domain.
- **JD metadata** (`apps/api/src/committee/jdMetaExtractor.ts`) runs first and feeds the UI and
  the pipeline: `extractJdMeta` asks the LLM for `{ company, role, sector, location, team }`
  (JSON → Zod → deterministic rule-based fallback), persists it as `job.jdMeta`, streams a
  `jdMeta` SSE event, and backfills `job.jobLocation` for the US/UK variant when the form left
  it blank. The sector + role from metadata select the committee.
- The **Sector Specialist** persona is composed at run time from `sectorFocus` (free text or the
  curated `SECTOR_REGISTRY`), so "ML Engineer" evaluations differ across audio, frontier
  research, fintech, healthcare, and more. Unknown sectors get a generic sector mandate.
- **360-degree analyses** — each opening turn returns structured JSON (`smeOpeningResponseSchema`):
  `fitScore`, scored `factors[]`, `strengths[]`, `concerns[]`, a forced `decision`, a one-line
  `decisionReason`, and the single `pivotFactor`. When the JSON parses it is authoritative (no
  re-prompting); on failure the prose path parses `[VERDICT]` lines and applies the neutrality
  redress loop. Every analysis is persisted in `job.analyses` and streamed as an `analysis` SSE
  event.

---

## 5. The resume rewrite engine (explicit handoff)

The debate never rewrites a resume. When a run is `completed` with a blueprint, `POST
/api/jobs/:id/resume/generate` (optionally `{ roleSlug, llm, llmConnectionId }`) runs the engine
on demand — from the Resume Generation page or the run page's "Proceed to Resume Generation" CTA.

Inputs: candidate profile (structured) + base resume + JD + role + blueprint + analyses + locale.

1. **Template selection** — the role's template (32 available, browsable on `/resume`); an
   explicit `roleSlug` overrides the run's detected role.
2. **Profile merge** — `applyProfileToTemplate` layers contact, summary headline, experience,
   skills and certifications from the selected profile over the template.
3. **Source merge** — `mergeSourceIntoTemplate` parses the pasted resume text into the template,
   leaving bullets as `[Experience details to be refined]` placeholders so the model **rewrites**
   rather than copies.
4. **Generation prompt** — role prompt + English-variant directive (US/UK) + screening checklist
   (FLOOR, not ceiling) + Hiring Committee Feedback (GAP report + expert excerpts) + the full
   user prompt (JD, profile bio, pre-merged template JSON, matched/missing keywords).
   Divergence is explicitly mandated; missing evidence becomes `[ADD: ...]` placeholders (never
   fabricated).
5. **Moderation loop** — the quality auditor scores the output (ATS overlap, banned phrases,
   typography: em-dashes/en-dashes deduct, un-evidenced skill claims deduct, screening checklist
   items). A rejected first pass regenerates once with `MODERATOR FEEDBACK`; cap is 2 iterations.
6. **Output** — Markdown + JSON + meta. The final text is sanitized (no em-dashes, smart quotes,
   ellipsis or emoji anywhere — resumes *and* debate transcripts). The result is persisted on the
   job and streamed as a `resume` SSE event.

---

## 6. LLM layer, BYOK, locale, sanitizer

- **One interface, many adapters** — `llm.complete(system, user, opts)`; adapters for
  OpenAI-compatible, native Anthropic Messages, native Gemini `generateContent`, and offline
  mock. Presets carry base URL / default model / key-env / wire format; unknown provider names
  fall back to a generic OpenAI-compatible endpoint (`custom`).
- **Bring-your-own-LLM** — per-run from the UI (provider, base URL, key, model, temperature,
  remembered in the browser) or via `POST /api/jobs { llm: {...} }`; keys are used in-memory and
  never persisted or returned. Saved connections (`llmConnectionId`) are encrypted at rest.
  `JobState.llmUsed` records which provider/model actually ran.
- **Locale detection** — explicit `location` field wins, then UK/US markers in the JD, else US;
  the role prompt is extended with a `US/UK English variant` directive (spelling, terminology,
  dates) and the moderator enforces it (−5 per wrong-variant word).
- **Sanitizer** (`apps/api/src/resume/sanitize.ts`) — `—`→", ", `–`→"-", smart quotes→straight,
  `…`→"...", emoji stripped. Runs on resume JSON, final markdown, and every debate transcript
  entry, so typographic characters never reach the UI or the downloads.
- **Downloads** (`apps/web/src/lib/export/`) — client-side `to-pdf` (jsPDF), `to-docx` (docx),
  `to-plaintext`; lazy-loaded via dynamic imports so the debate page stays light. Formats
  `modern | classic | plain`, presets `standard | minimalist | compact`, page `letter | a4`.
- **Cold-email killer intro** (`apps/api/src/outreach/coldEmail.ts`) — for any finished run,
  pick an audience (`recruiter | founder | hiring_manager`) and tone, optionally a recipient
  name. The prompt combines the role template, the JD, and the strengths the committee
  confirmed; the result is a short subject + body draft (LLM JSON → Zod → rule-based fallback,
  ASCII-hygiened). Nothing is persisted; hit **Regenerate** for another take.
- **5-expert interview mock** (`apps/api/src/interview/mock.ts`) — reuses the exact committee
  that debated the resume. Each seat's `tone` decides its interview persona (recruiter /
  architect / lead / manager / default). Output is an `InterviewPrepPlan`: the typical phases
  for that role, then for each of the 5 experts what they expect, the drill questions they will
  use to probe the JD, the red flags they hunt, plus topic tags and prep tips. Same
  LLM-JSON → Zod → rules-based fallback pipeline as the cold email.

---

## 7. API surface (current)

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | provider/model/debate config |
| POST | `/api/jobs` | create a run (`domain?`, `roleSlug?`, `profileId?`, `sectorFocus?`, `location?`, `llm?`, `llmConnectionId?`) → 202 |
| GET | `/api/jobs` | compact list |
| GET | `/api/jobs/:id` | full state (transcript, jdMeta, analyses, verdict, blueprint, resume) |
| GET | `/api/jobs/:id/stream` | SSE live events (`job`, `entry`, `status`, `jdMeta`, `analysis`, `verdict`, `blueprint`, `resume`, `done`, `error`) |
| POST | `/api/jobs/:id/resume/generate` | on-demand resume handoff `{ roleSlug?, llm?, llmConnectionId? }` → `{ markdown, json, meta }`; 400 unless `completed` with a blueprint |
| PUT | `/api/jobs/:id/resume` | persist manual JSON edits, re-render markdown |
| POST | `/api/jobs/:id/cold-email` | `{ audience?, targetName?, tone?, llm?, llmConnectionId? }` → `{ subject, body }` |
| POST | `/api/jobs/:id/interview-mock` | `{ llm?, llmConnectionId? }` → 5-expert `InterviewPrepPlan` |
| DELETE | `/api/jobs/:id` | 204 / 404 |
| GET/PUT | `/api/profile` | legacy single profile (maps to master) |
| GET/POST | `/api/profiles` | list / create profiles (first is master) |
| GET/PUT | `/api/profiles/:id` | read / update a profile |
| PUT | `/api/profiles/:id/master` | set-as-master (optionally with a PIN) |
| PUT | `/api/profiles/:id/pin` | set / change the profile PIN |
| DELETE | `/api/profiles/:id` | delete (last profile → 400; deleting master promotes the oldest) |
| GET | `/api/resume/templates` | the 32-template catalog (categorized) |
| GET/POST | `/api/resumes` · `/api/resumes/:id` | saved resumes |
| GET/POST | `/api/jds` · `/api/jds/:id` | saved job descriptions |
| GET/POST | `/api/llm-connections` · `/api/llm-connections/:id` | stored LLM connections (keys encrypted) |

---

## 8. Repo layout (what lives where)

```
packages/shared/   types + Zod + domain/role committees (pure data) + prompt builders
apps/api/          Hono backend: runner (jdMeta → SME panel/debate → blueprint →
                   resume handoff), debate engine, jdMeta extractor, blueprint,
                   resume engine (templates/prompts/ATS/moderator/locale/sanitize),
                   outreach/ (cold email), interview/ (interview mock),
                   LLM client, SQLite store, SSE routes, CLI + functional test
apps/web/          Astro SSR UI (sidebar): Dashboard, SME Panel (NewJobForm),
                   Resume (ResumeGenerator + TemplateLibrary + ResumeHistory),
                   Profile, Settings + React islands (DebateView + SME panel,
                   ColdEmailPanel, InterviewMockPanel) + export library
samples/           sample JD + resume + rewritten output
docs/              PRD, how-it-works, architecture, feature tracker, roadmap,
                   strategy, sprint tracker
```

---

## 9. Testing the system

| Command | What it verifies |
|---|---|
| `pnpm test` | 213 unit tests (shared 25 · api 178 · web 10): non-neutrality, consensus math, role committees, jdMeta extractor + 360-analysis openings, blueprint extractor, resume engine (role detection, locale, ATS, moderation loop, profile injection), cold email, interview mock, settings/profiles/jobs routes (incl. the resume handoff), export library |
| `pnpm typecheck` | tsc + astro check across all packages |
| `pnpm run build` | turbo build 3/3 |
| `pnpm e2e` | functional suite against fake LLM HTTP servers: all 3 wire formats × full pipeline + live SSE API flow |
| `pnpm smoke:routes` | all web routes render 200 in a prod build |

Run a real model offline-first: the default `LLM_PROVIDER=mock` needs zero config; set any
provider in `.env` (or per run in the UI) to use a real model.
