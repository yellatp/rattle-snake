import type { ResumeExportOptions } from "./types";

/**
 * Contact + section fields shared by every export target. `sections` is the
 * ordered, filtered list of blocks to render, derived from the raw resume JSON.
 */

export interface ResumeExportContact {
  name?: string;
  location?: string;
  phone?: string;
  email?: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
}

export interface ResumeExportExperience {
  title?: string;
  company?: string;
  location?: string;
  dates?: string;
  bullets?: string[];
}

export interface ResumeExportSection {
  key: string;
  label: string;
  kind:
    | "summary"
    | "skills"
    | "experience"
    | "education"
    | "certifications"
    | "coreCompetencies";
  body:
    | string
    | string[]
    | ResumeExportExperience[]
    | { name?: string; items?: string[] }[];
  raw?: unknown;
}

export interface NormalizedResume {
  contact: ResumeExportContact;
  sections: ResumeExportSection[];
  role?: string;
}

/** Harden a possibly-malformed resume JSON object into a renderable shape. */
function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(asString).filter(Boolean) : [];
}

/** Parse the structured resume JSON into a normalized, sectioned view. */
export function normalizeResumeJson(json: string): NormalizedResume | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const resume = raw as Record<string, unknown>;
  const contact = asObject(resume.contact) as ResumeExportContact;
  const sectionsRaw = asObject(resume.sections);

  const experienceRaw = asObject(sectionsRaw.experience).hasOwnProperty("0")
    ? Object.values(asObject(sectionsRaw.experience))
    : sectionsRaw.experience;
  const experiences: ResumeExportExperience[] = Array.isArray(experienceRaw)
    ? experienceRaw.map((entry) => {
        const e = asObject(entry);
        return {
          title: asString(e.title),
          company: asString(e.company),
          location: asString(e.location),
          dates: asString(e.dates),
          bullets: asStringArray(e.bullets),
        };
      })
    : [];

  const skills = Array.isArray(sectionsRaw.skills)
    ? sectionsRaw.skills.map((cat) => {
        const c = asObject(cat);
        return {
          name: asString(c.name),
          items: Array.isArray(c.items) ? c.items.map(asString).filter(Boolean) : [],
        };
      })
    : asObject(sectionsRaw.skills).categories
      ? (asObject(sectionsRaw.skills).categories as unknown[])
          .map((cat) => {
            const c = asObject(cat);
            return {
              name: asString(c.name),
              items: Array.isArray(c.items) ? c.items.map(asString).filter(Boolean) : [],
            };
          })
          .filter((cat) => cat.name || cat.items.length > 0)
      : [];

  const summary = asString(asObject(sectionsRaw.summary).content);
  const education = Array.isArray(sectionsRaw.education)
    ? sectionsRaw.education.map((entry) => {
        const e = asObject(entry);
        return {
          degree: asString(e.degree),
          institution: asString(e.institution),
          location: asString(e.location),
          dates: asString(e.dates),
        };
      })
    : [];
  const certifications = asStringArray(sectionsRaw.certifications);
  const coreCompetencies = asStringArray(sectionsRaw.coreCompetencies);

  const sections: ResumeExportSection[] = [];
  if (summary) {
    sections.push({ key: "summary", label: "Summary", kind: "summary", body: summary });
  }
  if (skills.length > 0) {
    sections.push({
      key: "skills",
      label: "Skills",
      kind: "skills",
      body: skills.map((s) => ({ name: s.name, items: s.items })),
    });
  }
  if (experiences.length > 0) {
    sections.push({
      key: "experience",
      label: "Experience",
      kind: "experience",
      body: experiences,
    });
  }
  if (education.length > 0) {
    sections.push({
      key: "education",
      label: "Education",
      kind: "education",
      body: education.map(
        (e) =>
          `${[e.degree, e.institution, [e.location, e.dates].filter(Boolean).join(", ")]
            .filter(Boolean)
            .join(" · ")}`,
      ),
    });
  }
  if (certifications.length > 0) {
    sections.push({
      key: "certifications",
      label: "Certifications",
      kind: "certifications",
      body: certifications,
    });
  }
  if (coreCompetencies.length > 0) {
    sections.push({
      key: "coreCompetencies",
      label: "Core Competencies",
      kind: "coreCompetencies",
      body: coreCompetencies,
    });
  }

  return {
    contact: {
      name: asString(contact.name),
      location: asString(contact.location),
      phone: asString(contact.phone),
      email: asString(contact.email),
      linkedin: asString(contact.linkedin),
      github: asString(contact.github),
      portfolio: asString(contact.portfolio),
    },
    sections,
    role: asString(resume.role),
  };
}

/** Apply excludedSections to a normalized resume, returning a filtered copy. */
export function filterSections(
  resume: NormalizedResume,
  options: Pick<ResumeExportOptions, "excludedSections">,
): NormalizedResume {
  if (options.excludedSections.length === 0) return resume;
  return {
    ...resume,
    sections: resume.sections.filter((s) => !options.excludedSections.includes(s.key)),
  };
}

/** Flat contact line pieces (name excluded) for header rows. */
export function contactParts(contact: ResumeExportContact): string[] {
  return [
    contact.location,
    contact.phone,
    contact.email,
    contact.linkedin,
    contact.github,
    contact.portfolio,
  ].filter((part): part is string => Boolean(part));
}
