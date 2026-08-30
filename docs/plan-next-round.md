# Rattle-Snake V2 — Next-Round Plan (Post-V1 Parity & Quality)

> **Status:** COMPLETE — P1–P5 implemented and merged green. Companion to `docs/strategy.md`
> (methodology), `docs/sprint-tracker.md` (history + full implementation log),
> `docs/feature-tracker.md` (requirement status), `docs/how-it-works.md` (current-state walkthrough).
> **Scope decisions confirmed by user:** Role-driven committees · Integrated advisory
> board · Full V1 parity · Tsenta-derived qualification audit + screening checklists
> (WS-9, entry-level floors scaled by seniority) · **Every phase below shipped green**
> (`pnpm test` = 201 tests, typecheck, build, `pnpm e2e` ALL PASSED, `pnpm smoke:routes` ALL PASSED).

---

## 1. Goals

Respond to the user review of the real DeepSeek committee run (job `msrdtnqnej0ketfw`,
DATA_AI, verdict REJECTED, resume role Data Scientist, ATS 45%, auditor 82/100):

1. **The generated resume is too generic** — it "looks exactly the same as the candidate
   selected". The committee's GAP report is not visibly driving a different, better resume.
2. **No em-dashes** in the generated resume (V1 prompt rules forbid them).
3. **No em-dashes, no unprofessional emojis in debate contents** either.
4. **Bold important positives/negatives in the debate** (exceptional skill, lack of skill).
5. **Near-universal domain coverage** — debate teams must exist for almost every domain, and
   the same role (ML Engineer / SWE / Data Analyst / Data Scientist) must be evaluated with
   **sector-specific expertise** (Audio/Sound Engineering ML, Frontier Model research,
   Customer & Consumer Insights, …).
6. **Advisory Mentorship Board** that analyzes the candidate's strengths and weaknesses
   *first*, and whose findings feed the debate and the resume engine.
7. **Professional page navigation sidebar**: Home, Dashboard, Mentorship & Advisory,
   SME Debate & Decision, Resume Generation, Profile, Account Settings.
8. **V1 parity**: template browsing, multiple profiles, and resume downloads in multiple
   styles & standards must not be missing from V2.
9. **Proper documentation** of how the current version works.

---

## 2. Root-Cause Analysis (why the resume looks like the input)

| # | Observation | Root cause in current code |
|---|---|---|
| R1 | Output mirrors the source resume almost verbatim | `engine.ts:83` user prompt says *"Source Resume (candidate, as-is — populate the template from this)"* — this **instructs copying**. V1 instead pre-merged the profile into the template (`applyProfileToTemplate` + `normalizeProfileExperience`) and left placeholder bullets (`[Experience details to be refined]`) so the model **rewrites**. |
| R2 | Blueprint not visibly shaping the output | `buildCommitteeSection` (engine.ts:35) lists the GAP report as context, but there is no explicit *"the final resume must differ from the source by X, Y, Z"* directive, and V1's rich inputs (`contentDriver`, `sector`, `workAreas`, `rawExperienceDump`, `totalWorkExperience`, `coreCompetencies`, tone) are **not passed** to the model. Tone is hardcoded `balanced` (engine.ts:85). |
| R3 | Template passed as an empty skeleton | engine.ts:84 sends the raw empty template JSON — the model fills it straight from the source text instead of restructuring. |
| R4 | Em-dashes appear in the rendered resume | `serialize.ts:56` and contact row (`.join(" · ")`) **introduce** `—` and `·` in the markdown renderer itself, and the V1 role prompts do not universally ban em-dashes (only `cover_letter.ts` has the `PUNCTUATION — STRICT` block). `sanitizeResumeText` (json.ts:5) only runs on the raw LLM JSON at extraction, not on the serialized markdown. |
| R5 | Debate text contains em-dashes/emojis | No sanitizer runs on transcript entries; `formatTranscript` and the agent prompts emit typographic characters and the model may add emojis. |
| R6 | Debate positives/negatives are not bolded | `AgentCard` (DebateView.tsx:230) renders `entry.text` inside a raw `<pre>` — markdown is **not** rendered, and the OUTPUT FORMAT markers (`[STRONG POSITIVES]`, `[HIGH-RISK CONCERNS]`) carry no styling. |

