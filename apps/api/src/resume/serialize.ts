import type { ResumeTemplate } from "./types.js";

/**
 * Render a role-template resume JSON object as Markdown for the DebateView.
 * Heading levels follow the `.resume-md` styles in the web app
 * (h1 name, h2 section, h3 role/company).
 */
export function resumeToMarkdown(template: ResumeTemplate): string {
  const lines: string[] = [];

  const contact = template.contact ?? {};
  if (contact.name) {
    lines.push(`# ${contact.name}`);
    const contactRow = [
      contact.location,
      contact.phone,
      contact.email,
      contact.linkedin,
      contact.github,
      contact.portfolio,
    ]
      .filter((v): v is string => Boolean(v && v.trim()))
      .join(" · ");
    if (contactRow) lines.push(contactRow);
    lines.push("");
  }

  const sections = template.sections ?? {};

  if (sections.summary?.content?.trim()) {
    lines.push("## Summary", "", sections.summary.content.trim(), "");
  }

  const coreCompetencies = sections.coreCompetencies ?? [];
  if (coreCompetencies.length > 0) {
    lines.push("## Core Competencies", "", `* ${coreCompetencies.join(", ")}`, "");
  }

  const skills = sections.skills?.categories ?? [];
  if (skills.length > 0) {
    lines.push("## Skills", "");
    for (const cat of skills) {
      const items = (cat.items ?? []).join(", ");
      if (cat.name?.trim()) lines.push(`**${cat.name.trim()}:** ${items}`);
      else if (items) lines.push(items);
    }
    lines.push("");
  }

  const experience = sections.experience ?? [];
  if (experience.length > 0) {
    lines.push("## Experience", "");
    for (const exp of experience) {
      const title = exp.title?.trim();
      const company = exp.company?.trim();
      const heading = title && company ? `${title} — ${company}` : (title ?? company ?? "Experience");
      const suffix = exp.dates?.trim() ? ` · ${exp.dates.trim()}` : "";
      lines.push(`### ${heading}${suffix}`);
      for (const bullet of exp.bullets ?? []) {
        if (bullet?.trim()) lines.push(`- ${bullet.trim()}`);
      }
      lines.push("");
    }
  }

  const education = sections.education ?? [];
  if (education.length > 0) {
    lines.push("## Education", "");
    for (const ed of education) {
      const parts = [ed.degree?.trim(), ed.institution?.trim()].filter(Boolean).join(" — ");
      if (!parts) continue;
      const suffix = ed.dates?.trim() ? ` · ${ed.dates.trim()}` : "";
      lines.push(`- ${parts}${suffix}`);
    }
    lines.push("");
  }

  const certifications = sections.certifications ?? [];
  if (certifications.length > 0) {
    lines.push("## Certifications", "");
    for (const cert of certifications) {
      if (cert?.trim()) lines.push(`- ${cert.trim()}`);
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}
