# Three-Layer Committee - Design Plan

This document is the authoritative design for the committee system upgrade. It
closes the gaps identified in the external audit of the SME-panel architecture:

1. Panel selection has no explicit level rule (Senior vs Principal candidates
   get the same seats).
2. No shared definition of "acceptable evidence".
3. Bloating / elevated claims are called out in free-form prose, never flagged
   in a structured, scorable way.
4. Sector vs domain transferability is only owned by the Sector Specialist
   seat (when one exists).
5. Confidence is display-only; it does not affect the weighted vote.
6. The Architect/Director review is advisory with no teeth.
7. The resume agent consumes a soft contract and can still invent or over-polish.
8. Persona (debate) and resume prompts are only partially separated.

The system stays **one codebase, three layers**. No prompt or model call ever
does both debate and rewriting.

---

## 1. The three layers

```
Layer 1  Persona / SME            (debate ONLY)
   -> per-seat pure-evaluation personas, forced HIRE/REJECT, confidence,
      pivot factor, structured INFLATED_CLAIM flags, mandatory topics

Layer 2  Director / Architect     (fairness audit with limited teeth)
   -> runs AFTER the ballot, BEFORE the verdict is final; checklist-driven
      fairness audit; can force ONE targeted re-ballot on a single factor;
      can never unilaterally flip the final HIRE/REJECT

Layer 3  Resume Generation        (pure rewriting consumer of the Blueprint)
   -> consumes the Blueprint + validated claims; controlled enhancement
      policy with an auditable trail; shared core rules + thin role overlay
```

The advisory **ExecutiveReview** (C-suite opinion) remains as a separate,
purely advisory stage after the Director. It is NOT the Director.

---

## 2. Layer 1 - Persona / SME prompts

### 2a. Restructure `buildAgentSystemPrompt` (packages/shared/src/prompts.ts)

Every persona prompt becomes a structured, pure-evaluation contract with these
sections, in order:

```text
## IDENTITY
You are [level: Senior | Staff | Principal | Manager | Recruiter | Sector] [discipline] ...

## EVALUATION LENS
- Level calibration for THIS JD (candidate scope vs. claimed title vs. JD level)
- Technical depth vs. claimed title
- Sector / domain transferability
- Achievement density and verifiability

## MANDATORY DISCUSSION TOPICS
- Level calibration (title vs. actual scope)
- Sector / domain transferability
- Achievement density & verifiability (flag bloated claims structurally)
- Missing critical experiences for THIS JD
- Risk of under- or over-weighting any single factor

## INFLATED-CLAIM PROTOCOL
INFLATED_CLAIM: "<claim>" -> evidence: <...> -> severity: High|Medium|Low

## FORBIDDEN
- Soft language ("maybe", "could be", "borderline")
- Accepting claims without evidence
- Discussing how the resume should be rewritten (debate language never leaks)

## OUTPUT (strict)
- Scores (0-5 factors + fit 0-10)
- Strengths (evidence-backed)
- High-risk concerns + inflated claims
- Forced decision: [STRONG HIRE] | [STRONG REJECT]
- Confidence: High | Medium | Low (objective anchors, section 3)
- Single pivot factor
```

The existing `[STRONG POSITIVES]` / `[HIGH-RISK CONCERNS]` / `[DEBATE RESPONSE]`
/ `[PIVOT POINT]` / `[VERDICT]` output contract is preserved (tests + the
rule-based blueprint fallback parse it). New sections added: `[CONFIDENCE]`,
`[SECTOR & TRANSFERABILITY]` (every seat when no Sector Specialist is present),
and `INFLATED_CLAIM:` lines inside `[HIGH-RISK CONCERNS]`.

### 2b. Templated personas (packages/shared/src/personas.ts, new)

IC seats and the Sector Specialist are built by composable templates, not
hard-coded per (discipline x domain x level) files:

```ts
buildIcPersonaPrompt({
  level: "Staff" | "Principal" | "Senior" | "Manager" | "Recruiter",
  discipline: "Engineer" | "Scientist" | "Analyst" | ...,
  domain,                       // from JD metadata
  focus: "technical depth" | "system design" | ...,
  name, role,
})

buildSectorSpecialistPrompt({ sector, domain, level })
```

- `buildSectorSpecialistPrompt` is generated at runtime from `jdMeta.sector`.
- It is used ONLY when the sector is strong and specific
  (`isSpecificSector(sector)`, section 4). Generic / thin / missing sectors
  produce no specialist seat; instead "sector / domain transferability"
  becomes a mandatory lens on every seat, weighted lightly.
- Team Lead (manager seat) still owns operational/team fit. That is separate
  from sector/regulatory fit.

### 2c. Persona data gets a `level`

`AgentConfig` gains an optional `level` field (backward compatible). The
committee builder assigns it per seat (senior -> "Senior", staff -> "Staff",
principal -> "Principal", manager -> "Manager", recruiter -> "Recruiter",
sector -> "Sector Specialist"). `buildAgentSystemPrompt` renders it in the
IDENTITY block so a Principal seat never debates like a Senior.