---

## 3. Workstreams

### WS-1 — Resume rewrite quality (fixes R1–R3)

**Goal:** the generated resume must be a visibly different, role-structured rewrite that
resolves the committee's objections, using only real candidate evidence.

- **Pre-merge the source into the template** before generation (V1-style):
  - New `apps/api/src/resume/merge.ts` — `mergeSourceIntoTemplate(template, sourceText)`:
    parse the candidate text into `contact`, `summary`, `experience`, `education`,
    `skills`, `certifications`; fill the template skeleton; leave each experience
    bullet as `[Experience details to be refined]` so the model **rewrites** instead of
    copies; keep `locked` semantics.
  - The user prompt then sends the **pre-merged template** (not an empty skeleton).
- **Add the missing V1 generation inputs** to the user prompt:
  - `sector` (from `sectorFocus`), `workAreas`, `totalWorkExperience` (page-limit
    directive), `coreCompetencies`, `rawExperienceDump` (from profile, optional),
    `contentDriver`, and a per-role tone (conservative/balanced/aggressive).
- **Explicit divergence directive** in the system prompt:
  - "The final resume MUST be a different, better-structured document than the source.
    Reorganize skills into labeled subsections, front-load the strongest metric in the
    first 3 words of every bullet, apply C-A-R / X-Y-Z, and visibly reflect the
    committee's Required Changes below. Do not copy the source verbatim."
  - Map each blueprint `requiredChanges` entry to the concrete action the rewrite took
    (and `[ADD: ...]` where honest evidence is missing).
- **Post-process assurance**:
  - Diff `changed_sections` between source and output; if the output is
    byte-similar to the source, regenerate once (moderator loop already exists — raise
    the "too similar" case into a moderation failure).
- **Tests:** engine test with a stub LLM asserting (a) output differs structurally from
  the input merge, (b) the template came pre-merged, (c) the user prompt contains sector /
  totalWorkExperience / divergence directive; jobs-route test for the full loop.

### WS-2 — Em-dash & emoji hygiene + resume typography (fixes R4)

**Goal:** no em-dashes (—/–) or unprofessional emojis anywhere in resumes *or* debates.

- **Central sanitizer** `apps/api/src/resume/sanitize.ts`:
  - `sanitizeTypography(text)` — replace `—`→", ", `–`→"-", smart quotes→straight,
    `…`→"...", and strip emoji (Unicode ranges) — one source of truth used by both
    resume and debate paths.
  - `stripEmoji(text)`, `containsEmDash(text)`, `containsUnprofessionalEmoji(text)`.
- **Resume path:**
  - Add a `PUNCTUATION — STRICT` block to **every** role prompt (V1's `cover_letter.ts:58-59`
    wording) as a shared injected block in `engine.ts` (like `localeDirective`), so no
    role prompt file needs editing individually.
  - Change `serialize.ts` to never emit `—`/`·`: header separator → ` | `, experience
    heading `title — company` → `title | company`.
  - Run `sanitizeTypography` on the final markdown **and** the stored JSON before persist.
  - `moderator.ts`: add a §7 TYPOGRAPHY CHECK — every em-dash/en-dash found = −2
    (deterministic, mirrors the locale-variant check).
- **Debate path:** `runner.ts`/`agentExecutor.ts` sanitize every `TranscriptEntry.text`
  (and `decisionReason`) with `sanitizeTypography` before store/publish.
- **Tests:** sanitizer unit tests (em-dash, smart quotes, emoji, `·`); engine test
  asserting `containsEmDash(markdown) === false`; moderator typography deduction test;
  debate runner test asserting transcript entries are emoji/em-dash-free.

