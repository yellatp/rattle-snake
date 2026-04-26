# Future Plans

## The Prompt Architecture Vision

Rattle-Snake currently ships 9 flat role templates. The goal is to evolve this into a **hierarchical, composable prompt system** — one where the AI's context is assembled from layers rather than a single monolithic prompt.

```
Sector
  └── Domain
        └── Role
              └── Seniority Level
```

**Example path:**

```
Finance
  └── Investment Management
        └── Quantitative Analyst
              └── Mid-level (3–6 yrs)
```

Each layer adds specificity:

| Layer | What it contributes |
| :--- | :--- |
| **Sector** | Industry vocabulary, regulatory language, domain norms |
| **Domain** | Sub-field focus (e.g. within Finance: FP&A vs. Quant vs. Risk) |
| **Role** | Job-specific metrics, tools, bullet format rules |
| **Seniority** | Scope of ownership, tone, impact framing |

A Sector + Domain + Role + Level combination produces a prompt significantly more targeted than any flat role template can achieve. This is the direction we're building toward — and it requires contributors with real domain expertise to write and validate each layer.

---

## Sectors in Scope

| Sector | Domains (examples) |
| :--- | :--- |
| Technology | Software, Data, ML/AI, DevOps, Security, Product |
| Finance | Investment Banking, Quant Research, FP&A, Risk, VC |
| Healthcare | Clinical Data, Health Informatics, Biostatistics |
| Consulting | Strategy, Operations, Tech Advisory |
| Marketing | Growth, Brand, Performance, Product Marketing |
| Research | Academia, Policy, Applied Science |

This is not a complete list — sector coverage grows with contributors.

---

## Product Ecosystem

Rattle-Snake is one part of a three-piece job search stack being built in the open:

| Tool | What it does |
| :--- | :--- |
| **OnlyNerds** ([onlynerds.win](https://onlynerds.win)) | Job discovery and search |
| **Rattle-Snake** ([github.com/yellatp/rattle-snake](https://github.com/yellatp/rattle-snake)) | Resume, cover letter, interview prep generation |
| **Rattle-Snake Extension** *(planned)* | Browser extension for auto-filling job applications |

The extension is the missing piece — once it ships, the full loop is closed: discover a job on OnlyNerds, generate tailored materials in Rattle-Snake, auto-fill the application with the extension.

---

## Planned Features

| Feature | Notes |
| :--- | :--- |
| Hierarchical prompt system | Sector → Domain → Role → Level composable prompts (see above) |
| Rattle-Snake Browser Extension | Auto-fill job applications; open-source, community-built |
| Seniority auto-detection | Infer level from resume dates; skip the manual selector |
| Multi-page PDF layout | Better handling for senior resumes exceeding one page |
| LinkedIn profile import | Pre-fill resume template from a LinkedIn URL |
| Batch processing | Generate tailored resumes for multiple JDs in one run |
| Applied status + date tracking | Mark job targets as applied with timestamps; auto-clean stale ones |
| GitHub Actions export | CI workflow to rebuild and export on push |

---

## Provider Status

| Provider | Status |
| :--- | :--- |
| DeepSeek | Fully working |
| Gemini | Testing in progress |
| OpenAI | Testing in progress |
| Anthropic, xAI, KIMI, Qwen | Updates coming |

If you want to stress-test a provider, validate outputs, fix edge cases, or push it to its limits — that is exactly the kind of contribution we need.

---

## How to Contribute

The hierarchical prompt system only works if people with real domain expertise write the prompts for their sector. If you are a quant, a clinical data scientist, a security engineer, a healthcare analyst — you know things about how hiring works in your field that no generalist prompt can capture.

**What's needed:**

- Domain and sector prompt layers (`src/lib/ai/prompts/`)
- Role JSON templates (`src/templates/`)
- Provider validation and stress testing
- Extension development (browser auto-fill)

See [CONTRIBUTORS.md](../CONTRIBUTORS.md) for the contribution patterns and guidelines.

Issues and discussion: [github.com/yellatp/rattle-snake/issues](https://github.com/yellatp/rattle-snake/issues)

> Let's build the job seeker's CIA together.
