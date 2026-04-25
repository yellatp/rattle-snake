# Rattle-Snake

![Rattle-Snake](public/rattle-snake.png)

**Open-source AI resume tailoring tool.** Paste a job description, pick your role template, and get an ATS-optimized, human-sounding resume. Not a LLM output dump.

---

## Quick Start (npx)

```text
          ____
         / . .\\
         \\  ---<   RATTLE-SNAKE v1.0
          \\  /    Target: Applicant Tracking Systems
   ________/ /
  /  _______/      Status: Ready to strike
 /  /
 \\  \\__________
  \\___RATTLE__  \\
              \\  \\
               \\  \\_______
                \\___SNAKE__\

> Local server started at http://localhost:4321
> Metadata Camouflage: ACTIVE

```

```bash
npx rattle-snake
```

Or clone and run locally:

```bash
git clone https://github.com/yellatp/rattle-snake.git
cd rattle-snake
npm install
npm run dev
```

Open [http://localhost:4321](http://localhost:4321) in your browser.

---

## What sets Rattle-Snake apart from a standard LLM prompt?

Most people open ChatGPT, paste a resume, and type "tailor this for the job." The output is polished but hollow: generic verbs, corporate buzzwords, uniform sentence structure, and zero awareness of what the ATS scanner will actually check. Rattle-Snake is built around a different philosophy.

### 1. Role and Seniority-Aware System Prompts

Every role has a dedicated system prompt hand-tuned for its vocabulary, metrics, and hiring bar. A Data Scientist prompt knows what ROC-AUC, uplift modeling, and SARIMAX mean. An SWE prompt prioritizes latency numbers and DAU. A DevOps prompt leads with uptime and MTTR. These are not interchangeable; the vocabulary, metric emphasis, and bullet format rules differ per role.

Seniority is handled by tone tiers inside each prompt:

- **0-3 yrs:** tools mastered, contribution scope, what was learned under production pressure
- **3-6 yrs:** system ownership, business outcomes, independent judgment
- **6+ yrs:** strategy, org-level impact, cross-team technical direction

### 2. ATS Gap Analysis, Not Guesswork

Before the AI writes a single bullet, Rattle-Snake runs the same keyword extraction algorithm the ATS scorer uses against your job description. The AI receives two explicit lists:

- **Already matched:** keywords already present in your resume (preserve these, do not rephrase them away)
- **Missing:** the exact keywords the ATS will check that your resume does not yet contain

The AI works through the missing list one by one inside a `<thinking>` block before producing JSON. This is fundamentally different from asking ChatGPT to "optimize for ATS keywords." That approach lets the model decide which keywords matter. Rattle-Snake gives the model the exact 60-word checklist the scorer will use.

### 3. Iterative ATS Loop

Generation > Score > Improve > Score again. If the first pass scores below 70%, the **Improve ATS Score** button re-scores the previous AI output (not the original template) and feeds the new gap into the next pass. Each iteration builds on the last with a tighter gap, not a fresh start from scratch.

### 4. Human Writing, Not AI Writing

The system prompts enforce constraints that generic LLM usage ignores:

**Banned words (never appear in output):**
Leveraged, Utilized, Spearheaded, Orchestrated, Pivotal, Passionate, Driven, Dynamic,
Innovative, Synergy, Seamlessly, Robust, Impactful, Best-in-class, Cutting-edge,
Game-changing, Thought leader, Move the needle, Deep dive, Streamline, Holistic.

**Required instead:** Shipped, Built, Cut, Grew, Found, Wrote, Ran, Refactored, Diagnosed, Unblocked, Replaced, Removed.

**CAR bullet format (Context, Action, Result):**
Instead of `"Improved model accuracy by 15%"`, the model writes:
`"Accuracy was degrading after a schema change; retrained with updated feature engineering and drift monitoring, recovering 15% within one sprint."`

**Sentence variety enforcement:** bullets rotate between verb-first, context-first, and result-first openers. Uniform verb-first lists are a template tell; varied openers read like a human wrote them.

### 5. Metadata Camouflage (ATS-Proofing)

Exported DOCX and PDF files embed the candidate's name and email as `creator`, `author`, and `lastModifiedBy` metadata in `Name <email>` format. ATS systems that check document origin to filter bot-spray applications see a human-authored file, not a tool-generated one.

### 6. No Server, No Storage

All API keys are stored in your browser's localStorage. No resume content, no job descriptions, and no API keys leave your machine to any Rattle-Snake server, because there is not one.

---

## Getting Started

### Prerequisites

| Requirement | Version |
| :---------- | :------ |
| Node.js | 18+ |
| npm | 9+ |
| API key (Anthropic, OpenAI, xAI, or DeepSeek) | any supported provider |

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/yellatp/rattle-snake.git
cd rattle-snake

# 2. Install dependencies
npm install

# 3. Start the development server
npm run dev
```

Open [http://localhost:4321](http://localhost:4321) in your browser.

### Build for production

```bash
npm run build       # Outputs to ./dist/
npm run preview     # Preview the production build locally
```

### Add your API key

1. Open **Settings** (sidebar)
2. Paste your API key for any supported provider
3. Click **Test Connection**. If it shows "Connected", click **Set as Active**

Supported providers: **Anthropic (Claude)**, **OpenAI (GPT-4o)**, **Google Gemini**, **xAI (Grok)**, **DeepSeek**, **Moonshot KIMI**, **Alibaba Qwen**

---

## How it works

```text
+---------------------------------------------------------------------+
|                        Rattle-Snake Pipeline                        |
+---------------------------------------------------------------------+

  STEP 1 - Template Selection
  +----------------------+
  |  Pick Role Template  |  Data Scientist · SWE · ML Engineer ·
  |  (9 built-in roles)  |  AI Engineer · DevOps · PM · and more
  +----------+-----------+
             |
  STEP 2 - Job Details
  +----------v-----------+
  |  Paste Job           |  Company · Title · Full JD · Tone
  |  Description         |  Lock sections you do not want changed
  +----------+-----------+
             |
             |  Pre-generation scoring (client-side, instant)
             v
  +----------------------+
  |  ATS Gap Analysis    |  Extract 60 keywords from JD using
  |                      |  frequency + bigram + length scoring
  |  Already matched     |  Score current template against JD
  |  Missing keywords    |  Split result into two explicit lists
  +----------+-----------+
             |
             |  Both lists injected into the AI user prompt
             v
  +----------------------+
  |  Role-Specific       |  System prompt tuned for role vocabulary,
  |  AI Generation       |  seniority tiers, CAR bullet format,
  |                      |  banned word list, hallucination guard,
  |  <thinking> block    |  section locking
  |  checks off keywords |
  |  before outputting   |
  +----------+-----------+
             |
  STEP 3 - Review
  +----------v-----------+
  |  Diff View +         |  Line-by-line diff of what changed
  |  Live ATS Score      |  ATS score badge with delta
  |                      |
  |  Score >= 70%?       |  Yes -> Accept -> Step 4
  |       |              |
  |       No             |
  |       v              |
  |  [Improve ATS Score] |  Re-scores the PREVIOUS output (not
  |  iterative loop      |  the original template) -> feeds new
  |                      |  gap to AI -> generates improved version
  +----------+-----------+
             |  Accept version
  STEP 4 - Export
  +----------v-----------+
  |  Export              |  PDF (jsPDF, Letter/A4, clickable links)
  |                      |  DOCX (Calibri, right-tab dates, metadata)
  |                      |  TXT (ATS plain text, right-aligned dates)
  |                      |
  |  Cover Letter        |  Generated from same resume JSON + JD
  |  (inline)            |  No extra input required
  +----------------------+
```

### ATS Scoring Detail

```text
Job Description
      |
      v
 tokenize() + bigrams()
      |
      v
 Filter: freq >= 2 OR length > 6 OR in bigrams
      |  sorted by frequency descending
      v
 Top 60 keywords -------------------------------------------+
      |                                                      |
      v                                                      v
 Score resume text                              Injected into AI prompt
 (exact + stem + fuzzy match via Fuse.js)       as explicit checklist
      |
      v
 Weighted score = sum(matched keyword freq) / sum(all keyword freq)
```

---

## Features

| Feature | Description |
| :------ | :---------- |
| 9 role templates | Data Scientist, Data Analyst, ML Engineer, AI Engineer, SWE, Product Manager, Product Analyst, Business Analyst, DevOps |
| Custom templates | Upload your own JSON resume template |
| Section locking | Lock any section; the AI will not rewrite it |
| Section visibility | Toggle which sections appear in exports |
| Tone selector | Conservative / Balanced / Aggressive |
| ATS pre-scoring | Gap analysis before generation, not after |
| Iterative ATS loop | Improve score across multiple passes |
| Diff viewer | See exactly what the AI changed |
| PDF export | Letter + A4, clickable hyperlinks, candidate metadata |
| DOCX export | Calibri, right-aligned dates, ATS-safe formatting |
| TXT export | Plain text for paste-into-form ATS systems |
| Cover letter | Inline generation from same resume data |
| Interview prep | 15 questions generated per JD (behavioral / technical / role-specific) |
| Q&A answering | Paste application questions, get humanized answers using your bio |
| Your Story | Personal bio stored in Settings, used for cover letters and Q&A |
| Job tracker | Track applications with status |
| Metadata Camouflage | DOCX/PDF metadata set to candidate name and email for ATS authenticity |
| No server | Everything runs in the browser; keys never leave your machine |

---

## Project Structure

```text
src/
+-- components/
|   +-- AIGeneratePanel.tsx     # Main generation flow (steps 1-4)
|   +-- ATSScorer.tsx           # ATS score ring + keyword breakdown
|   +-- CoverLetterManager.tsx  # Standalone cover letter page
|   +-- InterviewPrep.tsx       # Question generation + Q&A answering
|   +-- ResumeEditor.tsx        # Live resume preview
|   +-- Settings.tsx            # API keys + Your Story bio
|
+-- lib/
|   +-- ai/
|   |   +-- prompts/            # Role-specific system prompts (9 roles)
|   |   +-- providers/          # Anthropic, OpenAI, xAI, DeepSeek adapters
|   |   +-- router.ts           # AI request builder + gap analysis injection
|   |
|   +-- ats/
|   |   +-- scorer.ts           # Keyword extraction + weighted ATS scoring
|   |
|   +-- export/
|       +-- to-pdf.ts           # jsPDF resume renderer
|       +-- to-docx.ts          # docx library renderer
|       +-- to-plaintext.ts     # ATS plain text renderer
|       +-- extract-json.ts     # Strips <thinking> blocks + markdown from AI output
|
+-- templates/                  # Base resume JSON for each role
+-- store/
    +-- app.ts                  # Zustand store (provider config, user bio)
```

---

## Supported AI Providers

| Provider | Recommended Model | Notes |
| :------- | :---------------- | :---- |
| Anthropic | claude-sonnet-4-6 | Best reasoning for structured JSON output |
| OpenAI | gpt-4o | Strong instruction-following |
| Google Gemini | gemini-2.0-flash | Fast, large context window |
| xAI | grok-2-latest | Fast, good at technical roles |
| DeepSeek | deepseek-chat | Cost-effective, solid JSON output |
| Moonshot KIMI | moonshot-v1-128k | 128k context, strong Chinese + English |
| Alibaba Qwen | qwen-plus | Solid JSON, cost-effective |

Extended thinking models (claude-opus-4-7, o1) produce higher quality `<thinking>` blocks and better keyword coverage but are slower and more expensive.

All providers use **BYOK (Bring Your Own Key)** — keys are stored only in your browser's localStorage, never on any server.

---

## Roadmap

This is an open-source project. Contributions are welcome.

**Planned role prompts:**

- Healthcare Data Analyst
- Quantitative Research Analyst
- Banking FP&A Analyst
- UX Researcher
- Security Engineer

**Planned features:**

- Seniority auto-detection from resume dates
- Multi-page PDF layout for senior resumes
- LinkedIn profile import
- GitHub Actions export workflow

---

## Open Source

Rattle-Snake is open source under the MIT license. If you find it useful, star the repo or open a PR.

Issues and feature requests: [github.com/yellatp/rattle-snake/issues](https://github.com/yellatp/rattle-snake/issues)
