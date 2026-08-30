# Rattle-Snake V2 — Architecture

> **Last updated:** 2026-08-29 - Technical spec behind `docs/PRD.md`. Implementation status per requirement: `docs/feature-tracker.md`. End-to-end walkthrough: `docs/how-it-works.md`. Covers the v2.0 systems upgrade (queue/worker, event bus, webhooks, audit log, security middleware, tenant isolation) in section 14.

---

## 1. System overview

A monorepo (pnpm + Turborepo) with three packages. The backend runs a multi-stage pipeline per job — JD metadata extraction → role-driven SME panel (per-seat 360-degree scored analyses) → cross-talk debate → **Director fairness audit** (Layer 2, with limited teeth) → confidence-weighted consensus → blueprint → **explicit on-demand resume handoff** (Layer 3, a pure Blueprint consumer) — streaming every state change to the Astro frontend over Server-Sent Events, persisting each job to SQLite.

```
┌─────────────────────────────────────────────────────────────┐
│                 Frontend (Astro 5 SSR)                       │
│  - Sidebar: Dashboard · SME Panel · Resume Generation ·      │
│    Profile · Settings                                        │
│  - SME Panel form (domain/role/profile/sector/LOC/BYOK/      │
│    enhancement tier)                                         │
│  - Live SSE: JD metadata card + SME panel (per-seat 360      │
│    analyses) + transcript / verdict / blueprint / resume     │
│    + ExportBar (PDF/DOCX/TXT)                                │
│  - Run page: "Proceed to Resume Generation" handoff CTA      │
│  - Job page: ColdEmailPanel + InterviewMockPanel             │
│  - React islands: NewJobForm, JobList, DebateView,           │
│    ResumeGenerator, ColdEmailPanel, InterviewMockPanel,      │
│    LlmPicker, ProfilesView, TemplateLibrary                  │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTP / SSE
┌────────────────────────────▼────────────────────────────────┐
│              Backend API (Node 22 + Hono)                   │
│  - createApp(): store + llm + cors + routes                 │
│  - restart-recovery for orphaned jobs                       │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│               Pipeline Orchestrator (Core)                  │
│  - extractJdMeta(): company/role/sector/location/team       │
│  - getCommitteeForDomain(domain, sector, roleSlug)          │
│  - selectPanelForLevel(): level-aware seats + forced topics │
│  - runDebate(): R1 openings = 360 analyses → 2× cross-talk  │
│    → final ballot                                           │
│  - aggregateVotes(): confidence-weighted consensus          │
│    (High 1.0 / Med 0.7 / Low 0.4) + tiebreak                │
│  - executeAgentTurn(): opening JSON + non-neutrality redress│
│  - runDirectorReview(): fairness audit + ONE targeted       │
│    re-ballot (never flips the verdict alone)                │
│  - extractBlueprint(): LLM-first, rule-based fallback       │
│  - generateSophisticatedResume(): on-demand handoff only,   │
│    shared core rules + role prompt + blueprint-as-contract  │
│    + enhancement tier + audit trail + moderator, markdown   │
│  - generateColdEmail(): killer outreach draft (WS-11)       │
│  - generateInterviewMock(): 5-expert interview plan (WS-12) │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
               ▼                              ▼
┌──────────────────────────┐    ┌──────────────────────────────┐
│   Agent Definitions      │    │  LLM Provider Layer          │
│  (pure data + prompts)   │    │  llm/client.ts → dispatcher  │
│  packages/shared/agents  │    │  ├ openaiCompatible.ts       │
│  (domain + roleCommittees)│   │  │   (OpenAI, DeepSeek, Kimi, │
│  + personas.ts           │    │  │    Grok, GroQ, Qwen,       │
└──────────────────────────┘    │  │    OpenRouter, Ollama,     │
                                │  │    vLLM, LM Studio, any)   │
                                │  ├ anthropic.ts  (Messages)   │
                                │  ├ google.ts     (Gemini)     │
                                │  └ mock.ts       (offline)    │
                                └──────────────────────────────┘
               │
               ▼
┌──────────────────────────┐
│   State Store            │
│  - SQLite (better-sqlite3│
│    WAL), jobs + profiles │
│    + saved resumes/JDs + │
│    llm_connections       │
│  - in-process event bus  │
└──────────────────────────┘
```

## 2. Monorepo layout

