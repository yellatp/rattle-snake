# AGENTS.md - Rattle-Snake V2

> **Single source of truth for all AI assistants and team members.**
> Read this file before answering any queries, writing code, or making architectural changes.

---

## Project Overview

Rattle-Snake V2 is a self-hosted, multi-agent hiring committee system that runs domain-aware debates with forced non-neutral verdicts and objection-clearing resume rewrites. It uses a monorepo (pnpm + Turborepo) with a Hono API backend, Astro/React frontend, and a shared types/prompts package.

---

## Golden Rules

1. **Strict TypeScript** — `strict: true`, `noUncheckedIndexedAccess: true`, `verbatimModuleSyntax: true`. No `any` types. No `as` casts unless documented and justified.
2. **No emojis in code or commits** unless explicitly requested.
3. **No comments** in source code unless explicitly requested.
4. **Shared build first** — Always run `pnpm --filter @rattlesnake/shared build` before any API or web typecheck/build/test.
5. **Gate sequence after ANY change:**
   ```
   pnpm --filter @rattlesnake/shared build
   npx tsc -p tsconfig.json --noEmit          # in apps/api
   pnpm --filter @rattlesnake/api exec vitest run
   npx astro check                             # in apps/web
   pnpm --filter @rattlesnake/web exec vitest run
   pnpm e2e
   pnpm smoke:routes
   ```
6. **Windows environment** — Use PowerShell `Select-String`, NOT `rg` (not installed). Use `2>&1 | Out-File` for vitest output capture.
7. **ASCII check** — After any shared/web change, verify no special chars slipped in: search `apps/web/src` for `[\u2014\u2013\u2026\u2192\u00A0]`. Only `·` is allowed (max 4 pre-existing comment hits).
8. **Commit only when explicitly asked.** Never commit secrets or keys.

---

## Environment & Commands

### Prerequisites
- Node.js >= 22.0.0
- pnpm 10.33.2 (via `packageManager` field)

### Core Commands (from project root)

| Command | What it does |
|---|---|
| `pnpm dev` | Start all dev servers (API + web) |
| `pnpm dev:api` | Start API server only (tsx watch on port 8787) |
| `pnpm dev:web` | Start Astro dev server only (port 4321) |
| `pnpm build` | Build all packages via Turborepo |
| `pnpm typecheck` | Typecheck all packages |
| `pnpm test` | Run all tests |
| `pnpm e2e` | Run API functional tests (`tsx cli/functional-test.ts`) |
| `pnpm smoke:routes` | Run web smoke route tests |
| `pnpm --filter @rattlesnake/shared build` | Build shared package (run FIRST) |
| `pnpm --filter @rattlesnake/api exec vitest run` | Run API tests |
| `pnpm --filter @rattlesnake/web exec vitest run` | Run web tests |

### Per-Package Commands

**`apps/api`:**
- `pnpm dev` — `tsx watch src/index.ts`
- `pnpm build` — `tsc -p tsconfig.json`
- `pnpm typecheck` — `tsc -p tsconfig.json --noEmit`
- `pnpm test` — `vitest run`
- `pnpm e2e` — `tsx cli/functional-test.ts`

**`apps/web`:**
- `pnpm dev` — `astro dev`
- `pnpm build` — `astro build`
- `pnpm typecheck` — `astro check`
- `pnpm test` — `vitest run`
- `pnpm smoke` — `node scripts/smoke-routes.mjs`

**`packages/shared`:**
- `pnpm build` — `tsc -p tsconfig.json`
- `pnpm typecheck` — `tsc -p tsconfig.json --noEmit`
- `pnpm test` — `vitest run`

---

## Directory Structure

```
Rattle-Snake-V2/
  apps/
    api/                        # Hono + Node.js backend
      src/
        committee/              # Pipeline orchestration
          runner.ts             # Main pipeline (stages 1-10)
          agentExecutor.ts      # Agent turn execution + opening parser
          debateEngine.ts       # Debate rounds (openings, cross-talk, ballot)
          blueprintExtractor.ts # Blueprint extraction from transcript
          gapAnalysis.ts        # Gap analysis extraction (Phase O)
          generateChain.ts      # Chained auto-generation
        llm/                    # LLM client abstraction
          mock.ts               # Offline mock client for testing
          types.ts              # LLMClient interface
        resume/                 # Resume generation
          engine.ts             # Committee-driven resume builder
          core.ts               # Core + enhancement directives
          moderator.ts          # Over-enhancement audit
        routes/                 # API routes
          jobs.ts               # Job CRUD + SSE streaming
        events/
          bus.ts                # Event bus (JobEvent types)
      cli/                      # CLI tools (functional-test, debate)
    web/                        # Astro + React frontend
      src/
        components/             # React components
          DebateView.tsx        # Main debate UI + transcript
          GapAnalysisCard.tsx   # Gap analysis display
          StorageView.tsx       # Storage list
          StorageViewer.tsx     # Per-run detail
          JobList.tsx           # Job listing
        lib/
          api.ts                # API client
          export/               # Transcript/document exports
        styles/
          global.css            # Global styles
  packages/
    shared/                     # Shared types, validation, prompts
      src/
        types.ts                # All core types (JobState, DebatePhase, etc.)
        validation.ts           # Zod schemas
        prompts.ts              # Prompt builders
        personas.ts             # IC template system
        export/
          transcript.ts         # Transcript exports (MD, HTML, JSON, TXT)
  docs/                         # Product/governance documentation
```

