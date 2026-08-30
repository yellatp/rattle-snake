import type { EnhancementTier, ResumeEnhancement } from "@rattlesnake/shared";

/**
 * Shared resume core (Layer 3, three-layer plan section 6f).
 *
 * The truly shared rewriting rules, injected BEFORE every per-role prompt at
 * assembly time so the 32 role prompts stay thin overlays. Editing this file
 * changes every role at once.
 */

/** Regulated sectors that force the conservative enhancement ceiling. */
export const REGULATED_SECTORS = [
  "healthcare",
  "fintech",
  "finance",
  "defense",
  "defence",
  "energy",
  "insurance",
  "banking",
  "payments",
  "medical",
  "pharma",
  "government",
];

/** True when the run's sector is regulated (stricter enhancement ceiling). */
export function isRegulatedSector(sector?: string): boolean {
  if (!sector) return false;
  const lower = sector.toLowerCase();
  return REGULATED_SECTORS.some((s) => lower.includes(s));
}

/** Pure-addition ceilings per tier (enhancements with no `original` text). */
export const PURE_ADDITION_CEILING: Record<EnhancementTier, number> = {
  conservative: 0,
  balanced: 2,
  competitive: 4,
};

/**
 * The shared core directive. The opening line intentionally keeps the
 * "senior resume writer" marker the offline mock and tests route on.
 */
export function buildCoreDirective(): string {
  return `You are a senior resume writer. The following SHARED CORE RULES apply to every role and override any per-role instruction below where the two conflict.

## PROFESSIONAL HIERARCHY & BULLET LIMITS
- Software/engineering roles: 3 bullets for the current role, 3 for the role before, 2 and 2 for earlier roles. Analyst/ops roles may use 3/3/3/2. Keep to the limits even when the source has more.
- Order roles newest to oldest. Never include non-employment or student entries unless they are the only experience.

## C-A-R METHOD (MANDATORY)
- Every bullet follows Context-Action-Result: what the situation was, the concrete action taken (with the tools/stack), and the measurable result. A bullet with no result is a task list, not an achievement.
- Use strong, specific action verbs. Do not start bullets with I, We, My, or an adjective.

## CORE COMPETENCIES vs TECHNICAL SKILLS - NO DUPLICATION
- Technical Skills: exact tools, platforms, languages, frameworks (Go, Kafka, Snowflake, Terraform, TypeScript).
- Core Competencies: methods and approaches (system design, SLO ownership, incident response, A/B testing, SQL optimization).
- A skill may appear in exactly ONE of the two. Never repeat the same tool in both blocks.

## JD SKILL TRIAGE BUCKETS
- Classify every posting skill into: "must" (the posting frames it as required), "preferred" (a nice-to-have), or "aspirational" (a clear stretch wish-list item).
- "must" and "preferred" skills justify modestly surfacing implied experience; "aspirational" skills never stretch facts and never replace the candidate's real evidence.

## ECOSYSTEM-AWARE SKILL INTEGRATION
- Integrate a skill the way it actually ships: cloud implies the ecosystem (AWS -> VPC/IAM/EC2/S3 or Azure/GCP equivalents), a language implies its runtime and common libraries, a framework implies its toolchain. Name only what the candidate actually touched.
- Never list an ecosystem component the source resume never mentions and the candidate could not plausibly have used.

## PAGE LIMIT
- One page, strict. If the source content overflows, cut the weakest bullets and compress skills; never reduce the page margin or font to cheat.

## HEADER FORMAT
- A 3-row header: (1) name, (2) title + highest credential, (3) one line of contact (email, phone, location, links). No more.

## LINE LENGTH
- Every rendered line stays within 143 characters (the ATS paste limit). Long bullets are split at sentence boundaries, never mid-word.

## ANTI-BOT / ANTI-AI WORD BANS
- Never use: Leveraged, Utilized, Spearheaded, Orchestrated, Passionate, Pivotal, Synergy, Thought leader, Best-in-class, Cutting-edge, World-class, Holistic, Seamlessly, Move the needle, Impactful, Results-driven, Detail-oriented, Team player, Self-starter, Go-getter, Think outside the box, Hit the ground running. Vague verbs (led, drove, owned) only when followed by WHAT touched and WHAT changed.

## TYPOGRAPHY + ENGLISH VARIANT
- Plain ASCII punctuation only: no em-dashes, no en-dashes, no smart quotes, no ellipses, no middle dots, no emoji.
- A single English variant (US or UK) for the whole document; never mix spellings.`;
}