### WS-3 — Debate formatting: bold positives & negatives (fixes R6)

**Goal:** within each expert statement, exceptional skills (positives) and lack of skills
(negatives) stand out in **bold**.

- **Prompt side** (`packages/shared/src/prompts.ts`):
  - Extend `buildAgentSystemPrompt` OUTPUT FORMAT: in `[STRONG POSITIVES]` and
    `[HIGH-RISK CONCERNS]` sections, **wrap the key evidence phrase in `**…**`** (e.g.
    `- **...** — exceptional: ...`). Add: "Never use em-dashes or emojis."
- **Render side** (`apps/web/src/components/DebateView.tsx`):
  - `AgentCard`: replace the raw `<pre>` with a **mini markdown renderer** that turns
    `**bold**` into `<strong>` and preserves line breaks (small regex renderer — no new
    dependency; `marked` already exists as a fallback if a full renderer is preferred).
  - Style `[STRONG POSITIVES]` (green) and `[HIGH-RISK CONCERNS]` (red) marker lines;
    add a legend.
- **Tests:** a `formatBold` renderer unit test; functional-test asserting transcript text
  contains `**`.

### WS-4 — Role-driven committees (near-universal domain coverage)

**Goal:** a debate team exists for almost any domain, and the same role is judged with
sector-appropriate expertise (e.g., ML Engineer for Audio vs Frontier research vs
Customer & Consumer Insights).

- **Role→committee mapping** (`packages/shared/src/agents/`):
  - New `roleCommittees.ts` — map each of the 32 role slugs (from `roleRegistry.ts`) to a
    5-seat committee definition. Base seats: Recruiter · Technical Specialist
    (role-specific focus, e.g. "ML Audio Specialist") · Team Lead · Hiring Manager ·
    **Sector Specialist** (sector-specific).
  - The Sector Specialist persona is composed from `sectorFocus` at run time (existing
    `getCommitteeForDomain` mechanism, `agents/index.ts:99-113`) so "ML Engineer" debates
    differ between Audio/Sound, Frontier Research, and Customer Insights.
  - Keep `Domain` (`SWE | DATA_AI | FINANCE`) as a fallback/category; add a
    `domain = "AUTO"` option where the role slug (not the domain) selects the committee.
- **Role detection first:** run `resolveRoleSlug` on the JD at job creation; persist the
  resolved `roleSlug` on `JobState`; committee selection uses it (fallback to domain).
- **Sector registry** `packages/shared/src/sectors.ts` — curated list of sector descriptors
  (audio/sound, frontier model research, customer & consumer insights, fintech, healthcare,
  e-commerce, gaming, energy, robotics, …) each with a Sector-Specialist persona line the
  LLM fills; unknown sectors use the generic sector mandate.
- **UI:** New Debate form shows the detected role + a sector picker (free text or registry).
- **Tests:** mapping completeness (32 slugs → committees), sector override changes the
  Sector Specialist focus, role detection at job creation.

### WS-5 — Advisory Mentorship Board (integrated pre-debate stage)

**Goal:** analyze candidate strengths/weaknesses *first*; the report feeds the debate and
the resume engine.

- **New shared types** (`packages/shared/src/types.ts`): `AdvisoryReport {
  strengths: string[]; weaknesses: string[]; gaps: string[]; recommendations: string[];
  readiness: "not_ready" | "partially_ready" | "ready"; summary: string; }`.
- **New stage in the runner** (`apps/api/src/committee/runner.ts`): `advisory` phase
  before `debating`. `buildAdvisoryPrompt(job)` (in `packages/shared/src/prompts.ts`)
  instructs a mentor panel (Career Mentor · Technical Mentor · Domain Mentor · Skills
  Auditor) to produce the report as strict JSON; rule-based fallback like the blueprint
  extractor; status `advisory` → `debating`.