---

## 3. Confidence that affects the vote

### 3a. Objective anchors (every persona prompt)

| Confidence | Anchor |
|---|---|
| High | Evidence directly names the exact tool, scope, metric, or responsibility the JD requires |
| Medium | Strong related evidence requiring one reasonable inference |
| Low | Only analogical or thin evidence; significant interpretation required |

### 3b. Per-turn output

- Opening JSON: `"confidence": "High" | "Medium" | "Low"` in the analysis.
- Prose turns (cross-talk, ballot): a `[CONFIDENCE]` line, parsed by
  `nonNeutrality.ts` (`parseConfidence`).
- Stored on `TranscriptEntry.confidence` and `SmeAnalysis.confidence`.

### 3c. Weighted aggregation (debateEngine.ts `aggregateVotes`)

```text
weightedVote = seatWeight * CONFIDENCE_WEIGHT[confidence]
CONFIDENCE_WEIGHT = { High: 1.0, Medium: 0.7, Low: 0.4 }
score = sum(HIRE weightedVotes) / sum(all weightedVotes)
```

A Low-confidence STRONG HIRE is materially weaker than a High-confidence one.
The Director still audits the confidence scores themselves (section 5).

---

## 4. Panel construction rules

Current behavior is preserved as the base: `filterByBand` picks the seat set
from the candidate's experience band. On top of that, the runner applies:

1. **JD-level seat adjustment** (`ensurePanelForLevel`):
   - JD level = Staff/Principal -> ensure at least one Principal seat (and a
     Staff seat) are present, even when the candidate band filtered them out.
   - JD level = Senior + candidate band = Senior -> the standard 5-seat panel
     (this is exactly what the senior band already produces).
   - Otherwise the candidate band's seat set stands.
2. **Level-inflation topic**: if the base resume title claims Staff/Principal
   but the evidence band is at most senior, a "Level inflation (title vs.
   actual scope)" discussion is forced as a mandatory topic.
3. **Sector Specialist is conditional**: present only when
   `isSpecificSector(sector)` matches the SECTOR_REGISTRY or a concrete
   sector phrase. When dropped, sector/domain transferability becomes a
   mandatory lens every seat answers (weighted lightly).
4. **Every panel keeps one Recruiter + one Manager/Lead + one technical peer +
   (conditional) one Sector Specialist.**

`getCommitteeForDomain` / `getCommitteeForRole` keep their current signatures
for backward compatibility; the level adjustment is opt-in via a new
`PanelSelection` parameter so existing callers and tests are unchanged.

---

## 5. Layer 2 - Director / Architect (fairness audit with teeth)

New stage `apps/api/src/committee/directorReview.ts`, run after the ballot and
BEFORE the verdict is finalized.

### 5a. Fairness checklist (explicit)

- Did every seat apply the same evidence bar?
- Was level correctly calibrated (JD level vs. candidate scope)?
- Were transferable skills fairly considered?
- Is there groupthink or one dominant voice?
- Were confidence scores consistent with the evidence anchors?
- Did any seat reject evidence-backed claims or accept unsupported ones?

Output: `DirectorAudit` JSON with per-item `{ passed, note }`, an overall
`fair`, and `revoteFactor` (string, empty when no material failure).

### 5b. Teeth

- Material failure on a **specific factor** -> the Director forces ONE
  re-ballot round on that factor only. Agents re-cast `[STRONG HIRE] |
  [STRONG REJECT]` with a targeted instruction naming the factor. The
  consensus is recomputed from the re-ballot.
- The Director can NEVER unilaterally flip the final HIRE/REJECT.
- Extreme, unresolved inconsistency -> the audit may surface
  `"needsHumanReview": true` (report-only).

The advisory ExecutiveReview stays untouched and still runs after the
blueprint; the Director and the Executive are distinct layers.

---

## 6. Layer 3 - Resume generation (Blueprint consumer)

### 6a. The Blueprint becomes a binding contract

`Blueprint` gains:

- `inflatedClaims: [{ claim, evidence, severity }]` - the panel-flagged
  claims the resume agent MUST soften or reframe (even when the inflation
  came from the candidate's own source resume).
- `jdRequirements: [{ requirement, tier: "must" | "preferred" | "aspirational" }]`
  - JD wish-list triage. Only `must` and `preferred` requirements justify
    enhancement; `aspirational` requirements never stretch facts.

### 6b. Controlled enhancement policy (engine.ts)

Replaces the rigid "never invent" rule with an auditable, tiered policy:

```text
ALLOWED ENHANCEMENTS (controlled only):
- Surface / rephrase / modestly expand experience strongly implied or
  closely adjacent to what the candidate actually did.
- Add skills, tools, or techniques the candidate can reasonably be expected
  to perform given their proven background.
- Reframe scope upward ONLY when the panel validated the underlying work and
  the JD language is clearly aspirational.

STRICT LIMITS:
- Never invent projects, companies, metrics, or responsibilities.
- Never claim tools/domains the candidate has zero exposure to.
- Every addition must survive the 3-minute interview test (the candidate
  must be able to discuss it for 2-3 minutes with concrete examples).
- When in doubt, stay closer to the original evidence than to the JD wish-list.
- Panel-flagged INFLATED claims MUST be softened to panel-validated scope.
```

### 6c. Enhancement tiers

| Tier | Default | Behavior |
|---|---|---|
| Conservative | Regulated sectors (Healthcare/FinTech/Defense/Energy) or Low panel confidence | Almost no new content; rephrase + reorder only |
| Balanced | Normal case | Adjacent experience and skills the candidate can defend |
| Competitive | JD clearly inflated + candidate close | More aggressive surfacing of implied capability, still 3-minute test |

Tier is chosen by the user (ResumeGenerator control) or auto-defaulted from
sector + panel confidence. It is passed as `enhancementTier` in
`GenerateOptions` and the resume-generate request.

### 6d. Enhancement audit trail

The resume agent returns `enhancements: [{ original, enhanced, justification }]`
for every added or materially expanded bullet. The trail is:
- Stored in `ResumeMeta.enhancements` (surfaced on the job page).
- Audited by the moderator (section 6e).
- Used by the Director / user as the paper trail of what changed vs. the source.

### 6e. Moderator enforcement (moderator.ts)

The moderator prompt gains a section that audits the enhancements list against
the original resume + the Blueprint:

- Every `enhanced` entry must be traceable to an `original` or to a
  panel-validated adjacent capability.
- No invented metrics/tools/companies.
- Deduction for over-enhancement (count of unjustified additions), capped like
  the typography/qualification audits so a hard violation forces a re-run.
- Sector-aware ceiling: when the run's sector is regulated, enhancements beyond
  `balanced` behavior fail.

### 6f. Shared resume core (apps/api/src/resume/core.ts, new)

The truly shared rewriting rules are extracted into one module and injected
BEFORE the per-role prompt at assembly time, so the 32 role prompts become thin
overlays:

- Professional hierarchy & bullet limits (3/3/2/2)
- C-A-R method (mandatory)
- Core Competencies vs Technical Skills - no duplication
- JD skill triage buckets
- Ecosystem-aware skill integration
- Page limit enforcement
- 3-row header format
- Line-length constraint (<=143 chars)
- Anti-bot / anti-AI word bans
- Typography + English-variant directives (already in sanitize.ts / locale.ts)

`engine.ts` composes: `coreDirective + rolePrompt + committee section + tier
directive + locale + typography + screening + divergence`.

---

## 7. File map

| Concern | File |
|---|---|
| Persona templates (IC + sector) | `packages/shared/src/personas.ts` (new) |
| Structured persona system prompt | `packages/shared/src/prompts.ts` (`buildAgentSystemPrompt`) |
| Blueprint prompt (+ inflated claims, JD requirement tiers) | `packages/shared/src/prompts.ts` (`buildBlueprintPrompt`) |
| Persona data + `level` + panel selection | `packages/shared/src/agents/roleCommittees.ts` |
| Sector specificity | `packages/shared/src/sectors.ts` (`isSpecificSector`) |
| Types + zod (confidence, inflated claims, tiers, director audit, enhancements) | `packages/shared/src/types.ts`, `validation.ts` |
| Confidence/inflation parsing | `apps/api/src/committee/nonNeutrality.ts` |
| Turn execution (new fields) | `apps/api/src/committee/agentExecutor.ts` |
| Confidence-weighted votes | `apps/api/src/committee/debateEngine.ts` |
| Director fairness audit + re-vote | `apps/api/src/committee/directorReview.ts` (new) |
| Panel selection + orchestration | `apps/api/src/committee/runner.ts` |
| Blueprint extraction | `apps/api/src/committee/blueprintExtractor.ts` |
| Shared resume core | `apps/api/src/resume/core.ts` (new) |
| Enhancement policy + audit trail | `apps/api/src/resume/engine.ts` |
| Moderator over-enhancement audit | `apps/api/src/resume/moderator.ts` |
| Tier plumbing (API + UI) | `apps/api/src/routes/jobs.ts`, `apps/web/src/components/ResumeGenerator.tsx`, `lib/api.ts` |
| Mock provider | `apps/api/src/llm/mock.ts` |

## 8. Backward compatibility

- All new zod fields carry defaults (old persisted jobs still parse).
- `getCommitteeForDomain`/`getCommitteeForRole` signatures are unchanged;
  level adjustment is opt-in.
- The prose output sections that tests parse are preserved; additions are
  additive.
- The offline mock keeps producing the same analysis shape (new fields
  optional with defaults) so unit, e2e and smoke gates stay green.
