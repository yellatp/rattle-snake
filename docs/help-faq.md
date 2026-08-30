# Help & FAQ

This document mirrors the in-app `/help` page. Content lives in two places:
`apps/web/src/pages/help.astro` (rendered UI) and this file (docs). Keep both in sync.

## How evaluations work

**What does Rattle-Snake V2 do?**
It runs a multi-agent SME committee on each job description and resume you submit,
producing a verdict, a hiring blueprint, and an on-demand resume.

**What happens when I start a run?**
1. JD metadata (company, role, sector, location) is extracted.
2. Five experts (Recruiter, Technical Specialist, Team Lead, Hiring Manager,
   Sector Specialist) each deliver a scored 360-degree analysis.
3. The panel cross-examines the candidate.
4. Each expert is forced to a HIRE or REJECT vote, weighted into a consensus verdict.
5. A blueprint records objections, strengths, required resume changes and deciding
   pivot factors.

**Why are verdicts always HIRE or REJECT?**
Neutral outcomes produce no signal, so every expert must commit to a decision.
The verdict is advisory; the final hiring decision stays with you.

**Where is my data stored?**
Evaluations are persisted locally in SQLite on your server. No data leaves your
machine except the LLM API calls you configure.

## Committees and roles

**How are committee members chosen?**
The role is auto-detected from the JD; the LLM selects the committee from the JD's
title and content. Each of the 32 roles maps to a five-seat committee.

**What is the Sector Specialist?**
The fifth seat specializes in the sector detected from the JD and contributes
sector-specific notes to the blueprint.

## Resume generation

**Why is resume generation a separate step?**
Evaluations never rewrite a resume automatically. After a run completes, you
generate the resume on demand from the Resume page.

**What makes the generated resume different?**
The blueprint's objections and required changes are applied to the role template,
the ATS keyword gap analysis is fed into the generator, and an auditor moderates
the output for typography, exaggeration and qualification gaps.

**How do I download a resume?**
Open the run page after generating and use the export bar to download PDF, DOCX or
plain text.

**Can I edit a generated resume?**
Yes. The run page has a JSON tab where you can edit the structured resume and save it.

## Candidate profiles

**What is a master profile?**
The first profile you create becomes the master and is the default candidate for
new evaluations. You can set any profile as master later.

**What is a profile PIN for?**
A PIN is an optional lightweight lock for set-as-master actions on that profile.

## Saved items and LLM connections

**What are saved resumes and job descriptions for?**
They act as one-click pickers on the SME Panel form so you can reuse content.

**How are LLM API keys handled?**
All LLM configuration lives in Settings. Stored connections are encrypted at rest
on your server and never returned to the browser. The connection marked as
default is used for every run automatically.

**Where do I configure the LLM?**
All LLM providers, models and keys are configured in Settings, including
self-hosted endpoints such as Ollama. Pick your provider there and mark a default
connection; the server applies it to every run.

## Cold email and interview mock

**What is the cold-email intro?**
A short outreach draft (subject and body) for a recruiter, founder or hiring
manager, built from the run's role, JD and the strengths the committee confirmed.

**What is the interview mock?**
A five-expert interview plan using the same committee that debated the application:
typical phases, what each expert expects, drill questions, red flags and prep tips.

## Templates

**What is the template library?**
Thirty-two role templates grouped by category. The role is auto-detected from the
JD at run time; the catalog is used for on-demand resume generation on the Resume
page.
