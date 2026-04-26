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

- **Resume generation** — 9 role-specific templates, ATS gap analysis, iterative scoring loop, side-by-side diff viewer
- **Cover letters** — 4 styles (standard, career change, referral, cold outreach), streaming generation, save and export
- **Interview prep** — AI-built prep plan (skill map, topics, practice projects) + Q&A answering from your bio
- **Job tracking** — drag-and-drop kanban board across 6 pipeline stages
- **Job Context** — pin a target role once; resume, cover letter, and interview prep all auto-fill from it

Everything runs in the browser. No server. No database. Nothing leaves your machine.

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