```
rattle-snake-v2/
├── package.json                # turbo scripts; onlyBuiltDependencies
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json          # strict + noUncheckedIndexedAccess
├── .env.example
├── samples/                    # sample JD + resume + rewritten output
├── docs/                       # how-it-works, PRD, strategy, feature-tracker, architecture, roadmap
├── packages/shared/            # @rattlesnake/shared — pure data + types + prompts
│   └── src/
│   ├── types.ts            # Domain, AgentConfig, JobState, TranscriptEntry, JdMeta, SmeAnalysis, Blueprint, UserProfile, JobEvent
│   ├── validation.ts       # Zod schemas (createJob, profiles, blueprint, jdMeta, smeAnalysis, sme opening, transcript entry)
│   ├── prompts.ts          # buildAgentSystemPrompt (non-neutrality + confidence + inflation), jdMeta + decomposition + blueprint + director + exec-review prompts
│   ├── personas.ts         # templated IC / Sector Specialist persona builders (Layer 1)
│   ├── agents/             # swe.ts · dataAi.ts · finance.ts · roleCommittees.ts · index.ts
│   └── sectors.ts          # curated sector registry (Sector Specialist composition) + isSpecificSector()
└── apps/
    ├── api/                    # @rattlesnake/api — Hono backend (port 8787)
    │   ├── src/
    │   │   ├── index.ts        # serve + graceful shutdown
    │   │   ├── app.ts          # createApp(): wiring, CORS, restart recovery
    │   │   ├── config.ts       # env → AppConfig
    │   │   ├── llm/            # provider layer (FR-6)
    │   │   │   ├── client.ts   #   createLLMClient() dispatcher + preset resolution
    │   │   │   ├── types.ts    #   LLMClient interface (complete(system, user, opts))
    │   │   │   ├── presets.ts  #   provider registry (base URL, model, key env, wire format)
    │   │   │   ├── openaiCompatible.ts · anthropic.ts · google.ts · mock.ts · util.ts
    │   │   ├── events/bus.ts   # in-process pub/sub (SSE source)
    │   │   ├── db/store.ts     # better-sqlite3 store (jobs, profiles, saved, connections)
│   │   ├── committee/      # jdMetaExtractor, jobDecomposition, nonNeutrality (decision + confidence + inflation parsing),
│   │   │                   # agentExecutor (opening JSON), debateEngine (confidence-weighted votes), directorReview (fairness audit),
│   │   │                   # blueprintExtractor, executiveReview, runner
│   │   ├── resume/         # engine, core (shared rules), roleRegistry, merge, sanitize, screening, ats,
│   │   │                   # moderator, json, serialize, locale, profile, prompts/, templates/
│   │   ├── outreach/       # coldEmail.ts (WS-11 killer-intro generator + fallback)
│   │   ├── interview/      # mock.ts (WS-12 5-expert interview planner + fallback)
│   │   └── routes/         # health.ts, jobs.ts (+ SSE + cold-email + interview-mock), settings.ts
    │   └── cli/                # debate.ts, functional-test.ts, fake-llm.ts
    └── web/                    # @rattlesnake/web — Astro SSR (port 4321)
        ├── astro.config.mjs    # output: server, @astrojs/node standalone
        └── src/
            ├── layouts/Layout.astro   # persistent sidebar navigation
            ├── pages/          # index→dashboard, dashboard, sme-panel, resume, profile, settings, jobs/[id]
            ├── components/     # NewJobForm, JobList, DebateView (JD meta card + SME panel),
            │                   # ResumeGenerator, ColdEmailPanel, InterviewMockPanel, LlmPicker,
            │                   # ProfilesView, TemplateLibrary (React)
            └── lib/            # api.ts, providers.ts, export/ (types, normalize, to-pdf, to-docx, to-plaintext)
```

## 3. Core domain model

```ts
type Domain = "SWE" | "DATA_AI" | "FINANCE";
type Decision = "HIRE" | "REJECT";              // forced non-neutral vote
type Verdict = "SHORTLISTED" | "REJECTED";       // consensus outcome
type JobStatus = "pending" | "debating" | "completed" | "failed";
type Confidence = "High" | "Medium" | "Low";      // per-seat evidence strength
type EnhancementTier = "conservative" | "balanced" | "competitive";

interface AgentConfig {
  name: string; role: string; focus: string;
  domain: Domain; isSectorSpecialist?: boolean;
  level?: string;               // level-aware panel adjustment (Layer 1)
  weight?: number;               // consensus weight (default 1)
  tone?: string;                 // UI shade
}

interface TranscriptEntry {
  id: string; sender: string; role: string;
  round: number | "ballot";
  text: string; decision?: Decision; decisionReason?: string;
  confidence?: Confidence;       // added for ballot/cross-talk turns
  createdAt: string;
}

interface JdMeta {            // WS-13 JD metadata (LLM-first, rule fallback)
  company: string; role: string; sector: string; location: string;
  team?: string; roleSlug?: string;
}

interface SmeFactorScore {    // WS-13 one scored factor of a 360 analysis
  factor: string; score: number;   // 0–5
  note: string;
}

interface SmeAnalysis {       // WS-13 structured opening of one seat
  seat: string; role: string; fitScore: number;   // 0–10
  factors: SmeFactorScore[]; strengths: string[]; concerns: string[];
  decision: Decision; decisionReason: string; pivotFactor: string;
  confidence?: Confidence;        // High 1.0 / Medium 0.7 / Low 0.4 weight
  inflatedClaims?: string[];      // un-evidenced claims the seat flagged
}

interface Blueprint {
  objections: string[]; strengths: string[];
  requiredChanges: string[]; sectorNotes: string[];
  pivotFactors: string[]; verdicts: Record<string, Decision>;
  consensus: Verdict;
  inflatedClaims?: string[];          // panel-flagged claims resume MUST soften
  jdRequirements?: JdRequirement[];   // { requirement, tier: must|preferred|aspirational }
}

interface DirectorAudit {        // Layer 2 fairness audit (limited teeth)
  passes: boolean; findings: string[];
  revoteFactor?: string;         // ONE targeted re-ballot factor, when needed
  needsHumanReview?: boolean;    // advisory flag only
}

interface JobState {              // ONE per candidate evaluation (isolation)
  id: string; domain: Domain; roleSlug?: string; profileId?: string;
  jobDescription: string; baseResume: string; sectorFocus?: string; jobLocation?: string;
  transcript: TranscriptEntry[]; jdMeta?: JdMeta; analyses?: SmeAnalysis[];
  finalVerdict?: Verdict;
  directorAudit?: DirectorAudit;
  blueprint?: Blueprint; rewrittenResume?: string; rewrittenResumeJson?: string;
  resumeMeta?: ResumeMeta;        // locale/variant/roleSlug/tier + enhancements audit trail
  status: JobStatus; error?: string; createdAt: string; updatedAt: string;
}

interface ResumeEnhancement {    // controlled enhancement audit trail
  original: string; enhanced: string; justification: string;
}

interface ColdEmailDraft {        // WS-11 killer outreach
  subject: string; body: string;
}

interface InterviewPrepPlan {     // WS-12 5-expert interview mock
  role: string; candidateName?: string;
  pipeline: InterviewPhase[];     // { name, focus, experts[] }
  prepTips: string[];
  // experts: { name, role, focus, expectations[], drillQuestions[], redFlags[] }
}
```

