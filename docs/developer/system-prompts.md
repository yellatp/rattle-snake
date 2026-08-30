# System Prompts - Where They Live

Everything that shapes what the LLM says is in three places:

1. `packages/shared/src/prompts.ts` - the **committee (discussion)** prompts
   and the **Director audit** prompt (shared by API and web).
2. `packages/shared/src/personas.ts` - the **templated persona builders**
   (IC seats + conditional Sector Specialist) that feed the discussion prompts.
3. `apps/api/src/resume/prompts/*.ts` - **32 per-role** resume system prompts
   (one file per role), composed with the shared core rules in
   `apps/api/src/resume/core.ts`, plus the quality **moderator** prompt in
   `apps/api/src/resume/moderator.ts`.

The full design rationale is in `docs/developer/three-layer-committee.md`.

All paths are relative to the repository root.

---

## 1. Discussion / committee prompts

File: `packages/shared/src/prompts.ts`

| Builder | Line | Drives |
|---|---|---|
| `buildAgentSystemPrompt(agent, ctx, phase)` | `prompts.ts:80` | The core of the debate (Layer 1). One agent turn's system prompt for `opening`, `crosstalk`, and `ballot` phases. Structured as a pure-evaluation persona: `IDENTITY` (level-aware), `EVALUATION LENS`, `MANDATORY DISCUSSION TOPICS` (level calibration, sector/domain transferability, achievement density & verifiability, missing critical experiences, factor-weighting risk), `INFLATED-CLAIM PROTOCOL`, `FORBIDDEN` (soft language, un-evidenced claims, resume-rewriting talk), `OUTPUT`. Implements "Decisive Non-Neutrality": `[STRONG HIRE] | [STRONG REJECT]` plus `[CONFIDENCE]` (High/Medium/Low with objective anchors) and a single pivot factor. Includes the 360-degree JSON analysis contract for openings (now with `confidence` + `inflatedClaims`), the Sector Specialist mandate (when a specialist seat is present), the job-decomposition brief, and the engagement laws. |
| `buildIcPersonaPrompt(opts)` | `personas.ts` | Templated IC persona (level, discipline, domain, focus) - no hard-coded per-level persona files. |
| `buildSectorSpecialistPrompt(opts)` | `personas.ts` | Runtime-generated Sector Specialist persona from `jdMeta.sector`; only used when the sector is specific (see `sectors.ts` `isSpecificSector`). |
| `buildDirectorPrompt(input)` | `prompts.ts` | Layer 2 Director / Architect fairness audit (evidence-bar consistency, level calibration, groupthink, confidence inflation, sector handling, transferability) with ONE targeted re-ballot trigger - never a unilateral verdict flip. |
| `formatJobDecomposition(d?)` | `prompts.ts:28` | Renders the structured decomposition brief injected into agent prompts. |
| `formatTranscript(transcript)` | `prompts.ts:62` | Compact shared debate log injected into later turns. |
| `buildJobDecompositionPrompt(job)` | `prompts.ts:298` | Phase-1 analyst: JD -> `JobDecomposition` JSON (level, seniority, screening filters, must/nice-have, stack words, business problems, constraints, context). |
| `buildJdMetaPrompt(job)` | `prompts.ts:268` | JD -> `JdMeta` JSON (company, role, sector, location, team). |
| `buildBlueprintPrompt(job, transcript)` | `prompts.ts:198` | "Hiring Committee Scribe": transcript -> `Blueprint` JSON (objections, strengths, required changes, sector notes, pivot factors, verdicts, consensus, credibility findings, authenticity flags, missing skills, requirement map) - now also `inflatedClaims` (the panel-flagged claims the resume agent MUST soften) and `jdRequirements` (Must / Preferred / Aspirational triage). |
| `buildExecutiveReviewPrompt(input)` | `prompts.ts:339` | Advisory C-suite opinion (`ExecutiveReview` JSON). Explicitly never overrides the verdict. Separate from the Director layer. |

> `buildResumeRewriterPrompt` was the historic one-shot resume directive. Layer 3
> now composes prompts in the engine (`apps/api/src/resume/engine.ts`) from the
> shared core rules + per-role prompt + the Blueprint-as-contract; the blueprint
> consumer contract lives in `docs/developer/three-layer-committee.md` §6.

