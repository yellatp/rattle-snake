# Frontend Map - Pages, Components, Lib

The web app is **Astro SSR** (`apps/web/astro.config.mjs`: `output: "server"`,
`@astrojs/node` standalone adapter, `@astrojs/react`) with **React 19 islands**
hydrated via `client:load`. There is one global stylesheet
(`apps/web/src/styles/global.css`), one layout (`src/layouts/Layout.astro`),
and no CSS framework.

All paths below are relative to `apps/web/` unless stated otherwise.

---

## 1. Skeletal page structure

```
apps/web/
├── astro.config.mjs          # SSR, node adapter, react integration, dev port 4321
├── package.json
├── tsconfig.json             # astro strict + react-jsx + "@/*" -> src/*
├── scripts/
│   └── smoke-routes.mjs      # post-build route smoke test (asserts status per page)
├── public/                   # rattle-snake.png, Alphonso.svg, OnlyNerds_Nav.svg
└── src/
    ├── layouts/
    │   └── Layout.astro          # shell: sidebar NAV + <slot/> + footer
    ├── pages/                    # one file per URL (the "skeleton" of the app)
    ├── components/               # React islands
    ├── lib/                      # api client + providers + scenario questions + export/
    └── styles/
        └── global.css            # single stylesheet, sectioned
```

### Pages (`src/pages/`)

| File | URL | Renders (islands) | Notes |
|---|---|---|---|
| `index.astro` | `/` | - | 302 redirect to `/dashboard` (legacy) |
| `dashboard.astro` | `/dashboard` | `JobList` | All committee runs table |
| `sme-panel.astro` | `/sme-panel` | `NewJobForm` | Start a new run (form + BYOK + generate flags) |
| `resume.astro` | `/resume` | `ResumeGenerator` + `ResumeHistory` | Reads `?job=` to pre-select a run |
| `profile.astro` | `/profile` | `ProfilesView` | Candidate profile CRUD + PIN + resume import |
| `storage.astro` | `/storage` | `StorageView` | Users -> company/role -> runs, each with its files (discussion, resume, cover letter, interview prep); view + download + delete |
| `exports.astro` | `/exports` | - | 302 redirect to `/storage` (legacy; page was folded into Storage) |
| `settings.astro` | `/settings` | `SettingsView` | Profile, saved resumes/JDs, LLM connections |
| `help.astro` | `/help` | - (static) | FAQ, no islands |
| `jobs/index.astro` | `/jobs` | - | 302 redirect to `/dashboard` (legacy) |
| `jobs/[id].astro` | `/jobs/:id` | `DebateView` | Live run page; inline failsafe script guards against stalled hydration |
| `debate.astro` | `/debate` | - | 302 redirect to `/sme-panel` (legacy) |
| `storage/[id].astro` | `/storage/:id` | `StorageViewer` | Reads `?tab=discussion|resume|coverletter|interview` |

Pattern to add a page: create `src/pages/<name>.astro`, use `Layout`, mount a
React island with `client:load`, add the nav link in `Layout.astro`, and add the
route to `scripts/smoke-routes.mjs`.

---

## 2. React components (`src/components/`)

| Component | What it does |
|---|---|
| `JobList.tsx` | Dashboard table of all runs (`listJobs`): id, domain, status pill, verdict, entry count, date. |
| `NewJobForm.tsx` | SME panel form: profile select (defaults master and auto-fills the base resume from that profile via `profileToResumeMarkdown`), JD + resume textareas, saved JD/resume pickers, optional location, auto-generate checkboxes (incl. enhancement tier for resume), "Load sample", BYOK overrides. Creates the job and redirects to `/jobs/:id`. |
| `DebateView.tsx` | The core run page (~1400 lines): fetch job + SSE stream, status pill, run monitor, JD metadata card, job decomposition, SME 360 panel, director audit card (fairness findings + revote), transcript grouped by round, verdict + tallies + rejection breakdown, blueprint, executive review, rewritten resume (MD/JSON + export bar), cold email / cover letter / interview mock panels, transcript modal. Contains ~15 internal sub-components (StatusPill, RunMonitor, JdMetaCard, JobDecompositionCard, SmePanel, SeatCard, AgentCard, Line, RejectionBreakdown, VerdictCard, DirectorAuditCard, BlueprintView, ExecutiveReviewCard, ExportBar, RewrittenResume, ResumeMetaBadge, TranscriptModal). |
| `ResumeGenerator.tsx` | On-demand resume generation from a completed run: select run -> enhancement-tier selector -> `generateResume` -> show Markdown + meta (role, ATS %, auditor score, enhancement count). |
| `ResumeHistory.tsx` | Table of runs that have a generated resume (role, keyword-overlap %, auditor score, date). |
| `ProfilesView.tsx` | Profile CRUD (~1000 lines): create/edit a large structured profile, set master (+PIN unlock), set PIN, delete, LLM resume import, live read-only resume preview. |
| `SettingsView.tsx` | Profile name/email, saved JD/resume CRUD, LLM connection CRUD (provider picker from `lib/providers.ts`). |
| `StorageView.tsx` | Storage index: users -> `(company, role)` -> runs; each run lists its files as chips (Expert discussion, Resume, Cover letter, Interview prep) with a View link plus on-demand MD/JSON/TXT downloads (fetches the job lazily) and a per-run Delete. |
| `StorageViewer.tsx` | Single stored run: Discussion / Resume / Cover letter / Interview prep tabs (tabs appear only when the artifact exists); MD/JSON/TXT downloads per tab; header + Delete run. |
| `ColdEmailPanel.tsx` | Collapsible panel generating a cold-email intro (audience, target name, tone); copy + regenerate. |
| `CoverLetterPanel.tsx` | Collapsible panel generating a 4-part cover letter; copy + regenerate. |
| `InterviewMockPanel.tsx` | Collapsible panel generating a 5-expert interview prep plan. |
| `ModeratorFeedback.tsx` | Displays `ResumeMeta.moderator` feedback (auditor verdict, score, banned phrases, issues, suggestions). Returns null when absent. |
| `ScenarioPanel.tsx` | While a run is live, shows rotating practice questions from `lib/scenarioQuestions.ts`. |