Live channel — `JobEvent` union (`status | entry | jdMeta | analysis | director | verdict | blueprint | resume | done | error`). See `packages/shared/src/types.ts`.

Candidate profiles are `UserProfile` (structured: `personalInfo`, `experience[]`, `education[]`, `skills[]`, `certifications[]`, `projects[]`, `totalWorkExperience`, `workAuthorization`, `isMaster`, `hasPin`, …) — see `docs/how-it-works.md` §3 for the data model.

## 4. Design principles

1. **Agents are pure data + prompt functions** (`AgentConfig` + `buildAgentSystemPrompt`). No class holds memory; all memory lives in the shared `JobState.transcript`.
2. **Three clean layers** — personas evaluate only (Layer 1), the Director audits fairness with limited teeth (Layer 2), the resume agent consumes the Blueprint (Layer 3). No prompt or model call mixes debate and rewriting; the Director can trigger ONE targeted re-ballot but never flips a verdict alone.
3. **Single shared LLM interface, many provider adapters** — every provider implements `complete(system, user, opts)` from `apps/api/src/llm/types.ts`. `createLLMClient()` (dispatcher) picks the adapter by `LLM_PROVIDER`: OpenAI-compatible family, native Anthropic Messages, native Gemini `generateContent`, or offline `mock`. Presets (base URL, model, key env var, wire format) live in `presets.ts`; `LLM_BASE_URL` / `LLM_MODEL` / `LLM_API_KEY` override them, and unknown provider names fall back to a generic OpenAI-compatible endpoint (FR-6).
4. **Strong job isolation** — every evaluation is its own `JobState` + SQLite row; a crash mid-debate loses only in-flight turns (restart recovery marks orphans `failed`).
5. **Forced non-neutrality is enforced twice** — in the system prompt (laws 1–4) AND by parsing (`parseDecision`) with a redress re-prompt loop; ultimate fallback inherits the agent's prior vote. Confidence (High/Medium/Low) is parsed per turn and folded into the vote weights.
6. **Domain templates are data** — adding a domain = one new file in `packages/shared/src/agents/`.

## 5. Pipeline flow (per job)

```
POST /api/jobs
   │  resolve domain + role: body.domain ?? body.roleSlug ?? detectDomain/resolveRoleSlug(jd)
   │  committee = getCommitteeForDomain(domain, sectorFocus, roleSlug)   // role-driven when slug present
   │  selectPanelForLevel(committee, jdLevel, baseTitle)                  // level-aware seats + forced topics
   ▼
runCommittee(jobId)                 runner.ts
   ├─ setStatus("debating")
   ├─ extractJdMeta(job, llm)      jdMetaExtractor.ts (LLM-first, rule fallback)
   │    → stored as job.jdMeta + SSE "jdMeta" event; backfills job.jobLocation
   │      when absent; committee re-selected with jdMeta.sector
   ├─ runDebate(job, agents, llm)  debateEngine.ts
   │   ├─ R1 openings      : N × executeAgentTurn(phase="opening")
   │   │                     opening = structured 360 JSON (smeOpeningResponseSchema);
   │   │                     parse success ⇒ authoritative, no neutrality redress;
   │   │                     each analysis → job.analyses + SSE "analysis" event
   │   │                     (now carries confidence + inflatedClaims)
   │   ├─ R2 cross-talk    : N× (order alternates) — executeAgentTurn("crosstalk")
   │   └─ R3 ballot        : N × executeAgentTurn("ballot", temp 0.2)
   ├─ aggregateVotes()     : score = Σ(HIRE weight×confidence)/Σ(all weights×confidence)
   │                        confidence: High 1.0 · Med 0.7 · Low 0.4
   │                        >0.5 SHORTLISTED · <0.5 REJECTED · =0.5 tiebreak by highest-weight seat
   ├─ publish verdict event
   ├─ runDirectorReview()  : directorReview.ts — fairness checklist; if a finding is
   │   │                     material, ONE targeted re-ballot on that factor, then
   │   │                     recompute consensus (can never flip HIRE/REJECT alone)
   │   └─ → stored as job.directorAudit + SSE "director" event
   ├─ extractBlueprint()   : LLM JSON → Zod validate → rule-based fallback → repair
   │                        (now includes inflatedClaims + jdRequirements tiers)
   ├─ setStatus("completed") → publish "done"
   │    (NO resume rewrite — resume generation is a separate explicit handoff)
   └─ on error → setStatus("failed") → publish "error"

POST /api/jobs/:id/resume/generate     routes/jobs.ts (explicit on-demand handoff)
   └─ 400 unless status === "completed" && blueprint
      generateSophisticatedResume(job, blueprint, llm, profile?, roleSlug?, tier?)
       shared core rules + role prompt + blueprint-as-contract (inflatedClaims to soften,
       jdRequirements tiers) + enhancement tier (conservative/balanced/competitive)
       + variant directive + screening checklist + candidate bio + pre-merged template JSON
       + enhancements audit trail
       → LLM JSON → sanitize → ATS re-score → moderator loop (max 2, incl. over-enhancement audit)
       → markdown + JSON
      → persisted as rewrittenResume/rewrittenResumeJson/resumeMeta + SSE "resume"
```