---

## Key Architectural Concepts

### Pipeline Phases (in order)
1. JD Meta — Parse job description metadata
2. Job Decomposition — Extract requirements, skills, constraints
3. Panel Assembly — Select and configure committee agents
4. Debate — Openings (360 analysis) -> Cross-talk -> Ballot
5. Blueprint — Extract structured candidate assessment
6. Director Audit — Quality gate on blueprint
7. Executive Review — Final senior-level assessment
8. Gap Analysis — Must-have/nice-to-have gaps, suggestions
9. Completed — Pipeline finished
10. (Optional) Chained Auto-Generation — Resume creation

### LLMClient Interface
```typescript
interface LLMClient {
  readonly provider: string;
  readonly model: string;
  complete(system: string, user: string, opts?: ChatOptions): Promise<string>;
}
// NOT chat({messages}) — uses positional string args
// ChatOptions = { temperature?: number; maxTokens?: number }
```

### Prompt Output Contract
- First line: `You are ${agent.name}, acting as the ${agent.role}.`
- Required sections: `[STRONG POSITIVES]` / `[HIGH-RISK CONCERNS]` / `[DEBATE RESPONSE]` / `[PIVOT POINT]` / `[VERDICT]` / `[CONFIDENCE]` / `[SECTOR & TRANSFERABILITY]`
- `INFLATED_CLAIM:` lines for flagged claims
- Decision must be forced: `[STRONG HIRE]` or `[STRONG REJECT]` (no neutrality)

### Resume Generation
- Decoupled from committee run
- Triggered via `POST /api/jobs/:id/generate-resume` or auto-chained
- `generateSophisticatedResume(job, blueprint, llm, profile)` reads `job.gapAnalysis` and `job.amendmentNotes`
- Mock routing: first-line `"senior resume writer"` triggers resume generation
- Moderator routing: `"resume quality auditor"` triggers over-enhancement audit

---

## Team AI Prompting Convention

When using any AI assistant on this project, start your prompt with:

> "Read AGENTS.md and implement..."

This ensures the assistant loads the correct context before writing code.

### Tool-Specific Pointers
- **Cursor:** Reads `.cursorrules` which points to `AGENTS.md`
- **Claude Code:** Reads `CLAUDE.md` which points to `AGENTS.md`
- **GitHub Copilot:** Reads `.github/copilot-instructions.md` which points to `AGENTS.md`
- **Gemini:** Reads `Gemini.md` which points to `AGENTS.md`

---

## Testing Strategy

- **Unit tests:** Vitest in each package (`pnpm test`)
- **E2E tests:** `pnpm e2e` (API functional tests via `tsx cli/functional-test.ts`)
- **Smoke tests:** `pnpm smoke:routes` (web route verification)
- **Mock client:** `createMockClient()` for offline testing — deterministic, correctly-formatted responses
- **ASCII validation:** Post-build check for special Unicode characters in web source

---

## Common Pitfalls

1. **Forgetting shared build** — API/web imports from `@rattlesnake/shared`. Always build shared first.
2. **Vitest `--reporter=basic`** — Fails on Windows with `ERR_LOAD_URL`. Use default reporter and capture via `2>&1 | Out-File`.
3. **`rg` not installed** — Use PowerShell `Select-String` for grep operations.
4. **Opening JSON parsing** — LLMs may return valid JSON that doesn't match strict schemas. Always have a lenient fallback (see `agentExecutor.ts`).
5. **Mock resume routing** — `mockResponseFor` checks first line. Don't change the first line of `core.ts` without updating the mock.
6. **Phase tracker** — When adding new pipeline phases, update `currentPhase()` in `DebateView.tsx` and add the phase to `DebatePhase` union in `types.ts`.
