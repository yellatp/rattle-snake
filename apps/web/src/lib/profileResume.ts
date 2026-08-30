import type { UserProfile } from "@rattlesnake/shared";

/** Full name from structured personal info, falling back to the profile name. */
function nameFor(p: UserProfile): string {
  const pi = p.personalInfo;
  return [pi?.firstName, pi?.middleName, pi?.lastName].filter(Boolean).join(" ") || p.name || "";
}

function contactParts(p: UserProfile): string[] {
  const pi = p.personalInfo;
  return [
    p.email,
    pi?.phone,
    pi?.location,
    pi?.linkedin,
    pi?.github,
    pi?.portfolio,
  ].filter((x): x is string => Boolean(x));
}

function ctaParts(p: UserProfile): string[] {
  return [p.workAuthorization, p.employmentPreference, p.totalWorkExperience].filter(
    (x): x is string => Boolean(x),
  );
}

/**
 * Serialize a candidate profile into resume Markdown (text). This is what the
 * SME panel pre-fills into the base-resume box when a profile is selected.
 */
export function profileToResumeMarkdown(p: UserProfile): string {
  const blocks: string[] = [];

  const name = nameFor(p);
  if (name) blocks.push(name);
  if (p.personalInfo?.headline) blocks.push(p.personalInfo.headline);

  const contact = contactParts(p);
  const cta = ctaParts(p);
  const contactLine = [...contact, ...cta].join(" | ");
  if (contactLine) blocks.push(contactLine);

  if (p.summary) blocks.push(`## Profile Summary\n${p.summary}`);

  const experience = (p.experience ?? []).filter((e) => e.title || e.company);
  if (experience.length > 0) {
    const lines = ["## Work Experience"];
    for (const e of experience) {
      const head = [e.title, e.company].filter(Boolean).join(", ");
      lines.push(e.dates ? `### ${head} | ${e.dates}` : `### ${head}`);
      if (e.location) lines.push(e.location);
      for (const b of e.bullets ?? []) if (b) lines.push(`- ${b}`);
    }
    blocks.push(lines.join("\n"));
  }

  const skills = (p.skills ?? []).filter((s) => s.name || (s.items ?? []).length > 0);
  if (skills.length > 0) {
    const lines = ["## Technical Skills"];
    for (const s of skills) {
      const items = (s.items ?? [])
        .map((i) => i.name)
        .filter(Boolean)
        .join(", ");
      lines.push(s.name ? `${s.name}: ${items}` : items);
    }
    blocks.push(lines.join("\n"));
  }

  const projects = (p.projects ?? []).filter((pr) => pr.name);
  if (projects.length > 0) {
    const lines = ["## Projects & Research"];
    for (const pr of projects) {
      lines.push(`### ${pr.name}${pr.link ? ` | ${pr.link}` : ""}`);
      if (pr.description) lines.push(pr.description);
    }
    blocks.push(lines.join("\n"));
  }

  const education = (p.education ?? []).filter((e) => e.degree || e.institution);
  if (education.length > 0) {
    const lines = ["## Education"];
    for (const ed of education) {
      lines.push(`- ${[ed.degree, ed.institution, ed.location, ed.dates].filter(Boolean).join(" | ")}`);
    }
    blocks.push(lines.join("\n"));
  }

  if (p.certifications?.length) blocks.push(`## Certifications\n${p.certifications.join(", ")}`);
  if (p.languages?.length) blocks.push(`## Languages\n${p.languages.join(", ")}`);
  if (p.publications?.length) blocks.push(`## Publications\n${p.publications.join(", ")}`);
  if (p.volunteer?.length) blocks.push(`## Volunteering\n${p.volunteer.join(", ")}`);

  return blocks.filter((b) => b.trim().length > 0).join("\n\n");
}
