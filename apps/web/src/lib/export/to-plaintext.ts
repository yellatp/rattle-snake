import type { ResumeExportOptions } from "./types";
import type { NormalizedResume } from "./normalize";
import { contactParts, filterSections } from "./normalize";

/** Plain-text rendering (the "plain" format and TXT download). */
export function toPlaintext(
  resume: NormalizedResume,
  options: Pick<ResumeExportOptions, "excludedSections">,
): string {
  const filtered = filterSections(resume, options);
  const lines: string[] = [];

  if (filtered.contact.name) lines.push(filtered.contact.name.toUpperCase());
  const contact = contactParts(filtered.contact);
  if (contact.length > 0) lines.push(contact.join("  |  "));
  lines.push("");

  for (const section of filtered.sections) {
    lines.push(section.label.toUpperCase());
    lines.push("-".repeat(Math.max(12, section.label.length)));
    if (section.kind === "summary") {
      lines.push(section.body as string);
    } else if (section.kind === "skills") {
      for (const cat of section.body as { name?: string; items?: string[] }[]) {
        if (cat.name) lines.push(`${cat.name}: ${(cat.items ?? []).join(", ")}`);
        else if (cat.items?.length) lines.push(cat.items.join(", "));
      }
    } else if (section.kind === "experience") {
      for (const exp of section.body as {
        title?: string;
        company?: string;
        location?: string;
        dates?: string;
        bullets?: string[];
      }[]) {
        const head = [exp.title, exp.company, [exp.location, exp.dates].filter(Boolean).join(", ")]
          .filter(Boolean)
          .join(" - ");
        lines.push(head);
        for (const bullet of exp.bullets ?? []) lines.push(`  - ${bullet}`);
      }
    } else {
      const items = Array.isArray(section.body) ? (section.body as string[]) : [];
      for (const item of items) lines.push(`- ${item}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