Every mutation persists via `store.update(job)` and publishes to the SSE bus, so the UI streams live.

## 6. Non-neutrality enforcement chain

```
LLM response text
   │
   ▼
parseDecision(text)              nonNeutrality.ts
   ├─ bracketed markers  [STRONG HIRE/REJECT] · [DECISION: ...] · [VERDICT: ...]
   ├─ "STRONG HIRE/REJECT" plain
   ├─ last-400-char keyword tally (hire vs reject)
   └─ whole-text keyword scoring (safety net)
   │  + hasNeutralLanguage(text): flags "neutral/average/maybe/on the fence..."
   │  + parseConfidence(text):   High / Medium / Low (objective anchors)
   │  + parseInflatedClaims(text): INFLATED_CLAIM: lines → string[]
   ▼
executeAgentTurn                 agentExecutor.ts
   └─ if unparsed OR neutral → re-prompt with REDRESS_PROMPT (≤ AGENT_MAX_RETRIES)
      └─ still failing → fallback: lastVote(agent) ?? "REJECT"
   └─ confidence + inflatedClaims stored on TranscriptEntry / SmeAnalysis;
      confidence feeds aggregateVotes (High 1.0 / Med 0.7 / Low 0.4)
```

## 7. API surface

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | `{ ok, service, db, llm:{provider,model} }`; 503 when the DB probe fails; bypasses auth + rate limiting (liveness probe) |
| POST | `/api/jobs` | `{ domain?, roleSlug?, profileId?, jobDescription, baseResume, sectorFocus?, location?, generate? (incl. enhancementTier?), llm?, llmConnectionId? }` → 202 + job |
| GET | `/api/jobs` | compact, tenant-scoped list served from a lean SQL projection (`transcriptLength`, artifact booleans; heavy blobs never parsed) |
| GET | `/api/jobs/:id` | full state (incl. `directorAudit`) |
| GET | `/api/jobs/:id/stream` | SSE — snapshot `job`, then `entry/status/jdMeta/analysis/director/verdict/blueprint/resume/done/error/ping` |
| PUT | `/api/jobs/:id/resume` | persist hand-edited resume JSON; re-render markdown server-side |
| POST | `/api/jobs/:id/resume/generate` | explicit on-demand handoff — `{ roleSlug?, enhancementTier?, llm?, llmConnectionId? }` → 404 unknown; 400 unless `completed` + blueprint, or on `llm` xor `llmConnectionId` conflict; persists `rewrittenResume`/`rewrittenResumeJson`/`resumeMeta` (with enhancements audit trail), publishes `resume` event, returns `{ markdown, json, meta }` |
| POST | `/api/jobs/:id/cold-email` | `{ audience?, targetName?, tone?, llm?, llmConnectionId? }` → `ColdEmailDraft` (subject + body) — BYOK or stored connection, else server config |
| POST | `/api/jobs/:id/interview-mock` | `{ llm?, llmConnectionId? }` → `InterviewPrepPlan` (5-expert plan) — BYOK or stored connection, else server config |
| DELETE | `/api/jobs/:id` | 204 / 404 |
| GET | `/api/resume/templates` | the 32-template catalog (grouped by category) |
| GET/POST | `/api/profiles` | list / create candidate profiles (first is master) |
| GET/PUT | `/api/profiles/:id` | read / update a profile |
| PUT | `/api/profiles/:id/master` | set-as-master (optional `pin`) |
| PUT | `/api/profiles/:id/pin` | set / change profile PIN |
| DELETE | `/api/profiles/:id` | 204 (last → 400; deleting master promotes the oldest) |
| GET/PUT | `/api/profile` | legacy single profile (maps to master) |
| GET/POST | `/api/resumes` · `/api/resumes/:id` | saved resumes |
| GET/POST | `/api/jds` · `/api/jds/:id` | saved job descriptions |
| GET/POST | `/api/llm-connections` · `/api/llm-connections/:id` | stored connections (keys encrypted at rest) |
| GET/POST/PUT/DELETE | `/api/webhooks` | tenant-scoped webhook CRUD (`url`, `events`, optional signing secret stored encrypted at rest and never returned; URLs SSRF-guarded) |
| (dispatcher) | - | every published job event is delivered to matching tenant webhooks: HMAC-SHA256 `X-Webhook-Signature`, 10s timeout, 3 attempts with backoff |