- **Feeds into:**
  - Each agent's system prompt (a `MENTORSHIP BOARD BRIEF` block summarizing strengths /
    weaknesses / gaps).
  - The resume engine's user prompt (`Advisory strengths/weaknesses to amplify or repair`).
- **Storage/API:** `advisory` column (JSON) on jobs + SSE `advisory` event; `GET /api/jobs/:id`.
- **UI:** new `/advisory` page (WS-7) renders the report; DebateView shows the advisory
  report above the transcript; New Debate form offers "Run advisory first (recommended)".
- **Tests:** advisory extractor unit tests (LLM + rule-based fallback), runner stage-order
  test, jobs-route test, engine test asserting advisory block present in the user prompt.

### WS-6 — V1 parity: templates · multiple profiles · downloads

**Goal:** V2 must not lack any V1 capability.

- **Template browsing** (port of V1 `GenerateHub` / `TemplateLibrary`):
  - New page `/templates` (sidebar "Resume Generation" or "Templates"): browse the 32
    system templates by category (AI & ML, Data Science & Analytics, Software Engineering,
    Cloud & Data Engineering, Product & Business, Marketing & Strategy, Security).
  - Selecting a template pre-fills the New Debate form (domain, expected role) and/or
    pre-selects it as the resume role.
- **Multiple profiles** (port of V1 `profiles.ts` + `profileUtils.ts`):
  - Extend the current single-row `profile` table → `profiles` table; `UserProfile` gains
    V1's structured model: `personalInfo` (firstName/middle/last/email/phone/location/
    linkedin/github/portfolio/headline…), `workAuthorization`, `employmentPreference`,
    `experience[]` (multi-role entries, `locked`, `isCurrent`), `education[]`, `skills`
    (categories + `isHighlighted`), `certifications[]`, `projects[]`, `publications[]`,
    `languages[]`, `volunteer[]`, `resumeVersions[]`, `atsMetadata`, `coreCompetencies`,
    `rawExperienceDump`, `workAreas`, `totalWorkExperience`.
  - **Master profile + PIN** (V1 semantics: first profile is master; `setProfileAsMaster`,
    optional SHA-256 PIN).
  - `applyProfileToTemplate` / `normalizeProfileExperience` / `flattenExperiences` /
    `buildProfileBio` ported into the resume engine so generation is profile-driven.
  - API: `/api/profiles` CRUD (or extend `/api/profile` to plural); UI: new Profile page
    (sidebar) with edit / duplicate / delete / set-as-master / download per profile.
- **Downloads — multiple styles & standards** (port of V1 `src/lib/export/`):
  - `apps/web/src/lib/export/to-pdf.ts` (jsPDF), `to-docx.ts` (docx), `to-plaintext.ts`,
    `paths.ts`, `normalize.ts`, `extract-json.ts`.
  - Resume formats `modern | classic | plain` and layout presets
    `standard | minimalist | compact`; page format `letter | a4`; excluded-sections option.
  - Download buttons on the resume tab (PDF / DOCX / TXT) with format + preset pickers.
- **Tests:** profile CRUD + master/PIN; template-category completeness; export unit tests
  (filename builder, plaintext shape); jobs-route test injecting the active profile into
  the engine.

### WS-7 — Professional sidebar navigation

**Goal:** pages: Home · Dashboard · Mentorship & Advisory · SME Debate & Decision ·
Resume Generation · Profile · Account Settings.

- **Layout** (`apps/web/src/layouts/Layout.astro`): replace the top nav with a
  persistent **sidebar** (fixed left, responsive collapse) containing the 7 items.
- **Pages:**
  - **Home** `/` — landing (what the system does, domain strip, CTA).
  - **Dashboard** `/dashboard` — list of committee runs (currently `/jobs`) + verdicts.
  - **Mentorship & Advisory** `/advisory` — run/view advisory reports (WS-5).
  - **SME Debate & Decision** `/debate` — the New Debate form (currently `/`).
  - **Resume Generation** `/resume` — template browsing + resume output/downloads
    (WS-6), and resume-history.
  - **Profile** `/profile` — multi-profile manager (WS-6).
  - **Account Settings** `/settings` — existing settings page (profile basics, saved
    resumes/JDs, LLM connections).
