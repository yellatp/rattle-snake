import type { EnglishLocale, ResumeMeta } from "@rattlesnake/shared";

/**
 * Resume domain types for the sophisticated resume generator.
 *
 * These mirror the role-targeted template + prompt system ported from the
 * Rattle-Snake V1 generator: a role-specific JSON template is pre-filled from
 * the candidate's base resume, then rewritten by the role system prompt.
 */

export type { EnglishLocale, ResumeMeta };

export interface ResumeContact {
  name?: string;
  location?: string;
  phone?: string;
  email?: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
}

export interface ExperienceEntry {
  id?: string;
  title?: string;
  company?: string;
  location?: string;
  dates?: string;
  locked?: boolean;
  bullets?: string[];
}

export interface EducationEntry {
  degree?: string;
  institution?: string;
  location?: string;
  dates?: string;
}

export interface SkillCategory {
  name?: string;
  items?: string[];
}

export interface ResumeTemplate {
  role: string;
  slug: string;
  contact: ResumeContact;
  sections: {
    summary?: { content?: string; editable?: boolean };
    skills?: { categories?: SkillCategory[]; editable?: boolean };
    experience?: ExperienceEntry[];
    education?: EducationEntry[];
    certifications?: string[];
    coreCompetencies?: string[];
  };
  ats_keywords: string[];
  system_prompt_ref?: string;
}