## 8. Prompt contracts

- **Agent system prompt** (`packages/shared/src/prompts.ts`): structured pure-evaluation persona — `IDENTITY` (level-aware) → `EVALUATION LENS` → `MANDATORY DISCUSSION TOPICS` (level calibration, sector/domain transferability, achievement density & verifiability, missing critical experiences, factor-weighting risk) → `INFLATED-CLAIM PROTOCOL` → `FORBIDDEN` → JD → resume → transcript → phase block → engagement laws → `OUTPUT FORMAT` (`[STRONG POSITIVES] / [HIGH-RISK CONCERNS] / [DEBATE RESPONSE] / [PIVOT POINT] / [VERDICT] [STRONG HIRE|REJECT]` + `[CONFIDENCE]` High/Medium/Low with objective anchors + `INFLATED_CLAIM:` lines). Openings additionally request a structured 360 JSON block (with `confidence` + `inflatedClaims`) that `agentExecutor.ts` parses via `smeOpeningResponseSchema` (JSON authoritative → no redress; parse failure falls back to the text markers + redress loop).
- **Templated personas** (`packages/shared/src/personas.ts`): `buildIcPersonaPrompt` / `buildSectorSpecialistPrompt` generate seat personas at runtime (level, discipline, domain, sector) — no hard-coded per-level persona files.
- **JD metadata prompt** (`buildJdMetaPrompt`): JD → JSON matching `JdMeta`, with a rule-based fallback extractor.
- **Director audit prompt** (`buildDirectorPrompt`): the 360 analyses + transcript → `DirectorAudit` (fairness checklist + optional one targeted re-ballot factor). Advisory-only teeth: the verdict is never flipped by the Director alone.
- **Blueprint prompt**: transcript → JSON matching the `Blueprint` schema (now incl. `inflatedClaims` + `jdRequirements` tiers).
- **Resume composition (Layer 3)**: shared core rules (`apps/api/src/resume/core.ts`) + role prompt (32) + blueprint-as-contract (`inflatedClaims` to soften, `jdRequirements` must/preferred justify enhancement) + enhancement tier (Conservative/Balanced/Competitive with 3-minute interview defensibility) → LLM JSON with an `enhancements` audit trail → sanitize → ATS re-score → moderator loop (max 2, incl. over-enhancement audit) → Markdown. Never fabricates; `[ADD: ...]` placeholders for missing evidence.

## 9. Frontend behavior

- Persistent **sidebar** (`Layout.astro`): Dashboard `/dashboard`, SME Panel `/sme-panel`, Resume Generation `/resume`, Profile `/profile`, Account Settings `/settings`; legacy redirects `/` → `/dashboard`, `/jobs` → `/dashboard`, `/debate` → `/sme-panel`.
- `NewJobForm.tsx` — domain cards, **role template picker** (32, grouped by category, `?role=`/`?domain=` deep-link), **candidate profile picker** (defaults to master), optional `sectorFocus`, job location (US/UK English), saved JD/resume loaders, and BYOK panel; POST → redirect to `/jobs/:id`.
- `DebateView.tsx` — SSE stream on mount (snapshot replay + live events), JD metadata card (company/role/sector/location), **SME panel** of per-seat 360 analyses (fit score badge, scored factors, strengths, concerns, decision + reason, pivot factor), groups transcript by round with **bolded positives/negatives**, verdict card with tallies/ballot, blueprint sections, and — when `completed` with a blueprint — a **"Proceed to Resume Generation" handoff CTA** linking to `/resume?job=<id>`. Below it, `ColdEmailPanel.tsx` (audience / recipient name / tone → subject + body draft with copy + regenerate) and `InterviewMockPanel.tsx` (5-expert pipeline, per-expert `<details>` cards with expectations/drills/red flags, topic tags, prep tips) are mounted; all use the shared `LlmPicker.tsx` BYOK selector (stored connection or inline override, mutually exclusive).
- Dashboard (`dashboard.astro`) — hero + `NewJobForm client:load`; below it `JobList.tsx` indexes runs by profile with delete/clear; empty state links to `/sme-panel`.
- `ResumeGenerator.tsx` (resume page) — job picker (only `completed` + blueprint runs, `?job=` deep-link), template groups by category with `roleSlug` defaulting to the job's role, enhancement-tier selector (conservative/balanced/competitive), BYOK `LlmPicker`, generate call → meta badge (incl. enhancement count) + Markdown preview + link to `/jobs/<id>`.
- `ProfilesView.tsx` (multi-profile manager with master + PIN), `TemplateLibrary.tsx` (categorized catalog, links to `/sme-panel?role=...`), `ResumeHistory.tsx` (empty state links to `/sme-panel`), `JobList.tsx`.

## 10. Config reference