- Keep current routes working (redirect `/jobs` → `/dashboard`, `/` → Home with CTA to
  `/debate`).
- **Tests:** route smoke (each page 200 via build/prod start); e2e nav clicks.

### WS-8 — Documentation of the current version

**Goal:** a proper explanation of how the system works today.

- New `docs/how-it-works.md` — end-to-end walkthrough:
  1. Job creation → role detection → committee selection → advisory → debate rounds →
     blueprint → resume engine (gap analysis → template merge → generation → ATS re-score
     → moderation loop → markdown) → storage/SSE → downloads.
  2. Data model (jobs, transcript, blueprint, advisory, profile, resume JSON/meta).
  3. LLM layer (providers, BYOK, mock), locale detection, sanitizer.
- Refresh `README.md` (diagram + links), `docs/architecture.md`, `docs/feature-tracker.md`
  with the new features and their FR/WS IDs.
- `docs/sprint-tracker.md`: add a "Next-Round" section (this plan + implementation log).

### WS-9 — Recruiter-standard qualification audit (Tsenta "what your role is screened on")

**Source:** Tsenta Resources page (headlessheadhunter.org method). User-confirmed scope:
adopt all four items, with role checklists treated as **entry-level floors scaled by
seniority** (the posting raises the bar).

- **A keyword is not a qualification (WHAT/HOW/WHY/WHERE).** The moderator's §8 rubric
  (moderator.ts) now grades every claim on all four parts; deterministic
  `auditQualifications` deducts **-2 per skill listed only in the Skills block and never
  proven in a bullet** (capped -20, >=15 forces rejection) — "skills sections and
  summaries do not count", enforced in code.
- **Role screening checklists (minimum bar).** New `apps/api/src/resume/screening.ts` —
  baseline `SCREENING_CHECKLISTS` for all 32 role slugs mapped from the Tsenta lists where
  they overlap, plus `checklistKeywords` / `auditScreening`. The engine injects the
  checklist into the generation system prompt ("FLOOR, not ceiling") and the moderator's
  §9 grades it (-2 per un-evidenced item). Coverage surfaces in `resumeMeta.screeningCoverage`.
- **Divergence-directive upgrades (engine.ts).** "Serve the hamburger before the hot dog"
  (posting is the order), front-load the **first bullet** of the most recent relevant role,
  never rely on implication ("cloud" does not imply AWS; TypeScript does not imply JS),
  cut vague verbs (led/drove/spearheaded), numbers only with real scale (users/$/latency/
  throughput), prove every skill with WHERE.
- **ATS-score honesty.** The score was already "synthetic overlap, not a prediction"; it is
  now labelled in the UI badge as **"keyword overlap"** with an explanatory `atsScoreNote`
  tooltip/caption (per Tsenta: no ATS publishes a match score; treat the number as a
  catch-a-forgotten-word aid only).

---

## 4. Proposed phasing & ordering

Priority order below (quality fixes first — they directly answer the review, then breadth):

| Phase | Content | Depends on |
|---|---|---|
| **P1** | WS-1 Resume rewrite quality + WS-2 em-dash/emoji hygiene + WS-3 debate bolding + **WS-9 recruiter-standard qualification audit** | — |
| **P2** | WS-4 Role-driven committees + WS-5 Advisory board (pipeline + API) | P1 (shared sanitizer reused) |
| **P3** | WS-7 Sidebar navigation (pages scaffolded, stubs link to P1–P2 features) | P1, P2 |
| **P4** | WS-6 V1 parity: templates browse → multi-profile → downloads | P3 (Profile/Resume pages exist) |
| **P5** | WS-8 Documentation | P1–P4 (describe finished system) |

