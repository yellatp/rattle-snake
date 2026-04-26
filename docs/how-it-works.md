# How It Works

## Resume Generation Pipeline

```
Step 1 — Pick Template
  9 built-in roles (Data Scientist, SWE, ML Engineer, etc.)
  or upload your own JSON template

Step 2 — Job Details
  Company · Role · JD · Tone · Section locks
        |
        ↓  Pre-generation (client-side, instant)
  ATS Gap Analysis
  - Tokenize JD: frequency + bigrams + length scoring
  - Top 60 keywords extracted
  - Resume scored against those 60 keywords
  - Output: "Already matched" list + "Missing keywords" list
        |
        ↓  Both lists injected into the AI prompt
  Role-Specific AI Generation
  - System prompt tuned for role vocabulary and seniority
  - AI works through the missing keyword list in a <thinking> block
  - Outputs structured JSON resume
        |
Step 3 — Review
  Diff viewer  →  ATS score + delta
  Score ≥ 70%? Accept → Export
  Score < 70%? Click "Improve ATS Score"
               └→ re-scores previous output (not original template)
                  feeds new gap to AI → generates improved version
                  repeat until satisfied
```

---

## ATS Scoring Algorithm

```
Job Description
      |
      ↓
tokenize() + bigrams()
      |
      ↓
Filter: freq ≥ 2  OR  length > 6  OR  in bigrams  →  top 60 keywords
      |                                                      |
      ↓                                                      ↓
Score resume text                               Injected into AI prompt
(exact + stem + fuzzy match via Fuse.js)        as explicit checklist
      |
      ↓
Weighted score = Σ(matched keyword freq) / Σ(all keyword freq)
```

---

## Role-Specific System Prompts

Each of the 9 roles has a dedicated system prompt. They are not interchangeable — the vocabulary, metric emphasis, and bullet format rules differ per role.

Examples of what differs:
- **Data Scientist** — ROC-AUC, uplift modeling, SARIMAX, SHAP values
- **SWE** — latency, DAU, uptime, memory overhead
- **DevOps** — MTTR, SLA, incident response, pipeline throughput
- **Product Manager** — ARR, churn, NPS, roadmap tradeoffs

### Seniority tiers (inside each prompt)

| Level | Focus |
| :---- | :---- |
| 0–3 yrs | Tools mastered, contribution scope, what was learned under pressure |
| 3–6 yrs | System ownership, business outcomes, independent judgment |
| 6+ yrs | Strategy, org-level impact, cross-team technical direction |

### Banned words (never appear in output)

Leveraged, Utilized, Spearheaded, Orchestrated, Pivotal, Passionate, Driven, Dynamic, Innovative, Synergy, Seamlessly, Robust, Impactful, Best-in-class, Cutting-edge, Game-changing, Thought leader, Move the needle, Deep dive, Streamline, Holistic.

Also banned: em-dashes (—) and en-dashes (–).

### Required action verbs

Shipped, Built, Cut, Grew, Found, Wrote, Ran, Refactored, Diagnosed, Unblocked, Replaced, Removed.

### CAR bullet format (Context → Action → Result)

Instead of: `"Improved model accuracy by 15%"`

The model writes: `"Accuracy was degrading after a schema change; retrained with updated feature engineering and drift monitoring, recovering 15% within one sprint."`

Sentence openers rotate between verb-first, context-first, and result-first to avoid the uniform template look.

---

## Interview Prep — Parallel Build

The prep plan uses two simultaneous AI calls to stay within the 8k output token limit:

- **Call A** — skill map + practice projects
- **Call B** — topic pipeline with questions

Both run via `Promise.allSettled`. Results are merged into one plan object. If one call fails, the other still renders.

---

## Metadata Camouflage

Exported DOCX and PDF files embed the candidate's name and email as `creator`, `author`, and `lastModifiedBy` metadata. ATS systems that check document origin see a human-authored file.

---

## Storage

All data is stored in `localStorage` under `rf_*` keys. No data ever leaves the browser.

| Key prefix | Contents |
| :--- | :--- |
| `rf_applications` | Job applications |
| `rf_resume_versions` | Resume version snapshots |
| `rf_cover_letters` | Saved cover letters |
| `rf_interview_preps` | Saved prep plans |
| `rf_recent_jds` | Last 8 company/role/JD contexts |
| `rs-active-job` | Active job target |
| `rs-profiles` | Candidate profiles |
| `rs_apikey_*` | API keys (provider-scoped) |
