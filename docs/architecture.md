# Rattle-Snake V2 — Architecture

> **Last updated:** 2026-08-12 · Technical spec behind `docs/PRD.md`. Implementation status per requirement: `docs/feature-tracker.md`.

---

## 1. System overview

A monorepo (pnpm + Turborepo) with three packages. The backend runs a long-lived multi-agent debate per job, streaming every state change to the Astro frontend over Server-Sent Events, persisting each job to SQLite.

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (Astro 5 SSR)                  │
│  - Upload/paste JD + Resume                                 │
│  - Select Domain / override Sector Focus                    │
│  - Live SSE debate transcript / verdict / blueprint /       │
│    rewritten resume                                         │
│  - React islands: NewJobForm, JobList, DebateView           │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTP / SSE
┌────────────────────────────▼────────────────────────────────┐
│              Backend API (Node 22 + Hono)                   │
│  - createApp(): store + llm + cors + routes                 │
│  - restart-recovery for orphaned jobs                       │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│               Committee Orchestrator (Core)                 │
│  - runCommittee(): state machine, publishes JobEvents       │
│  - runDebate(): R1 openings → 2× cross-talk → final ballot  │
│  - aggregateVotes(): weighted consensus (+0.5 tiebreak)     │
│  - executeAgentTurn(): non-neutrality enforcement + redress │
│  - extractBlueprint(): LLM-first, rule-based fallback       │
│  - rewriteResume(): objection-clearing Markdown             │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
               ▼                              ▼
┌──────────────────────────┐    ┌──────────────────────────────┐
│   Agent Definitions      │    │   LLM Client (single shared) │
│  (pure data + prompts)   │    │  openai SDK → baseURL to     │
│  packages/shared/agents  │    │  Ollama/vLLM/LocalAI or MOCK │
└──────────────────────────┘    └──────────────────────────────┘
               │
               ▼
┌──────────────────────────┐
│   State Store            │
│  - SQLite (better-sqlite3│
│    WAL), one row per job │
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
├── docs/                       # PRD, strategy, feature-tracker, architecture, roadmap
├── packages/shared/            # @rattlesnake/shared — pure data + types + prompts
│   └── src/
│       ├── types.ts            # Domain, AgentConfig, JobState, TranscriptEntry, Blueprint, JobEvent
│       ├── validation.ts       # Zod schemas (createJob, job, blueprint, transcript entry)
│       ├── prompts.ts          # buildAgentSystemPrompt (non-neutrality), blueprint + rewriter prompts
│       └── agents/             # swe.ts · dataAi.ts · finance.ts · index.ts (DOMAIN_COMMITTEES)
└── apps/
    ├── api/                    # @rattlesnake/api — Hono backend (port 8787)
    │   ├── src/
    │   │   ├── index.ts        # serve + graceful shutdown
    │   │   ├── app.ts          # createApp(): wiring, CORS, restart recovery
    │   │   ├── config.ts       # env → AppConfig
    │   │   ├── llm/client.ts   # OpenAI-compatible client + mock provider
    │   │   ├── events/bus.ts   # in-process pub/sub (SSE source)
    │   │   ├── db/store.ts     # better-sqlite3 JobStore
    │   │   ├── committee/      # nonNeutrality, agentExecutor, debateEngine,
    │   │   │                   # blueprintExtractor, resumeRewriter, runner
    │   │   └── routes/         # health.ts, jobs.ts (+ SSE stream)
    │   └── cli/debate.ts       # headless runner (pnpm debate)
    └── web/                    # @rattlesnake/web — Astro SSR (port 4321)
        ├── astro.config.mjs    # output: server, @astrojs/node standalone
        └── src/
            ├── layouts/Layout.astro
            ├── pages/          # index, jobs/index, jobs/[id]
            ├── components/     # NewJobForm, JobList, DebateView (React)
            └── lib/api.ts      # fetch client + PUBLIC_API_URL
```

## 3. Core domain model

```ts
type Domain = "SWE" | "DATA_AI" | "FINANCE";
type Decision = "HIRE" | "REJECT";              // forced non-neutral vote
type Verdict = "SHORTLISTED" | "REJECTED";       // consensus outcome
type JobStatus = "pending" | "debating" | "rewriting" | "completed" | "failed";

interface AgentConfig {
  name: string; role: string; focus: string;
  domain: Domain; isSectorSpecialist?: boolean;
  weight?: number;               // consensus weight (default 1)
  tone?: string;                 // UI shade
}

interface TranscriptEntry {
  id: string; sender: string; role: string;
  round: number | "ballot";
  text: string; decision?: Decision; decisionReason?: string;
  createdAt: string;
}

interface Blueprint {
  objections: string[]; strengths: string[];
  requiredChanges: string[]; sectorNotes: string[];
  pivotFactors: string[]; verdicts: Record<string, Decision>;
  consensus: Verdict;
}