### Where the agent personas come from

- **9 domain committees** (`DOMAIN_COMMITTEES`), `detectDomain`,
  `getCommitteeForDomain`: `packages/shared/src/agents/index.ts`
  (`index.ts:26`, `:159`, `:184`).
- **42 role-driven committees** (`ROLE_DETAILS`, `ROLE_COMMITTEES`), seat kinds
  (`SEAT_KINDS`), seat weights, experience bands (`SEATS_BY_BAND`,
  `bandForYears`), level-aware panel adjustment (`selectPanelForLevel`),
  `getCommitteeForRole`, `filterByBand`, `applySectorOverride`:
  `packages/shared/src/agents/roleCommittees.ts`
  (`roleCommittees.ts:122`, `:429`, `:446`, `:454`, `:525`, `:530`, `:545`, `:566`).
- **12 sector personas** (`SECTOR_REGISTRY`, `sectorPersona`, `sectorLabel`,
  `isSpecificSector`): `packages/shared/src/sectors.ts` (`sectors.ts:13`, `:92`, `:103`).

The non-neutrality **enforcement** (parsing + redress re-prompt loop) is not a
prompt: it is logic in `apps/api/src/committee/nonNeutrality.ts` (`parseDecision`
:28, `hasNeutralLanguage` :75, `parseConfidence`, `parseInflatedClaims`) driven
by `executeAgentTurn` in `apps/api/src/committee/agentExecutor.ts:63`.

---

## 2. Resume generation prompts

### 2a. The per-role system prompts (32 files)

Directory: `apps/api/src/resume/prompts/`

| File | Role |
|---|---|
| `swe.ts`, `ai_engineer.ts`, `ai_specialist.ts`, `ai_analyst.ts`, `ml_engineer.ts`, `mlops_engineer.ts`, `data_engineer.ts`, `data_analyst.ts`, `data_scientist.ts`, `data_architect.ts`, `data_platform_engineer.ts`, `bi_analyst.ts`, `business_analyst.ts`, `business_strategist.ts`, `cloud_engineer.ts`, `cloud_security_engineer.ts`, `computer_vision_engineer.ts`, `cybersecurity_analyst.ts`, `devops.ts`, `gtm_analyst.ts`, `marketing_analyst.ts`, `marketing_strategist.ts`, `market_research_analyst.ts`, `nlp_engineer.ts`, `operations_analyst.ts`, `penetration_tester.ts`, `pricing_analyst.ts`, `product_analyst.ts`, `product_manager.ts`, `qa_engineer.ts`, `research_scientist.ts`, `soc_analyst.ts` | One elite recruiter persona per role (e.g. `SWE_SYSTEM_PROMPT`). Each is the system prompt used when generating a resume for that role. |

Each file exports a single `<SLUG>_SYSTEM_PROMPT` constant. They are imported
and registered in `apps/api/src/resume/roleRegistry.ts` (32 imports at the top,
registry near `getRolePrompt` at `roleRegistry.ts:333`).

### 2b. The role templates (32 files, the structural skeleton)

Directory: `apps/api/src/resume/templates/` - the JSON scaffold (contact,
sections, `ats_keywords`) the generator fills. Registered via `getTemplate`
(`roleRegistry.ts:326`) and `listTemplateInfo` (:309).

### 2c. Other resume-side prompts

| Prompt | Location |
|---|---|
| Quality moderator / auditor (`MODERATOR_SYSTEM_PROMPT`) | `apps/api/src/resume/moderator.ts:26`; the audit logic + `buildModeratorFeedback` is at :337. Audits structure, banned phrases, typography, the screening floor, AND the `enhancements` trail for over-enhancement |
| Typography directive (banned dashes/quotes/emoji) | `apps/api/src/resume/sanitize.ts` - `buildTypographyDirective` :60, `sanitizeText` :47 |
| English variant directive (US vs UK) | `apps/api/src/resume/locale.ts` - `buildEnglishVariantDirective` :105 |
| Screening checklist floor bars | `apps/api/src/resume/screening.ts` - `SCREENING_CHECKLISTS`, `auditScreening` :415 |
| Profile bio injected into the user prompt | `apps/api/src/resume/profile.ts` - `buildProfileBio` :92 |

