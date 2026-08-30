import type { ResumeTemplate } from "./types.js";

/**
 * Pre-merge the candidate's base resume into a role template skeleton
 * (ported from V1's `applyProfileToTemplate` + `normalizeProfileExperience`).
 *
 * V1 deliberately did NOT send an empty template to the model: the candidate
 * content is merged in first, and any experience entry that has no bullets is
 * seeded with a `[Experience details to be refined]` placeholder. The role
 * system prompt then REWRITES those placeholders into strong, quantified
 * achievement bullets instead of copying the source verbatim.
 *
 * This is the fix for the "generated resume looks identical to the input"
 * complaint: the model receives a populated-but-unfinished document and is
 * forced to transform it, not transcribe it.
 */

/** Normalized placeholder the model must replace with a real achievement bullet. */
export const REFINE_PLACEHOLDER = "[Experience details to be refined]";

export interface MergedResume {
  template: ResumeTemplate;
  /** How many source experiences were seeded (for logging/tests). */
  seededEntries: number;
  /** Matched contact fields from the source text. */
  contact: ResumeTemplate["contact"];
}

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]+/;
const PHONE_RE = /(\+?\d[\d\s().-]{7,}\d)/;
const URL_RE = /(linkedin\.com\/[\w/.-]+|github\.com\/[\w/.-]+|[\w.-]+\.(?:dev|io|me|com|app)\/[\w/.-]+)/gi;

const YEAR = "(?:19|20)\\d{2}";
const DATE_RE = new RegExp(
  `${YEAR}\\s*(?:-|–|to)\\s*(?:Present|Current|${YEAR})|${YEAR}\\s*[-–]\\s*(?:Present|Current)`,
  "i",
);
/** Experience entry opener: "Title — Company, 2021–Present" or "Title | Company | 2021". */
const ENTRY_RE = new RegExp(
  `^([^|,–—-]{2,90}?)\\s*(?:[–—-]|\\|)\\s*([^–—-]{2,80}?)\\s*(?:\\||,\\s*)*(${YEAR}.{0,40})$`,
);
const EDUCATION_RE =
  /^(B\.?(Tech|Sc|Eng|A|S)|M\.?(Tech|Sc|Eng|A|S)|Ph\.?D|MBA|BBA|PGDM|BE|ME)\b/i;
const SECTION_HEADERS =
  /^(summary|professional summary|profile|objective|work experience|professional experience|experience|education|technical skills|skills|core competencies|certifications|certificates|projects|publications|languages|volunteer)\s*:?\s*$/i;
const SKILLS_INLINE_RE = /^skills\s*:?\s*(.+)$/i;

/** Extract contact fields (email / phone / profile URLs) from any text. */
function extractContact(text: string): ResumeTemplate["contact"] {
  const contact: ResumeTemplate["contact"] = {};
  const email = text.match(EMAIL_RE);
  if (email) contact.email = email[0];
  const phone = text.match(PHONE_RE);
  if (phone) contact.phone = phone[0].replace(/\s+/g, " ").trim();
  const urls = text.match(URL_RE) ?? [];
  for (const url of urls) {
    if (/linkedin\.com/i.test(url)) contact.linkedin = url;
    else if (/github\.com/i.test(url)) contact.github = url;
    else if (!contact.portfolio) contact.portfolio = url;
  }
  return contact;
}

/** Guess the candidate name from the first plausible non-contact line. */
function extractName(lines: string[]): string | undefined {
  for (const raw of lines) {
    const line = raw.replace(/[|,]\s*$/, "").trim();
    if (!line) continue;
    if (
      /\d/.test(line) ||
      /@/.test(line) ||
      /https?:|www\./i.test(line) ||
      /(resume|cv|curriculum|profile|engineer|developer|analyst|manager)\s*$/i.test(line)
    ) {
      continue;
    }
    const words = line.split(/\s+/);
    if (words.length >= 2 && words.length <= 4 && words.every((w) => /^[A-Z][a-z-]*$/.test(w))) {
      return line;
    }
  }
  return undefined;
}