Each phase keeps the gate green: `pnpm test`, `pnpm exec turbo run typecheck`, `pnpm run
build`, `pnpm e2e`; commit per phase.

---

## 5. Test plan & acceptance criteria

- **Quality:** generated markdown contains no `—`/`–`/emoji; output JSON differs from the
  source merge; every blueprint `requiredChanges` is addressed or explicitly `[ADD: …]`.
- **Debates:** all transcript entries free of em-dashes/emoji; `**bold**` markers present
  on positives/negatives and rendered as `<strong>` in the UI.
- **Coverage:** all 32 role slugs resolve to a committee; sector override changes the
  Sector Specialist focus; unknown-domain JD still gets a role committee.
- **Advisory:** report stored + SSE'd + fed to agents and the engine; rule-based fallback
  when the LLM returns unparseable output.
- **Parity:** template browse (32, categorized); ≥2 profiles with master + PIN;
  PDF/DOCX/TXT downloads in ≥2 formats × ≥2 layout presets.
- **Nav:** 7 sidebar pages all render; old URLs redirect.
- **Regression:** full existing suite (currently 141 tests) stays green + new tests above.

---

## 6. Key files (map)

- Resume engine: `apps/api/src/resume/engine.ts`, new `merge.ts`, `sanitize.ts`,
  `screening.ts`; `serialize.ts` (no `—`/`·`), `moderator.ts` (typo + qualification +
  screening audits), `json.ts`, `locale.ts`, `roleRegistry.ts`, `prompts/*.ts` (via
  shared injected block).
- Debate: `packages/shared/src/prompts.ts`, `apps/api/src/committee/runner.ts`,
  `agentExecutor.ts`; `packages/shared/src/agents/roleCommittees.ts`, `sectors.ts`,
  `apps/web/src/components/DebateView.tsx`.
- Advisory: `packages/shared/src/types.ts` (+`AdvisoryReport`), `prompts.ts`,
  `apps/api/src/committee/advisory.ts` (new), `routes/jobs.ts`, `db/store.ts`.
- Profiles/templates/downloads: `apps/api/src/routes/settings.ts` (+profiles),
  `db/store.ts`; `packages/shared/src/validation.ts` (+`profileSchema`); web
  `apps/web/src/components/ProfileManager.tsx`, `TemplateLibrary.tsx` (new),
  `apps/web/src/lib/export/*` (new, ported from V1).
- Navigation: `apps/web/src/layouts/Layout.astro`, `apps/web/src/pages/*`.
- Tests: `apps/api/src/resume/*.test.ts`, `apps/api/src/committee/*.test.ts`,
  `apps/api/src/routes/*.test.ts`, `apps/api/cli/functional-test.ts`.
- Docs: `docs/how-it-works.md` (new), `README.md`, `docs/architecture.md`,
  `docs/feature-tracker.md`, `docs/sprint-tracker.md`, `docs/strategy.md` (Sprint 3+).

---

## 7. Risks / notes

- **Honesty constraint vs "look different":** the rewrite must stay truthful (V1
  `HALLUCINATION GUARD`); divergence comes from **restructuring + emphasis**, not
  fabrication. `[ADD: …]` stays the escape hatch.
- **Role-driven committees touch shared types** (`Domain`, `JobState.roleSlug`) — rebuild
  `@rattlesnake/shared` and re-run the api/web typecheck after changes.
- **Em-dash detection on the LLM raw text** must happen before JSON parse (json.ts already
  sanitizes) **and** after serialization (new `sanitize.ts` pass on markdown) — both sites
  are covered in WS-2.
- **Downloads** reuse V1's exact export logic (jsPDF/docx) to guarantee parity; a new
  dependency set in `apps/web` is expected.
- Keep `pnpm e2e` (functional test with fake LLM servers) updated for every phase so the
  no-keys CI story stays intact.
