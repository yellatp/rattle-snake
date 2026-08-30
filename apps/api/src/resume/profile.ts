import type { UserProfile } from "@rattlesnake/shared";
import type { ResumeTemplate } from "./types.js";

/**
 * Profile-driven resume generation (WS-6). The structured candidate profile is
 * authoritative when it exists: it is layered onto the role template AFTER the
 * source-resume merge, and a human-readable bio block is injected into the
 * generator prompt so the model rewrites from structured facts, not just raw
 * resume text.
 */

function displayName(profile: UserProfile): string {
  const p = profile.personalInfo;
  if (p?.firstName || p?.lastName) {
    return [p?.firstName, p?.middleName, p?.lastName].filter(Boolean).join(" ") || profile.name;
  }
  return profile.name;
}

/** Layer the structured profile onto a pre-merged role template. */
export function applyProfileToTemplate(
  template: ResumeTemplate,
  profile: UserProfile,
): ResumeTemplate {
  const p = profile.personalInfo;
  const next: ResumeTemplate = {
    ...template,
    contact: {
      ...template.contact,
      name: displayName(profile) || template.contact.name,
      email: p?.email || profile.email || template.contact.email,
      phone: p?.phone || template.contact.phone,
      location: p?.location || template.contact.location,
      linkedin: p?.linkedin || template.contact.linkedin,
      github: p?.github || template.contact.github,
      portfolio: p?.portfolio || template.contact.portfolio,
    },
    sections: { ...template.sections },
  };

  const summary = next.sections.summary?.content ?? "";
  const profileSummary = profile.summary?.trim();
  const headline = p?.headline?.trim();
  if (profileSummary && (!summary || summary.includes("["))) {
    next.sections.summary = { content: profileSummary, editable: true };
  } else if (headline && (!summary || summary.includes("["))) {
    next.sections.summary = { content: headline, editable: true };
  }

  if (profile.skills && profile.skills.length > 0) {
    next.sections.skills = {
      categories: profile.skills.map((cat) => ({
        name: cat.name ?? "",
        items: (cat.items ?? []).map((item) => item.name),
      })),
      editable: true,
    };
  }

  if (profile.experience && profile.experience.length > 0) {
    next.sections.experience = profile.experience.map((exp) => ({
      title: exp.title,
      company: exp.company,
      location: exp.location,
      dates: exp.dates,
      locked: exp.locked,
      bullets: exp.bullets,
    }));
  }

  if (profile.education && profile.education.length > 0) {
    next.sections.education = profile.education.map((ed) => ({
      degree: ed.degree,
      institution: ed.institution,
      location: ed.location,
      dates: ed.dates,
    }));
  }

  if (profile.certifications && profile.certifications.length > 0) {
    next.sections.certifications = profile.certifications;
  }

  if (profile.coreCompetencies && profile.coreCompetencies.length > 0) {
    next.sections.coreCompetencies = profile.coreCompetencies;
  }

  return next;
}

/** Human-readable bio block injected into the resume generator's user prompt. */
export function buildProfileBio(profile: UserProfile): string {
  const p = profile.personalInfo;
  const lines: string[] = [];

  lines.push(`Name: ${displayName(profile)}`);
  if (profile.summary) lines.push(`Summary: ${profile.summary}`);
  if (p?.headline) lines.push(`Headline: ${p.headline}`);
  if (profile.totalWorkExperience) lines.push(`Total experience: ${profile.totalWorkExperience}`);
  if (profile.workAuthorization) lines.push(`Work authorization: ${profile.workAuthorization}`);
  if (profile.employmentPreference) lines.push(`Employment preference: ${profile.employmentPreference}`);
  if (profile.workAreas && profile.workAreas.length > 0) {
    lines.push(`Work areas: ${profile.workAreas.join(", ")}`);
  }
  if (profile.languages && profile.languages.length > 0) {
    lines.push(`Languages: ${profile.languages.join(", ")}`);
  }
  if (p?.location) lines.push(`Location: ${p.location}`);

  if (profile.experience && profile.experience.length > 0) {
    lines.push("Experience:");
    for (const exp of profile.experience) {
      const head = [exp.title, exp.company, exp.location, exp.dates].filter(Boolean).join(", ");
      lines.push(`- ${head}`);
      for (const bullet of exp.bullets ?? []) lines.push(`  - ${bullet}`);
    }
  }
  if (profile.education && profile.education.length > 0) {
    lines.push("Education:");
    for (const ed of profile.education) {
      lines.push(`- ${[ed.degree, ed.institution, ed.location, ed.dates].filter(Boolean).join(", ")}`);
    }
  }
  if (profile.skills && profile.skills.length > 0) {
    lines.push("Skills:");
    for (const cat of profile.skills) {
      const names = (cat.items ?? []).map((item) => item.name).join(", ");
      lines.push(`- ${cat.name ? `${cat.name}: ` : ""}${names}`);
    }
  }
  if (profile.certifications && profile.certifications.length > 0) {
    lines.push(`Certifications: ${profile.certifications.join(", ")}`);
  }
  if (profile.projects && profile.projects.length > 0) {
    lines.push("Projects:");
    for (const proj of profile.projects) {
      lines.push(`- ${proj.name ?? ""}${proj.description ? `: ${proj.description}` : ""}${proj.link ? ` (${proj.link})` : ""}`);
    }
  }
  if (profile.publications && profile.publications.length > 0) {
    lines.push(`Publications: ${profile.publications.join(" | ")}`);
  }
  if (profile.volunteer && profile.volunteer.length > 0) {
    lines.push(`Volunteering: ${profile.volunteer.join(" | ")}`);
  }

  return lines.join("\n");
}
