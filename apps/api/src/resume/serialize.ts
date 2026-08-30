import type { ResumeTemplate } from "./types.js";

/**
 * Render a role-template resume JSON object as Markdown for the DebateView.
 * Heading levels follow the `.resume-md` styles in the web app
 * (h1 name, h2 section, h3 role/company).
 */

/**
 * Coerce one template value to a trimmed string. Model output (and older stored
 * rows) sometimes carries objects where the schema expects strings — e.g.
 * `certifications: [{ "name": "AWS" }]` — so a nested string is unwrapped and
 * anything unusable collapses to "". This keeps rendering crash-free.
 */
function str(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object") {
    const name = (value as { name?: unknown }).name ?? (value as { title?: unknown }).title;
    if (typeof name === "string") return name.trim();
  }
  return "";
}

/** Coerce an array of template values to trimmed strings, dropping empties. */
function strList(values: unknown[] | undefined): string[] {
  return (values ?? []).map(str).filter(Boolean);
}

export function resumeToMarkdown(template: ResumeTemplate): string {
  const lines: string[] = [];

  const contact = template.contact ?? {};
  const name = str(contact.name);
  if (name) {
    lines.push(`# ${name}`);
    const contactRow = [contact.location, contact.phone, contact.email, contact.linkedin, contact.github, contact.portfolio]
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .map((v) => v.trim())
      .join(" | ");
    if (contactRow) lines.push(contactRow);
    lines.push("");
  }

  const sections = template.sections ?? {};

  const summary = str(sections.summary?.content);
  if (summary) {
    lines.push("## Summary", "", summary, "");
  }

  const coreCompetencies = strList(sections.coreCompetencies);
  if (coreCompetencies.length > 0) {
    lines.push("## Core Competencies", "", `* ${coreCompetencies.join(", ")}`, "");
  }

  const skills = sections.skills?.categories ?? [];
  if (skills.length > 0) {
    lines.push("## Skills", "");
    for (const cat of skills) {
      const items = strList(cat.items).join(", ");
      const catName = str(cat.name);
      if (catName) lines.push(`**${catName}:** ${items}`);
      else if (items) lines.push(items);
    }
    lines.push("");
  }

  const experience = sections.experience ?? [];
  if (experience.length > 0) {
    lines.push("## Experience", "");
    for (const exp of experience) {
      const title = str(exp.title);
      const company = str(exp.company);
      const heading = title && company ? `${title} | ${company}` : (title ?? company ?? "Experience");
      const dates = str(exp.dates);
      const suffix = dates ? ` | ${dates}` : "";
      lines.push(`### ${heading}${suffix}`);
      for (const bullet of strList(exp.bullets)) {
        lines.push(`- ${bullet}`);
      }
      lines.push("");
    }
  }

  const education = sections.education ?? [];
  if (education.length > 0) {
    lines.push("## Education", "");
    for (const ed of education) {
      const parts = [str(ed.degree), str(ed.institution)].filter(Boolean).join(" | ");
      if (!parts) continue;
      const dates = str(ed.dates);
      const suffix = dates ? ` | ${dates}` : "";
      lines.push(`- ${parts}${suffix}`);
    }
    lines.push("");
  }

  const certifications = strList(sections.certifications);
  if (certifications.length > 0) {
    lines.push("## Certifications", "");
    for (const cert of certifications) {
      lines.push(`- ${cert}`);
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}
