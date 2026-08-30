import {
  bandForYears,
  type AgentConfig,
  type AgentSeat,
  type Domain,
} from "@rattlesnake/shared";

/**
 * Derived committee weighting (Phase 1, plan §5).
 *
 * Seat weights are no longer a fixed per-seat constant: they are recomputed for
 * every run from the candidate's experience band, the domain/role, and the
 * sector text. The intent is that the seats whose expertise matters most for a
 * given evaluation (senior-peer judgment for early-career candidates, principal
 * depth for senior ones, the sector specialist when a sector is named, the
 * recruiter in screening-heavy contexts) carry proportionally more ballot
 * weight.
 *
 * `applyComputedWeights` leaves every other field of the AgentConfig untouched
 * and only overrides `weight`, so existing committees and tests that never call
 * this function keep their current behavior.
 */

export interface WeightContext {
  domain: Domain;
  roleSlug?: string;
  experienceYears?: number;
  sectorText?: string;
}

/** Baseline per-seat weights (identical to the historical committee values). */
export const BASE_SEAT_WEIGHTS: Record<AgentSeat, number> = {
  senior: 1,
  manager: 1,
  staff: 1.2,
  principal: 1.3,
  recruiter: 0.8,
  sector: 1,
};

/** Domains where deep staff/principal expertise carries the most signal. */
const DEPTH_DOMAINS: ReadonlySet<Domain> = new Set([
  "AI_ENGINEERING",
  "ML_ENGINEERING",
  "DATA_ENGINEERING",
  "CYBERSECURITY",
]);

export function computeWeights(ctx: WeightContext): Record<AgentSeat, number> {
  const w: Record<AgentSeat, number> = { ...BASE_SEAT_WEIGHTS };
  const band = bandForYears(ctx.experienceYears);

  if (ctx.experienceYears !== undefined) {
    // Peer-level judgment is worth more at the candidate's own seniority band:
    // senior candidates are peer-reviewed by Principal/Staff; entry-level
    // candidates lean on the Senior seat and the Recruiter's screening realism.
    if (band === "principal") {
      w.principal += 0.35;
      w.staff += 0.1;
      w.senior -= 0.25;
    } else if (band === "senior") {
      w.principal += 0.15;
      w.senior -= 0.05;
    } else if (band === "entry") {
      w.senior += 0.25;
      w.recruiter += 0.2;
    }
  }

  if (DEPTH_DOMAINS.has(ctx.domain)) {
    w.staff += 0.15;
    w.principal += 0.15;
  }

  if (ctx.sectorText && /manager|leadership|team|head|director|vp|executive/i.test(ctx.sectorText)) {
    w.manager += 0.2;
  }

  if (ctx.sectorText && /staffing|recruit|agency|talent|hiring/i.test(ctx.sectorText)) {
    w.recruiter += 0.2;
  }

  if (ctx.sectorText && ctx.sectorText.trim().length > 0) {
    w.sector += 0.15;
  }

  return w;
}

/**
 * Return a shallow copy of `agents` with each seat's `weight` overridden by the
 * derived value. Agents without a `kind` (legacy test fixtures) keep their own
 * weight (or the default 1), so the weighted consensus stays backward compatible.
 */
export function applyComputedWeights(
  agents: AgentConfig[],
  ctx: WeightContext,
): AgentConfig[] {
  const weights = computeWeights(ctx);
  return agents.map((agent) => {
    const computed = agent.kind ? weights[agent.kind] : undefined;
    return { ...agent, weight: computed ?? agent.weight ?? 1 };
  });
}