/** Parse the source into a populated template. */
export function mergeSourceIntoTemplate(
  template: ResumeTemplate,
  source: string,
): MergedResume {
  const lines = source.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const contact = extractContact(source);
  const name = extractName(lines);
  if (name) contact.name = name;

  const sections = { ...template.sections };
  const experience: NonNullable<ResumeTemplate["sections"]["experience"]> = [];
  const education: NonNullable<ResumeTemplate["sections"]["education"]> = [];
  const certifications: string[] = [];
  let skills: string[] = [];
  const summaryLines: string[] = [];
  let currentExp: (typeof experience)[number] | null = null;
  let inSection: string | null = null;
  let seeded = 0;

  const flush = () => {
    if (currentExp) {
      const hasReal = (currentExp.bullets ?? []).some((b) => b !== REFINE_PLACEHOLDER);
      if (!hasReal) {
        currentExp.bullets = [REFINE_PLACEHOLDER];
        seeded += 1;
      }
      experience.push(currentExp);
      currentExp = null;
    }
  };

  for (const line of lines) {
    // Section boundaries.
    if (SECTION_HEADERS.test(line)) {
      flush();
      inSection = line.toLowerCase().replace(/[:\s]/g, "");
      if (/^(skills|technicalskills|corecompetencies)$/i.test(inSection)) inSection = "skills";
      if (/^(experience|professionalexperience|workexperience)$/i.test(inSection)) inSection = "experience";
      if (/^(education)$/i.test(inSection)) inSection = "education";
      if (/^(certifications|certificates)$/i.test(inSection)) inSection = "certifications";
      continue;
    }

    // Inline "Skills: ..." carries its own block.
    const inlineSkills = line.match(SKILLS_INLINE_RE);
    if (inlineSkills) {
      inSection = "skills";
      skills.push(...(inlineSkills[1] ?? "").split(/,|\|/).map((s) => s.trim()).filter(Boolean));
      continue;
    }

    // Experience entry openers carry a year and a "Title — Company" shape.
    // Only applies in the preamble or the experience section itself (a degree
    // line like "B.Tech CS — NIT, 2014–2018" must stay education).
    const entryMatch = line.match(ENTRY_RE);
    if (
      entryMatch &&
      DATE_RE.test(line) &&
      !line.startsWith("[") &&
      (inSection === null || inSection === "experience")
    ) {
      flush();
      const dateMatch = line.match(DATE_RE);
      const title = (entryMatch[1] ?? "").trim();
      const company = (entryMatch[2] ?? "").trim();
      const rest = line.replace(entryMatch[1] ?? "", "").replace(entryMatch[2] ?? "", "").trim();
      currentExp = {
        id: `exp-${experience.length + 1}`,
        title,
        company,
        dates: (dateMatch?.[0] ?? rest).replace(/\s+/g, " ").trim(),
        bullets: [],
      };
      continue;
    }

    // Bullets attach to the current experience entry.
    if (currentExp && /^[•·-]\s+/.test(line)) {
      currentExp.bullets!.push(line.replace(/^[•·-]\s+/, "").trim());
      continue;
    }

    switch (inSection) {
      case "skills":
        if (!SECTION_HEADERS.test(line)) {
          skills.push(...line.split(/,|\|/).map((s) => s.trim()).filter(Boolean));
        }
        break;
      case "education": {
        const dateMatch = line.match(DATE_RE);
        const rest = dateMatch ? line.replace(dateMatch[0], "").trim() : line;
        const parts = rest.split(/[–—-]\s*/).map((p) => p.trim().replace(/,\s*$/, "")).filter(Boolean);
        if (parts.length === 0) break;
        education.push({
          degree: parts[0],
          institution: parts[1] ?? "",
          dates: dateMatch ? dateMatch[0].replace(/\s+/g, " ").trim() : undefined,
        });
        break;
      }
      case "certifications":
        certifications.push(line.replace(/^[•·-]\s+/, "").trim());
        break;
      case "experience":
        // A non-bullet line in the experience section without a year: treat as a
        // continuation bullet line (e.g. wrapped text). Only if it looks like prose.
        if (currentExp && !DATE_RE.test(line) && /[a-z]{4,}/.test(line)) {
          currentExp.bullets!.push(line.replace(/^[•·-]\s+/, "").trim());
        }
        break;
      default:
        // Before any section header, or in unknown sections, capture summary
        // prose but skip contact noise and the name.
        if (
          !EMAIL_RE.test(line) &&
          !PHONE_RE.test(line) &&
          !URL_RE.test(line) &&
          line !== name &&
          !EDUCATION_RE.test(line)
        ) {
          summaryLines.push(line);
        }
    }
  }
  flush();

  if (experience.length > 0) sections.experience = experience;
  if (education.length > 0) sections.education = education;
  if (skills.length > 0) {
    sections.skills = {
      ...(sections.skills ?? {}),
      categories: skills.map((item) => ({ name: "", items: [item] })),
      editable: true,
    };
  }
  if (certifications.length > 0) sections.certifications = certifications;

  const summaryBody = summaryLines
    .join(" ")
    .replace(/\s+/g, " ")
    .replace(/^(summary|professional summary)\s*:?\s*/i, "")
    .trim();
  if (summaryBody) {
    sections.summary = {
      ...(sections.summary ?? {}),
      content: summaryBody,
      editable: true,
    };
  }

  return {
    template: { ...template, contact: { ...template.contact, ...contact }, sections },
    seededEntries: seeded,
    contact,
  };
}
