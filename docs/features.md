# Features & Capabilities

## Navigation

The sidebar has six sections:

- **Dashboard** — terminal typeout with active job context, pipeline funnel, recent applications, quick actions
- **Generate** — tabbed hub: Resume · Cover Letter · Templates
- **Applications** — drag-and-drop kanban job tracker
- **Interview Prep** — prep plan builder and Q&A answering
- **Profile** — manage multiple candidate profiles
- **Settings** — API keys, active provider, Your Story bio

The active job target is pinned in the sidebar. Click it anytime to change or clear.

---

## Resume Generation

Three-step flow:

1. **Pick a template** — 9 built-in role templates; or upload your own JSON
2. **Add job details** — company, role, job description, tone (conservative / balanced / aggressive), lock any sections you don't want touched
3. **Review and export** — diff viewer shows what changed line by line; ATS score badge with delta; accept or iterate

**ATS iterative loop:** If the score is below 70%, click **Improve ATS Score**. It re-scores the previous AI output (not the original template) and feeds the new gap into the next pass. Each pass builds on the last.

**Section locking:** Toggle any section off before generating. The AI will not rewrite locked sections.

**Version history:** Every accepted generation is saved as a numbered snapshot. Restore any version at any time.

**Export formats:**
- PDF — Letter or A4, clickable hyperlinks, candidate metadata embedded
- DOCX — Calibri, right-aligned dates, ATS-safe formatting
- TXT — plain text for paste-into-form ATS systems

Exported files are named: `Firstname-Lastname-Role-Company-Resume.ext`

---

## Cover Letters

Four template styles: Standard · Career Change · Referral · Cold Outreach

Each style has a different generation strategy baked in (e.g. referral mentions the contact in the first sentence, cold outreach leads with why the specific team matters).

- Link a cover letter to a tracked application
- Streaming preview as the AI writes
- Edit inline after generation
- Save to history, load back anytime
- Export as `.txt`: `Firstname-Lastname-Role-Company-CoverLetter.txt`

---

## Interview Prep

**Prep Plan tab:** Enter company + role + JD and click Build. Two parallel AI calls produce:
- Skill map (core required / supporting / nice-to-have)
- Topic pipeline with priority (high / med / low), questions per topic, frameworks, difficulty
- 3 practice projects with estimated time and outcomes
- Download the full plan as a markdown file

**Answer Questions tab:** Paste application questions (one per line). The AI generates humanized answers using your bio from Settings. No buzzwords, no generic responses.

---

## Job Tracker

Drag-and-drop kanban across 6 stages: Wishlist → Applied → Phone Screen → Interview → Offer → Rejected

Each card stores: company, role, location, salary range, notes, JD text, link, and created date.

---

## Job Context

Set a target role once from the sidebar or any service's context bar. All three services (Resume, Cover Letter, Interview Prep) auto-fill company, role, and JD from the active target.

The context bar in each service shows:
- The active target and a live dot
- **Apply** — pulls the active target into the form
- **Pin** — saves the current form as the new active target
- **Edit** — opens the modal to change or clear

---

## Profiles

Multiple candidate profiles, each with: display name, full name, current title, email, phone, location, LinkedIn, GitHub, portfolio, and bio. The active profile syncs its bio to Settings → Your Story.

---

## Project Structure

```
src/
├── components/
│   ├── AIGeneratePanel.tsx     — resume generation (3-step flow)
│   ├── ATSScorer.tsx           — score ring + keyword breakdown
│   ├── CoverLetterManager.tsx  — cover letter generation + history
│   ├── Dashboard.tsx           — home with terminal hero + stats
│   ├── DiffViewer.tsx          — line-by-line diff of resume changes
│   ├── GenerateHub.tsx         — tabbed hub (Resume / Cover Letter / Templates)
│   ├── InterviewPrep.tsx       — prep plan builder + Q&A answering
│   ├── JobContextBar.tsx       — shared context bar (Apply / Pin / Edit)
│   ├── JobContextModal.tsx     — modal to set/edit active job target
│   ├── JobTracker.tsx          — drag-and-drop kanban
│   ├── ProfileManager.tsx      — profile CRUD
│   ├── ResumeEditor.tsx        — live resume preview
│   ├── Settings.tsx            — API keys + Your Story
│   ├── TemplateLibrary.tsx     — built-in template browser
│   ├── UserTemplateUploader.tsx — upload custom JSON templates
│   ├── VersionHistory.tsx      — resume version snapshots
│   └── ui/
│       ├── Icons.tsx           — all SVG icon components
│       ├── Sidebar.tsx         — navigation + active job indicator
│       └── Toast.tsx           — notification toasts
│
├── lib/
│   ├── ai/
│   │   ├── prompts/            — 9 role-specific system prompts + cover letter + Q&A
│   │   ├── providers/          — Anthropic, OpenAI, Gemini, xAI, DeepSeek, KIMI, Qwen
│   │   └── router.ts           — provider routing + ATS gap injection
│   ├── ats/
│   │   └── scorer.ts           — keyword extraction + weighted scoring
│   ├── db/
│   │   ├── queries.ts          — localStorage CRUD for all data
│   │   └── schema.ts           — TypeScript types + status labels
│   └── export/
│       ├── to-pdf.ts           — jsPDF renderer
│       ├── to-docx.ts          — docx library renderer
│       ├── to-plaintext.ts     — ATS plain text renderer
│       └── extract-json.ts     — strips <thinking> blocks from AI output
│
├── pages/                      — Astro routes (static SSG)
├── store/
│   ├── app.ts                  — Zustand: provider config, toasts, user bio
│   ├── jobContext.ts           — Zustand: active job target (persisted)
│   └── profiles.ts             — Zustand: candidate profiles (persisted)
└── templates/                  — base resume JSON for each role
```
