import type { ResumeExportOptions } from "./types";
import type { NormalizedResume } from "./normalize";
import { contactParts, filterSections } from "./normalize";

/** Markdown rendering of a normalized resume (the Markdown download). */
export function toMarkdown(
  resume: NormalizedResume,
  options: Pick<ResumeExportOptions, "excludedSections">,
): string {
  const filtered = filterSections(resume, options);
  const lines: string[] = [];

  if (filtered.contact.name) lines.push(`# ${filtered.contact.name}`);
  const contact = contactParts(filtered.contact);
  if (contact.length > 0) lines.push(contact.join(" | "));
  lines.push("");

  for (const section of filtered.sections) {
    lines.push(`## ${section.label}`);
    if (section.kind === "summary") {
      lines.push("");
      lines.push(section.body as string);
    } else if (section.kind === "skills") {
      lines.push("");
      for (const cat of section.body as { name?: string; items?: string[] }[]) {
        if (cat.name) lines.push(`**${cat.name}:** ${(cat.items ?? []).join(", ")}`);
        else if (cat.items?.length) lines.push((cat.items ?? []).join(", "));
      }
    } else if (section.kind === "experience") {
      for (const exp of section.body as {
        title?: string;
        company?: string;
        location?: string;
        dates?: string;
        bullets?: string[];
      }[]) {
        lines.push("");
        lines.push(`### ${[exp.title, exp.company].filter(Boolean).join(", ")}`);
        const meta = [exp.location, exp.dates].filter(Boolean).join(" - ");
        if (meta) lines.push(`*${meta}*`);
        for (const bullet of exp.bullets ?? []) lines.push(`- ${bullet}`);
      }
    } else {
      lines.push("");
      const items = Array.isArray(section.body) ? (section.body as string[]) : [];
      for (const item of items) lines.push(`- ${item}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
