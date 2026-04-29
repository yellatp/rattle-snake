# Rattle-Snake CIA (Career Intelligence Assistant)

<div align="center">
  <img src="public/rattle-snake.png" alt="Rattle-Snake Logo" width="200" />
  <p><em>Giving candidates an unfair advantage in the modern job market.</em></p>

  [![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
  [![Tech Stack](https://img.shields.io/badge/Stack-Astro_%7C_React_%7C_Zustand-orange.svg)](#system-architecture)
  [![Local First](https://img.shields.io/badge/Privacy-Local--First-green.svg)](#-system-architecture)
</div>

---

**Rattle-Snake CIA** is a high-performance, open-source workstation designed to treat the job hunt like a tactical operation. It provides a suite of automated intelligence tools to tailor resumes, script cover letters, and map out interview strategies—all running locally in your browser for total privacy.

## 🛠 Features & Capabilities

### 📄 Next-Gen Resume Engineering
*   **The Iterative Scoring Loop:** Don't just generate; optimize. If your ATS score is below 70%, the assistant triggers an "Improvement Pass," analyzing gaps in the previous output and re-injecting missing keywords until you hit the target.
*   **Section Locking:** Protect your "Gold Standard" content. Toggle specific sections to remain untouched while the AI rewrites the rest.
*   **Diff-View Validation:** Review every AI-suggested change with a side-by-side line-by-line diff viewer before accepting.
*   **Snapshot Versioning:** Every accepted generation is saved as a numbered version. Experiment freely and roll back to any previous iteration instantly.
*   **Multi-Format Export:** High-fidelity PDF (hyperlink-enabled), ATS-safe DOCX, and clean TXT exports.

### ✉️ Strategic Cover Letters
*   **Four Tactical Styles:** Generate letters optimized for **Standard** applications, **Career Changes**, **Referrals** (auto-mentioning contacts), or **Cold Outreach**.
*   **Streaming UI:** Watch the AI build your pitch in real-time with an inline editor for final polishing.
*   **Linked Context:** Directly link generated letters to specific tracked applications in your pipeline.

### 🧠 Interview Intelligence
*   **The Prep Plan Builder:** Parallel AI calls generate a triple-threat strategy:
    *   **Skill Map:** Identification of Core vs. Supporting requirements.
    *   **Topic Pipeline:** Prioritized question sets and frameworks (High/Med/Low difficulty).
    *   **Practice Projects:** Three custom project ideas designed to demonstrate your specific expertise.
*   **Humanized Q&A:** Feed the assistant specific application questions; it uses your "Story Bio" to generate authentic, non-generic responses that sound like you, not a bot.

### 🎯 Universal Job Context
*   **Pin the Target:** Set your target company and role once in the sidebar. This "Active Context" automatically propagates across the Resume, Cover Letter, and Interview modules, eliminating repetitive copy-pasting.

### 📊 Tactical Job Tracker
*   **Full-Featured Kanban:** Manage your pipeline through 6 tactical stages: 
    *   `Wishlist` → `Applied` → `Phone Screen` → `Interview` → `Offer` → `Rejected`
*   **Application Spreadsheet:** A sortable, filterable table view for deep-dive analysis and CSV export of your entire search history.

---

## 🏗 System Architecture

The project is built for speed, privacy, and extensibility with a modular **Astro + React + Zustand** stack.

| Module | Responsibility |
| :--- | :--- |
| **lib/ai/providers** | Native integration for DeepSeek, Gemini, OpenAI, Anthropic, xAI, KIMI, and Qwen. |
| **lib/ats/scorer** | Weighted keyword extraction and delta-score calculation. |
| **lib/export** | Multi-format engine for PDF, DOCX (ATS-safe), and TXT. |
| **lib/db** | Local-first persistence layer using `localStorage`. No cloud, no latency, total privacy. |
| **templates/** | 9 role-specific JSON schemas designed to satisfy strict ATS parsers. |

---

## 🚀 Quick Start

1.  **Clone & Install:**
    ```bash
    git clone https://github.com/yellatp/rattle-snake.git
    cd rattle-snake
    npm install
    npm run dev
    ```
2.  **Initialize Intelligence:**
    *   Open `localhost:4321`.
    *   Drop your API key into **Settings**.
    *   Fill out "Your Story" in the **Profile** to ground the AI in your history.
3.  **Deploy:**
    *   Pin a job target in the sidebar.
    *   Start generating tactical assets.

---

## 📚 Documentation

Dive deeper into the operation:

- 📑 [**Features & Capabilities**](docs/features.md) — Full feature list and project structure.
- ⚙️ [**How It Works**](docs/how-it-works.md) — ATS pipeline, scoring algorithm, and system prompt design.
- 🛠 [**Installation & Setup**](docs/install.md) — Prerequisites, build instructions, and API configuration.
- 🤖 [**AI Providers**](docs/providers.md) — Supported LLMs and recommended models.
- 🗺️ [**Future Plans**](docs/future-plans.md) — The roadmap for hierarchical prompt visions and browser extensions.
- 🤝 [**Contributors**](CONTRIBUTORS.md) — How to add new providers, templates, and role prompts.

---

## 👤 Creator

**Pavan Yellathakota**  
*Building tools to level the playing field.*

- 🌐 [**Portfolio**](https://pye.pages.dev)
- 💼 [**LinkedIn**](https://linkedin.com/in/yellatp)
- 📧 [**Email**](mailto:pavan.yellathakota.ds@gmail.com)

---

Rattle-Snake CIA is licensed under **Apache 2.0**. Build your own templates, add new providers, and take control of your career data.