| Env | Default | Purpose |
|---|---|---|
| `API_PORT` | `8787` | API port |
| `LLM_PROVIDER` | `mock` | provider name — see §11 provider table |
| `LLM_BASE_URL` | per-provider | override base URL (required for `custom`/unknown) |
| `LLM_API_KEY` | provider key env | override key; falls back to `OPENAI_API_KEY`/`ANTHROPIC_API_KEY`/`GEMINI_API_KEY`/`DEEPSEEK_API_KEY`/`MOONSHOT_API_KEY`/`XAI_API_KEY`/`GROQ_API_KEY`/`DASHSCOPE_API_KEY`/`OPENROUTER_API_KEY` |
| `LLM_MODEL` | per-provider | override model id (required when preset has none, e.g. `vllm`) |
| `LLM_TEMPERATURE` | `0.3` | sampling temperature |
| `DEBATE_CROSS_TALK_ROUNDS` | `2` | cross-talk passes |
| `AGENT_MAX_RETRIES` | `2` | redress re-prompts |
| `DATABASE_PATH` | `./data/rattle-snake.db` | SQLite file |
| `CORS_ORIGINS` | empty | comma list; empty = allow all |
| `EXPORTS_DIR` | `./data/exports` | dossier output directory |
| `MAX_BODY_SIZE_BYTES` | `262144` | request body limit |
| `REQUIRE_API_KEY` | on when `NODE_ENV=production` | require `X-API-Key` on every request |
| `API_KEYS` / `API_KEYS_FILE` | empty | API key map JSON (`{ key: { tenantId, keyId } }`); file path wins |
| `TRUST_PROXY` | `false` | trust `X-Forwarded-For` / `X-Real-IP` for client IP detection |
| `RATE_LIMIT_REQUESTS` | `60` prod / `0` dev | requests per window per tenant+key+IP (0 disables) |
| `RATE_LIMIT_WINDOW_MS` | `60000` | rate limit window |
| `REDIS_URL` | empty | enables Redis-backed queue + event bus for multi-instance scale-out |
| `QUEUE_DRIVER` | `memory` (auto `redis` with `REDIS_URL`) | queue implementation |
| `QUEUE_CONCURRENCY` | `4` | concurrent worker loops |
| `AUDIT_LOG_LEVEL` | `info` prod / `debug` dev | pino audit log level |
| `AUDIT_PRETTY` | on in dev | pretty-print audit log (JSON lines when off) |
| `NODE_ENV` | unset | `production` flips secure defaults on (auth, rate limit) |
| `PUBLIC_API_URL` | `http://localhost:8787` | web→api base URL |

## 11. Multi-provider LLM layer (FR-6)

`LLM_PROVIDER` selects the adapter. Presets encode the native wire format, auth scheme, default base URL, default model, and the provider's standard key env var; `LLM_BASE_URL` / `LLM_MODEL` / `LLM_API_KEY` override, and any unknown provider name acts as `custom` (OpenAI-compatible).

| `LLM_PROVIDER` | Wire format | Default base URL | Default model | Key env fallback | Requires key |
|---|---|---|---|---|---|
| `openai` | OpenAI-compatible | `https://api.openai.com/v1` | `gpt-4o-mini` | `OPENAI_API_KEY` | yes |
| `anthropic` | Anthropic Messages | `https://api.anthropic.com` | `claude-sonnet-4-5` | `ANTHROPIC_API_KEY` | yes |
| `google` | Gemini `generateContent` | `https://generativelanguage.googleapis.com` | `gemini-2.5-flash` | `GEMINI_API_KEY`, `GOOGLE_API_KEY` | yes |
| `deepseek` | OpenAI-compatible | `https://api.deepseek.com/v1` | `deepseek-chat` | `DEEPSEEK_API_KEY` | yes |
| `kimi` | OpenAI-compatible | `https://api.moonshot.cn/v1` | `kimi-k2-0905-preview` | `MOONSHOT_API_KEY`, `KIMI_API_KEY` | yes |
| `grok` | OpenAI-compatible | `https://api.x.ai/v1` | `grok-3-mini` | `XAI_API_KEY`, `GROK_API_KEY` | yes |
| `groq` | OpenAI-compatible | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` | `GROQ_API_KEY` | yes |
| `qwen` | OpenAI-compatible | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` | `DASHSCOPE_API_KEY`, `QWEN_API_KEY` | yes |
| `openrouter` | OpenAI-compatible | `https://openrouter.ai/api/v1` | `openai/gpt-4o-mini` | `OPENROUTER_API_KEY` | yes |
| `ollama` | OpenAI-compatible | `http://localhost:11434/v1` | `llama3.1` | — | no |
| `vllm` | OpenAI-compatible | `http://localhost:8000/v1` | *(none — set `LLM_MODEL`)* | — | no |
| `lmstudio` | OpenAI-compatible | `http://localhost:1234/v1` | *(none — set `LLM_MODEL`)* | — | no |
| `localai` | OpenAI-compatible | `http://localhost:8080/v1` | *(none — set `LLM_MODEL`)* | — | no |
| `custom` / any unknown | OpenAI-compatible | *(required)* | *(required)* | `LLM_API_KEY` | no |
| `mock` | — | — | `mock-response-1` | — | no |