interface JobState {              // ONE per candidate evaluation (isolation)
  id: string; domain: Domain;
  jobDescription: string; baseResume: string; sectorFocus?: string;
  transcript: TranscriptEntry[]; finalVerdict?: Verdict;
  blueprint?: Blueprint; rewrittenResume?: string;
  status: JobStatus; error?: string; createdAt: string; updatedAt: string;
}
```

Live channel — `JobEvent` union (`status | entry | verdict | blueprint | resume | done | error`). See `packages/shared/src/types.ts`.

## 4. Design principles

1. **Agents are pure data + prompt functions** (`AgentConfig` + `buildAgentSystemPrompt`). No class holds memory; all memory lives in the shared `JobState.transcript`.
2. **Single shared LLM client** — `createLLMClient()` from `apps/api/src/llm/client.ts`. One OpenAI-compatible client; swap `baseURL` (Ollama/vLLM/LocalAI/llama.cpp/LM Studio) with no other code change. Offline `mock` provider produces schema-compliant output so the whole pipeline runs in CI/demos.
3. **Strong job isolation** — every evaluation is its own `JobState` + SQLite row; a crash mid-debate loses only in-flight turns (restart recovery marks orphans `failed`).
4. **Forced non-neutrality is enforced twice** — in the system prompt (laws 1–4) AND by parsing (`parseDecision`) with a redress re-prompt loop; ultimate fallback inherits the agent's prior vote.
5. **Domain templates are data** — adding a domain = one new file in `packages/shared/src/agents/`.

## 5. Debate flow (per job)

```
POST /api/jobs
   │  resolve domain: body.domain ?? detectDomain(jd) ?? "SWE"
   ▼
runCommittee(jobId)                 runner.ts
   ├─ setStatus("debating")
   ├─ runDebate(job, agents, llm)   debateEngine.ts
   │   ├─ R1 openings      : 5 × executeAgentTurn(phase="opening")
   │   ├─ R2 cross-talk    : N× (order alternates) — executeAgentTurn("crosstalk")
   │   └─ R3 ballot        : 5 × executeAgentTurn("ballot", temp 0.2)
   ├─ aggregateVotes()     : score = Σ(HIRE weights)/Σ(all weights)
   │                        >0.5 SHORTLISTED · <0.5 REJECTED · =0.5 tiebreak by highest-weight seat
   ├─ publish verdict event
   ├─ setStatus("rewriting")
   ├─ extractBlueprint()   : LLM JSON → Zod validate → rule-based fallback → repair
   ├─ rewriteResume()      : base + JD + blueprint + transcript → Markdown
   ├─ setStatus("completed") → publish "done"
   └─ on error → setStatus("failed") → publish "error"
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
   ▼
executeAgentTurn                 agentExecutor.ts
   └─ if unparsed OR neutral → re-prompt with REDRESS_PROMPT (≤ AGENT_MAX_RETRIES)
      └─ still failing → fallback: lastVote(agent) ?? "REJECT"
```

## 7. API surface

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | `{ ok, service, llm:{provider,model}, debate:{...} }` |
| POST | `/api/jobs` | `{ domain?, jobDescription, baseResume, sectorFocus? }` → 202 + job |
| GET | `/api/jobs` | compact list (`transcriptLength` instead of bodies) |
| GET | `/api/jobs/:id` | full state |
| GET | `/api/jobs/:id/stream` | SSE — snapshot `job`, then `entry/status/verdict/blueprint/resume/done/error/ping` |
| DELETE | `/api/jobs/:id` | 204 / 404 |

## 8. Prompt contracts

- **Agent system prompt** (`packages/shared/src/prompts.ts:34`): identity → JD → resume → transcript → phase block → 4 engagement laws (+ sector mandate for the specialist) → strict `OUTPUT FORMAT` (`[STRONG POSITIVES] / [HIGH-RISK CONCERNS] / [DEBATE RESPONSE] / [PIVOT POINT] / [VERDICT] [STRONG HIRE|REJECT]`).
- **Blueprint prompt** (`:93`): transcript → JSON matching the `Blueprint` schema.
- **Resume transformer** (`:124`): base + JD + blueprint + transcript → Markdown; resolve every objection; `[ADD: ...]` placeholders for missing evidence; never fabricate.

## 9. Frontend behavior

- `NewJobForm.tsx` — domain cards (pre-selected via `detectDomain` on JD blur), optional `sectorFocus`, sample loader, POST → redirect to `/jobs/:id`.
- `DebateView.tsx` — opens the SSE stream on mount (snapshot replay + live events), groups transcript by round, renders verdict card with tallies/ballot, blueprint sections, and the rewritten resume (Markdown via `marked`).
- `JobList.tsx` — lists runs with status pills.

## 10. Config reference

| Env | Default | Purpose |
|---|---|---|
| `API_PORT` | `8787` | API port |
| `LLM_PROVIDER` | `openai` | `openai` \| `mock` |
| `LLM_BASE_URL` | `http://localhost:11434/v1` | OpenAI-compatible endpoint |
| `LLM_API_KEY` | `ollama` | key (ignored by Ollama) |
| `LLM_MODEL` | `llama3.1` | model id |
| `LLM_TEMPERATURE` | `0.3` | sampling temperature |
| `DEBATE_CROSS_TALK_ROUNDS` | `2` | cross-talk passes |
| `AGENT_MAX_RETRIES` | `2` | redress re-prompts |
| `DATABASE_PATH` | `./data/rattle-snake.db` | SQLite file |
| `CORS_ORIGINS` | empty | comma list; empty = allow all |
| `PUBLIC_API_URL` | `http://localhost:8787` | web→api base URL |

## 11. Known architecture notes / evolution hooks

- **SSE bus is in-process** (`events/bus.ts`). Before scale-out: swap for Redis pub/sub (roadmap).
- **Debates run in the API process** fire-and-forget. For concurrency: semaphore first, then BullMQ+Redis worker.
- **Structured JSON output** (`response_format`) is a low-risk upgrade to replace text parsing where the backend supports it.
- **Persistent store is SQLite**; schema is JSON-transcript based, so Postgres migration is mechanical.
