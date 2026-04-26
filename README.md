# Rattle-Snake

![Rattle-Snake](public/rattle-snake.png)

Open-source AI career intelligence assistant. Tailor resumes, generate cover letters, prep for interviews — all in the browser, with your own API key.

---

## Quick Start

```bash
git clone https://github.com/yellatp/rattle-snake.git
cd rattle-snake
npm install
npm run dev
```

Open [http://localhost:4321](http://localhost:4321). Add an API key in **Settings** to begin.

---

## What it does

- **Resume generation** — 9 role-specific templates with Preview / Edit before use; ATS gap analysis; iterative scoring loop; side-by-side diff viewer; PDF preview with Letter/A4 toggle
- **Profile system** — BYOP (Bring Your Own Profile): parse a DOCX/TXT resume to auto-fill contact, experience, education, skills, and projects; PIN-protected profiles; multiple profile slots
- **Template library** — Visual editor and raw JSON editor per template; Fill from My Resume; Customize → Save as Mine; `Preview / Edit` and `Use →` buttons on every card
- **Cover letters** — 4 styles (standard, career change, referral, cold outreach), streaming generation, save and export
- **Interview prep** — AI-built prep plan (skill map, topics, practice projects) + Q&A answering from your bio; Saved Plans in reverse chronological order
- **Job tracking** — Drag-and-drop kanban (Applied → Phone Screen → Interview → Decision); interview round tracked with manual `+` / `−` buttons; reverse-chronological columns (top-5 shown, "View All" links to spreadsheet page)
- **Applications spreadsheet** — `/applications` page: full sortable/filterable table, inline status and round editing, CSV export
- **Job Context bar** — Paste a job description once inside Generate or Interview Prep; company, title, location, and JD auto-fill across tools
- **Settings** — Compact 4-column provider grid (7 providers: Anthropic, OpenAI, Gemini, xAI, DeepSeek, Kimi, Qwen); click any tile to expand its key/model/test controls

Everything runs in the browser. No server. No database. Nothing leaves your machine.

---

## Job tracking fields

Each application tracks: **Company · Role · Location · Status · Interview Round · Salary Range · Notes · Date Applied**

Location is captured when adding a card, when using the Job Context bar (company + title + location + JD), or when editing an application in the detail panel.

---

## Docs

| Doc | Contents |
| :--- | :--- |
| [Features & Capabilities](docs/features.md) | Full feature list and project structure |
| [How It Works](docs/how-it-works.md) | ATS pipeline, scoring algorithm, system prompt design |
| [Installation & Setup](docs/install.md) | Prerequisites, build, API key setup |
| [AI Providers](docs/providers.md) | 7 supported providers, recommended models |
| [Future Plans](docs/future-plans.md) | Hierarchical prompt vision, extension, planned features |
| [Contributors](CONTRIBUTORS.md) | How to add providers, templates, and role prompts |

---

## Provider Status

DeepSeek is fully working. Gemini and OpenAI are currently being tested. Anthropic and other providers will be updated soon. If you want to stress-test a provider, validate outputs, or push it to its limits — contributions are welcome.

---

## Open Source

Apache 2.0 · [github.com/yellatp/rattle-snake](https://github.com/yellatp/rattle-snake) · [Issues](https://github.com/yellatp/rattle-snake/issues)