Resolution order for the API key: `LLM_API_KEY` → provider key-env fallback → empty. Cloud presets fail fast with an actionable error if no key is present; the request uses `Authorization: Bearer <key>` (OpenAI-compatible), `x-api-key` + `anthropic-version` (Anthropic), or `?key=` (Gemini).

## 12. Post-P1 subsystems

- **Role-driven committees (WS-4)** — `packages/shared/src/agents/roleCommittees.ts` maps all 32 role slugs to 5-seat committees; `getCommitteeForDomain(domain, sectorFocus, roleSlug)` prefers the role committee and composes the Sector Specialist persona from `sectorFocus` (`sectors.ts` registry). Role resolution: explicit `roleSlug` → JD title signal → keyword overlap → flagship fallback. Level-aware adjustment: `selectPanelForLevel` adds a Principal/Staff seat for Staff/Principal JDs and forces a "level inflation" topic when the base resume title outclaims the candidate band (`AgentConfig.level`, IC personas templated in `personas.ts`).
- **JD metadata + 360 SME panel (WS-13)** — `apps/api/src/committee/jdMetaExtractor.ts` runs an LLM-first extractor (rule-based fallback) producing `JdMeta` (company/role/sector/location/team); it backfills `job.jobLocation` and re-selects the committee with `jdMeta.sector` when no explicit `sectorFocus`. Round-1 openings are structured 360 analyses (`smeOpeningResponseSchema`, `packages/shared/src/validation.ts`): parseable JSON is authoritative (skips neutrality redress), prose falls back to `parseDecision` + redress; each `SmeAnalysis` is stored in `job.analyses` and streamed as an SSE `analysis` event. Each analysis now carries `confidence` + `inflatedClaims` (`nonNeutrality.ts`), and the Director (`directorReview.ts`, `buildDirectorPrompt`) audits fairness with one targeted re-ballot trigger. The advisory stage (`advisoryExtractor.ts`, `buildAdvisoryPrompt`, `AdvisoryReport`, `/advisory`, `AdvisoryView`) was removed in this restructure.
- **Resume engine (WS-1/WS-9/WS-13)** — `apps/api/src/resume/`: `core.ts` holds the shared rewriting rules (C-A-R, skill split, JD triage, anti-bot) injected before the per-role prompts so the 32 files stay thin overlays; `merge.ts` pre-merges the source text into the template (placeholder bullets force a rewrite); `profile.ts` (`applyProfileToTemplate`, `buildProfileBio`) layers the selected candidate profile; `screening.ts` injects the role's minimum-bar checklist ("FLOOR, not ceiling"); `engine.ts` enforces the controlled enhancement policy (Conservative/Balanced/Competitive tiers + `enhancements` audit trail in `resumeMeta`); `moderator.ts` adds typography, qualification, screening AND over-enhancement audits; `sanitize.ts` is the single typography/emoji sanitizer used by resumes and transcripts. Generation runs only on-demand via `POST /api/jobs/:id/resume/generate` (400 unless `completed` + blueprint); the pipeline never rewrites automatically, and the run page's handoff CTA plus the Resume page generator (job + template + tier + BYOK) drive it.
- **Profiles · templates · downloads (WS-6)** — `profiles` table (structured `UserProfile`, master + scrypt PIN, legacy row migrated on first open), `jobs.profile_id` linking; `GET /api/resume/templates` catalog; `apps/web/src/lib/export/` client-side `to-pdf`/`to-docx`/`to-plaintext` (lazy-loaded) with format × preset × page options.
- **Cold-email killer intro (WS-11)** — `apps/api/src/outreach/coldEmail.ts` builds a prompt from the role template, JD, confirmed strengths, and recipient (`audience` × `tone` × `targetName`) → LLM JSON → `coldEmailSchema` → rule-based fallback (`buildFallback`); output sanitized (no smart quotes/dashes) by the shared typography rule. Shared `LlmPicker.tsx` supplies BYOK (inline `llm` xor stored `llmConnectionId`).
- **5-expert interview mock (WS-12)** — `apps/api/src/interview/mock.ts` dispatches on each committee seat's `tone` (recruiter / architect / lead / manager / default) to plan the typical phases, per-expert expectations, drill questions and red flags from the JD; LLM JSON → `interviewPrepPlanSchema` → `buildRulesBased` fallback → `sanitizePlan`.

## 13. Known architecture notes / evolution hooks

- **Event bus is abstracted** (`events/`): in-process memory bus with a 200-event replay buffer for late SSE subscribers, or Redis pub/sub fan-out when `REDIS_URL` is set (section 14).
- **Runs execute through the queue + worker** (`queue/`, `worker/runner.ts`), never inside the HTTP request; retries, dead-lettering, and crash recovery are built in (section 14).
- **Structured JSON output** (`response_format`) is a low-risk upgrade to replace text parsing where the backend supports it.
- **Persistent store is SQLite**; schema is JSON-transcript based, so Postgres migration is mechanical.


---

## 14. SaaS execution layer (v2.0 systems upgrade)

How one run flows through the execution layer:

