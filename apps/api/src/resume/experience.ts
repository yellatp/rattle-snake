import type { UserProfile } from "@rattlesnake/shared";

/**
 * Estimate a candidate's years of experience, used to pick which committee
 * seats sit on a debate (WS-7 experience bands). Sources are checked in order
 * of reliability:
 *
 *   1. `profile.totalWorkExperience` (e.g. "6+ years" -> 6)
 *   2. Date ranges across `profile.experience` entries
 *   3. An explicit "N years of experience" phrase in the raw resume text
 *
 * Returns undefined when no reliable signal is found (the full 6-seat
 * committee is then used).
 */
export function estimateExperienceYears(
  profile?: UserProfile | null,
  resumeText?: string,
): number | undefined {
  if (profile) {
    const fromTotal = yearsFromLeadingNumber(profile.totalWorkExperience);
    if (fromTotal !== undefined) return fromTotal;

    const fromDates = yearsFromDateRanges(profile.experience ?? []);
    if (fromDates !== undefined) return fromDates;
  }

  if (resumeText) {
    const fromText = yearsFromText(resumeText);
    if (fromText !== undefined) return fromText;
  }

  return undefined;
}

function clamp(years: number): number | undefined {
  if (!Number.isFinite(years) || years <= 0) return undefined;
  return Math.min(Math.floor(years), 40);
}

/** "6+ years" / "3-5 years" / "12 years" -> leading number. */
function yearsFromLeadingNumber(value?: string): number | undefined {
  if (!value) return undefined;
  const m = value.match(/(\d{1,2})/);
  return m ? clamp(Number(m[1])) : undefined;
}

/** Earliest start -> latest end across profile experience entries. */
function yearsFromDateRanges(
  entries: Array<{ dates?: string; isCurrent?: boolean }>,
): number | undefined {
  let earliest: number | undefined;
  let latest: number | undefined;
  const now = new Date().getFullYear();

  for (const entry of entries) {
    if (!entry.dates) continue;
    const range = entry.dates.match(/((?:19|20)\d{2})\s*[-–]\s*((?:19|20)\d{2}|present)/i);
    if (!range) continue;
    const start = Number(range[1]);
    const endRaw = range[2] ?? "";
    const end = endRaw.toLowerCase() === "present" ? now : Number(endRaw);
    earliest = earliest === undefined ? start : Math.min(earliest, start);
    latest = latest === undefined ? end : Math.max(latest, end);
  }

  if (earliest === undefined || latest === undefined) return undefined;
  return clamp(latest - earliest + 1);
}

/** An explicit "N years of experience / work" phrase in free text. */
function yearsFromText(text: string): number | undefined {
  const explicit = text.match(/(\d{1,2})\s*\+?\s*years?\s*(?:of\s+)?(?:experience|work|industry|working)\b/i);
  if (explicit) return clamp(Number(explicit[1]));
  const bare = text.match(/(\d{1,2})\s*\+?\s*years?\b/i);
  return bare ? clamp(Number(bare[1])) : undefined;
}