/** The controlled-enhancement policy + tier directive + audit-trail output rule. */
export function buildEnhancementDirective(input: {
  tier: EnhancementTier;
  sector?: string;
}): string {
  const tierLabel: Record<EnhancementTier, string> = {
    conservative:
      "Conservative: almost no new content. Rephrase, reorder, and merge only. Do not add skills, tools, or scope the source resume does not explicitly name.",
    balanced:
      "Balanced: surface adjacent experience and skills the candidate can defend in a 2-3 minute conversation. Do not add tools or domains that are not implied by the source resume.",
    competitive:
      "Competitive: more aggressively surface implied capability that the panel validated and the posting clearly asks for. Still subject to the 3-minute test; never invent anything.",
  };
  const regulated = isRegulatedSector(input.sector)
    ? "\n- REGULATED SECTOR DETECTED: treat this as Conservative regardless of the chosen tier. Pure additions are forbidden."
    : "";

  return `## CONTROLLED ENHANCEMENT POLICY (tier: ${input.tier})

ALLOWED ENHANCEMENTS (controlled only):
- Surface, rephrase, or modestly expand experience that is strongly implied by, or closely adjacent to, what the candidate actually did.
- Add skills, tools, or techniques the candidate can reasonably be expected to perform given their proven background.
- Reframe scope upward ONLY when the panel validated the underlying work and the JD language is clearly aspirational.

STRICT LIMITS:
- Never invent projects, companies, metrics, or responsibilities.
- Never claim tools or domains the candidate has zero exposure to.
- Every addition must survive the 3-MINUTE INTERVIEW TEST: the candidate must be able to discuss it for 2-3 minutes with concrete examples. If they could not, cut it.
- When in doubt, stay closer to the original evidence than to the JD wish-list.
- Panel-flagged INFLATED claims MUST be softened to panel-validated scope.
${regulated}

TIER BEHAVIOR - ${tierLabel[input.tier]}

## ENHANCEMENT AUDIT TRAIL (MANDATORY OUTPUT)
Return the resume as a single JSON object whose top-level keys are "sections" (the template schema) AND "enhancements": an array of { "original": "<source text the bullet grew from, or \"\">", "enhanced": "<the resulting bullet>", "justification": "<which evidence anchor + which must/preferred JD requirement it serves>" } for EVERY added or materially expanded bullet. Pure rewording of a bullet with unchanged content is NOT an enhancement and must not be listed.`;
}

/** Default tier when the user did not choose one: regulated sector or low panel confidence -> conservative, else balanced. */
export function defaultEnhancementTier(input: {
  sector?: string;
  lowPanelConfidence: boolean;
}): EnhancementTier {
  if (isRegulatedSector(input.sector) || input.lowPanelConfidence) return "conservative";
  return "balanced";
}

/** Coerce an LLM-produced enhancements array into the audit-trail shape. */
export function normalizeEnhancements(value: unknown): ResumeEnhancement[] {
  if (!Array.isArray(value)) return [];
  const out: ResumeEnhancement[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as Record<string, unknown>;
    const enhanced = typeof rec.enhanced === "string" ? rec.enhanced : "";
    if (!enhanced.trim()) continue;
    out.push({
      original: typeof rec.original === "string" ? rec.original : "",
      enhanced,
      justification: typeof rec.justification === "string" ? rec.justification : "",
    });
  }
  return out;
}
