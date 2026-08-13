import type { EnglishLocale } from "@rattlesnake/shared";

/**
 * US/UK English resolution for generated resumes.
 *
 * The job's location decides the English variant used throughout the resume:
 * spelling, terminology, dates, and currency. If the user supplied an explicit
 * `location` field it wins; otherwise the job description is scanned for
 * location markers. Anything unknown defaults to US English (the V1 role
 * prompts and templates are already US-flavoured).
 */

const UK_MARKERS = [
  "uk",
  "u.k.",
  "united kingdom",
  "great britain",
  "england",
  "scotland",
  "wales",
  "northern ireland",
  "british",
  "london",
  "manchester",
  "birmingham",
  "leeds",
  "edinburgh",
  "glasgow",
  "cardiff",
  "belfast",
  "bristol",
  "cambridge",
  "oxford",
  "liverpool",
  "sheffield",
  "nottingham",
  "newcastle",
  "gbp",
  "£",
];

const US_MARKERS = [
  "usa",
  "u.s.a.",
  "u.s.",
  "us",
  "united states",
  "america",
  "american",
  "new york",
  "california",
  "texas",
  "washington",
  "boston",
  "chicago",
  "seattle",
  "san francisco",
  "silicon valley",
  "bay area",
  "austin",
  "denver",
  "seattle",
  "remote (us)",
  "remote in the us",
  "remote - us",
];

const LOCALE_TITLE: Record<EnglishLocale, string> = {
  us: "US English",
  uk: "UK English",
};

const LOCALE_COUNTRY: Record<EnglishLocale, string> = {
  us: "the United States",
  uk: "the United Kingdom",
};

/**
 * Decide which English variant to write the resume in.
 * Explicit user location first; then the JD text; default "us".
 */
export function detectEnglishLocale(
  jobLocation: string | undefined,
  jobDescription: string,
): EnglishLocale {
  const text = (jobLocation ?? "").toLowerCase();
  if (hasAny(text, UK_MARKERS)) return "uk";
  if (hasAny(text, US_MARKERS)) return "us";

  const jd = (jobDescription ?? "").toLowerCase();
  if (hasAny(jd, UK_MARKERS)) return "uk";
  if (hasAny(jd, US_MARKERS)) return "us";

  return "us";
}

function hasAny(text: string, markers: string[]): boolean {
  return markers.some((marker) => text.includes(marker));
}

/**
 * Standardized instruction block appended to the role system prompt so the
 * generated resume matches the English conventions of the job's country.
 */
export function buildEnglishVariantDirective(locale: EnglishLocale): string {
  const us = locale === "us";
  const spelling = us
    ? "US spellings (-ize/-yze: organize, analyze, specialize; -or: color, behavior, center, theater; single-L: traveled, modeled; -og: catalog, dialog; -ense: defense, license)"
    : "UK spellings (-ise/-yse: organise, analyse, specialise; -our: colour, behaviour, centre, theatre; double-L: travelled, modelling; -ogue: catalogue, dialogue; -ence: defence, licence)";
  const terminology = us
    ? "US terminology (resume, cell/mobile phone, US-style job titles like 'Senior Software Engineer', $ / USD)"
    : "UK terminology (CV, mobile phone, UK-style job titles, £ / GBP, 'informed/pragmatic' professional register)";
  const dates = us
    ? "US date format (e.g. May 2024; MM/DD/YYYY if a full date is needed)"
    : "UK date format (e.g. May 2024; DD/MM/YYYY if a full date is needed)";

  return [
    `## ENGLISH VARIANT — ${LOCALE_TITLE[locale]}`,
    `This job is based in ${LOCALE_COUNTRY[locale]}. Write the ENTIRE resume in ${LOCALE_TITLE[locale]}:`,
    `- Spelling: ${spelling}.`,
    `- Terminology: ${terminology}.`,
    `- Dates: ${dates}.`,
    `- Apply the variant consistently to the summary, every bullet, skill labels, and section headings.`,
    `- Do NOT mix spellings from the other variant (no ${
      us ? "British" : "American"
    } spellings in a ${us ? "US" : "UK"} resume).`,
  ].join("\n");
}

export { LOCALE_TITLE, LOCALE_COUNTRY };