---

## 3. Lib modules (`src/lib/`)

### `api.ts` - the browser API client

`API_URL` = `import.meta.env.PUBLIC_API_URL ?? "http://localhost:8787"`.
Generic `request<T>(path, init)` (JSON, throws on non-OK, 204 -> void). Every
endpoint has a typed wrapper (see `docs/developer/api-reference.md` for the
server side):

`createJob`, `listJobs`, `getJob`, `updateJobResume`, `streamUrl`,
`generateResume`, `cancelJob`, `generateColdEmail`, `generateCoverLetter`,
`generateInterviewMock`, `listTemplates`, `getProfile`, `saveProfile`,
`listProfiles`, `createProfile`, `updateProfile`, `setProfilePin`,
`setMasterProfile`, `deleteProfile`, `importResume`, `listResumes`,
`createResume`, `updateResume`, `deleteResume`, `listJds`, `createJd`,
`updateJd`, `deleteJd`, `listConnections`, `createConnection`,
`updateConnection`, `deleteConnection`, `deleteJob`, `listStorage`.

### `providers.ts`

`PROVIDERS: ProviderOption[]` - 14 LLM provider presets mirroring
`apps/api/src/llm/presets.ts` for the Settings connection form.

### `profileResume.ts`

`profileToResumeMarkdown(profile)` - serializes a `UserProfile` into resume
Markdown (text). Used by `NewJobForm` to auto-fill the base-resume box when a
profile is selected; the empty string means the profile has no resume content.

### `scenarioQuestions.ts`

`scenarioQuestionsFor(domain, roleSlug?)` - 10 pools of 5 practice questions
(50 total), picked by normalized keyword.

### `lib/export/` - the resume download pipeline

| File | Purpose |
|---|---|
| `index.ts` | Facade `downloadResume(json, options, kind, roleLabel?)`: normalizes then renders (md/json/txt inline; docx/pdf via dynamic import). |
| `types.ts` | `ResumeExportOptions`, `DEFAULT_EXPORT_OPTIONS`, format/preset/page labels. |
| `normalize.ts` | `normalizeResumeJson` -> `NormalizedResume` (defensive parse), `filterSections`, `contactParts`. |
| `to-markdown.ts` | Markdown renderer. |
| `to-docx.ts` | .docx Blob via `docx` Packer. |
| `to-pdf.ts` | jsPDF layout with pagination. |
| `to-plaintext.ts` | Plain-text renderer. |
| `paths.ts` | ASCII-safe `Fullname_Role_Resume.ext` filename builder. |
| `transcript.ts` | Discussion downloads (MD/JSON/TXT) via shared converters + `downloadTranscript`. |
| `drafts.ts` | Cover letter + interview prep serializers (MD/JSON/TXT) + `downloadCoverLetter` / `downloadInterviewPlan` / `downloadText`. |
| `download.ts` | `triggerDownload(blob, filename)` object-URL helper. |
| `export.test.ts` | Vitest suite for the pipeline. |
| `drafts.test.ts` | Vitest suite for the draft serializers. |

---

## 4. Layout, nav, styles

- **Layout** (`src/layouts/Layout.astro`) - the only layout. Props `{ title }`.
  Imports `global.css`; emits the HTML shell with `.app-shell` = fixed
  `.sidebar` (brand + `nav.side-nav`) + `main.site-main` with the page slot,
  then a footer.
- **Nav links** (hard-coded in `Layout.astro` lines ~9-18, the `NAV` array):

  | href | label |
  |---|---|
  | `/dashboard` | Dashboard |
  | `/sme-panel` | SME Panel |
  | `/resume` | Resume |
  | `/profile` | Profile |
  | `/storage` | Storage |
  | `/settings` | Settings |
  | `/help` | Help & FAQ |

  Active link via `aria-current` when `path === href` or `path.startsWith(href + "/")`.
- **Styles** (`src/styles/global.css`, ~2300 lines) - single stylesheet,
  sectioned by divider comments: root vars / shell / page headers / shared UI /
  forms / status pills / DebateView / transcript modal / transparency /
  Storage / JobList / Settings / Profiles / application panels /
  handoff CTA / JD metadata / SME panel / resume generator / help.

---

## 5. Data flow (a run from the UI)

```
NewJobForm  --POST /api/jobs------------------------------->  API: creates job,
  |                                                           starts runCommittee()
  `--redirect /jobs/:id
DebateView  --GET /api/jobs/:id (initial snapshot) ------->  full JobState
           <--GET /api/jobs/:id/stream (SSE)------------<-  live entry/phase/verdict events
           --POST /api/jobs/:id/resume/generate --------->  { markdown, json, meta }
Resume page --listJobs + generateResume ------------------>  same handoff
StorageView --GET /api/storage --------------------------->  grouped runs + artifact flags
           \--GET /api/jobs/:id (on download) -------------->  full JobState -> client-side MD/JSON/TXT
```

The browser never talks to the DB directly; `lib/api.ts` is the only client of
the API. Server-side, `apps/api/src/app.ts` mounts the routers listed in
`docs/developer/api-reference.md`.