---

## 3. How a resume prompt is assembled (the engine)

`generateSophisticatedResume()` in `apps/api/src/resume/engine.ts` composes the
final call (Layer 3 - the resume agent is a pure consumer of the Blueprint). In
order:

1. **Shared core rules** - `apps/api/src/resume/core.ts` (hierarchy + bullet
   limits, C-A-R, Core Competencies vs Technical Skills, JD skill triage,
   ecosystem awareness, page limits, header format, line length, anti-bot word
   bans) - always injected first so the 32 role prompts stay thin overlays.
2. **Role prompt** - `getRolePrompt(roleSlug)` from the 32 files (or
   LLM-detected via `roleDetect.ts`, falling back to `resolveRoleSlug`).
3. **Committee feedback** - the Blueprint as a BINDING contract: the GAP
   report, panel-validated strengths, `inflatedClaims` (MUST soften/reframe,
   even when they came from the source resume), and `jdRequirements` tiers
   (`must`/`preferred` justify enhancement, `aspirational` never stretches
   facts).
4. **Enhancement tier** - Conservative / Balanced / Competitive policy with the
   3-minute interview defensibility test; the agent must emit an `enhancements`
   audit trail `[{ original, enhanced, justification }]`.
5. **Source resume merge** - `mergeSourceIntoTemplate` (`apps/api/src/resume/merge.ts:86`)
   pre-populates the template so the output is never identical to the input.
6. **Profile layer** - `applyProfileToTemplate` + `buildProfileBio`
   (`apps/api/src/resume/profile.ts:21`, `:92`) when a profile is attached.
7. **Locale directive** - `detectEnglishLocale` / `buildEnglishVariantDirective`
   (`locale.ts:82`, `:105`) from the job location.
8. **ATS gap** - `extractJDKeywords` / `scoreResume`
   (`apps/api/src/resume/ats.ts:105`, `:131`) feed the missing keywords in.
9. **Moderation loop** - `moderateResume` re-audits the output (max 2
   iterations), enforcing structure, banned phrases, typography, the screening
   floor, AND over-enhancement (the enhancements trail is audited against the
   original resume + Blueprint).
10. **Serialization** - the JSON template renders to Markdown via
    `resumeToMarkdown` (`apps/api/src/resume/serialize.ts:29`); the JSON is
    stored as `rewrittenResumeJson`, the Markdown is derived at read time.

---

## 4. Editing a prompt - the flow

- **Change how the committee talks** -> edit `buildAgentSystemPrompt` in
  `packages/shared/src/prompts.ts` (and the persona templates in
  `personas.ts`), then rebuild shared
  (`pnpm --filter @rattlesnake/shared build`) and re-run the gates.
- **Change the fairness audit** -> `buildDirectorPrompt` in
  `packages/shared/src/prompts.ts` + the checklist/teeth in
  `apps/api/src/committee/directorReview.ts`.
- **Change a role's resume output style** -> edit
  `apps/api/src/resume/prompts/<slug>.ts` (API package only, no rebuild needed
  beyond the normal typecheck/test).
- **Change the shared resume rules (C-A-R, skill split, anti-bot)** -> edit
  `apps/api/src/resume/core.ts` - this applies to all 32 roles at once.
- **Change the enhancement policy / tiers** -> `apps/api/src/resume/engine.ts`
  (policy) + `apps/api/src/resume/core.ts` (tier directive).
- **Change the resume shape** -> edit
  `apps/api/src/resume/templates/<slug>.ts` and/or `serialize.ts`.
- **Tighten output hygiene / over-enhancement** -> `MODERATOR_SYSTEM_PROMPT`
  (`moderator.ts:26`) and `sanitize.ts`.

After any prompt change, run: `pnpm test`, `pnpm e2e`, `pnpm smoke:routes` (the
e2e asserts exact transcript/round/resume contracts against the offline mock,
so it catches drift in prompt output shape immediately).