```
 POST /api/jobs
    |
    v
 security middleware (CORS -> headers -> body limit -> auth -> audit -> rate limit)
    |
    v
 202 Accepted  --->  queue (in-memory list, or Redis LPUSH with BRPOPLPUSH ack)
                          |
                          v
                    worker loops (N concurrent)  -- dequeue -> run -> ack (LREM)
                          |
                          v
                    runCommittee stages
                          |  every stage: store.update (SQLite WAL) + bus.publish
                          v
                    event bus (memory replay buffer | Redis pub/sub)
                          |                     |
                          v                     v
                   SSE stream (browser)   webhook dispatcher (HMAC, 3 retries, SSRF-guarded)

 Crash safety: Redis payloads sit in a processing list until acked and are requeued
 by recover() at boot; orphaned pending/debating rows are failed at startup; each
 pipeline stage persists its artifact before the next stage begins, so a retried
 job resumes from persisted state.
```


### 14.1 Queue + worker

- `apps/api/src/queue/`: `Queue` interface with memory and Redis drivers (`QUEUE_DRIVER`; Redis is selected automatically when `REDIS_URL` is set). The Redis queue is at-least-once: dequeue atomically moves the payload to a processing list (`BRPOPLPUSH`), the payload is acked (`LREM`) only on complete/fail, retries go back to the queue, exhausted jobs land in a dead-letter list, and boot-time `recover()` requeues anything stranded in the processing list after a crash.
- `apps/api/src/worker/runner.ts`: N concurrent loops (`QUEUE_CONCURRENCY`, default 4). The loop survives queue outages (dequeue retries with backoff; `queue.fail` failures are logged, never fatal) and `stop(timeout)` bounds shutdown. `apps/api/src/index.ts` closes worker, queue, and store in order on SIGINT/SIGTERM.
- Job type `committee` carries the full pipeline; chained generation runs inside the pipeline, so no job is lost on restart.

### 14.2 Event bus

- `apps/api/src/events/`: `EventBus` interface with two implementations chosen by config. The memory bus keeps a 200-event replay ring buffer per job so late SSE subscribers catch up after the move to async processing. The Redis bus fans out across instances via pub/sub.
- `GET /api/jobs/:id/stream` subscribes before the liveness check and treats `pending`/`debating` jobs as active, so events published between POST and stream-connect are never missed.

### 14.3 Webhooks

- `webhooks` table, tenant-scoped; CRUD at `/api/webhooks`. Signing secrets are AES-256-GCM encrypted at rest (same scheme as LLM keys) and never returned by the API (only `hasSecret`).
- `apps/api/src/webhooks/dispatcher.ts`: HMAC-SHA256 signature header `X-Webhook-Signature`, 10s per-attempt timeout, 3 attempts with exponential backoff. `apps/api/src/webhooks/validate.ts` blocks SSRF targets (loopback, RFC1918, link-local, cloud metadata; public http(s) only).
- Dispatch is wired at the bus layer in `app.ts`: every published event reaches matching tenant webhooks; failures are audit-logged (`webhook.dispatch_failed`) and never block the pipeline. Tenant lookups are memoized per job.

### 14.4 Security middleware chain (order matters)

`cors -> securityHeaders -> bodyLimit -> auth -> auditContext -> rateLimit`

- CORS runs before auth so browser preflight (no credentials) never 401s; `PATCH` is in `allowMethods`.
- Auth: `X-API-Key` + `X-Tenant-ID`. `REQUIRE_API_KEY` defaults ON when `NODE_ENV=production` (explicit opt-out honored). Keys load from `API_KEYS` JSON or `API_KEYS_FILE`.
- Rate limiting: in-memory buckets keyed tenant+key+IP with periodic eviction; client IP is the socket address unless `TRUST_PROXY=true`; disabled by default outside production.
- `/health` bypasses auth and rate limiting for liveness probes and returns 503 when the store health probe fails.

### 14.5 Tenant isolation

- Every domain table carries `tenant_id` (jobs, profiles, saved resumes/JDs, LLM connections, webhooks); `NULL` rows are legacy/shared and visible to all tenants for backward compatibility.
- All store methods accept an optional `tenantId` and scope every read/write (`tenant_id = ? OR tenant_id IS NULL`); routes resolve the tenant from the auth context. `/api/exports` and `/api/storage` are scoped like every other router.

### 14.6 Data layer hardening

- Indexes on hot columns (`jobs.tenant_id/status/created_at`, `profiles.is_master`, `webhooks.tenant_id`); `PRAGMA user_version = 3` marks the applied migration set.
- Multi-step mutations (master profile switch, profile delete + reassignment, default LLM connection switch) run inside transactions.
- `gap_analysis` and `amendment_notes` are persisted with the job (previously lost on read-back).

### 14.7 LLM HTTP hardening

- Every provider adapter sends through `llm/util.ts fetchLlm`: 120s per-attempt timeout, 3 attempts with exponential backoff on network errors and 408/429/5xx, numeric `Retry-After` honored (capped at 15s). Non-retryable failures throw `LlmHttpError` with provider context.
- Silent LLM fallbacks now log warnings with job context; provider outages are visible in logs instead of degrading invisibly.

### 14.8 Product limits

- Up to 7 candidate profiles per tenant (`MAX_PROFILES_PER_TENANT`); over-limit creates return 400 with a clear message.
- Dashboard and storage listings read from a lean SQL projection (`listRunSummaries`): transcript length and artifact booleans are computed in SQLite, so large blobs are never deserialized for list views.
