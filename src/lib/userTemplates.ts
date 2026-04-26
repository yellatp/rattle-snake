export interface UserTemplate {
  id: string;
  role: string;
  slug: string;
  rawText: string;
  fileName: string;
  uploadedAt: string;
  contact?: {
    name?: string;
    email?: string;
    phone?: string;
    location?: string;
    linkedin?: string;
    github?: string;
    portfolio?: string;
  };
  sections: {
    summary: { content: string; editable: boolean };
    skills: { categories: Array<{ name: string; items: string[] }>; editable: boolean };
    experience: Array<{
      id: string;
      title: string;
      company: string;
      location: string;
      dates: string;
      bullets: string[];
      locked: boolean;
    }>;
    education: Array<{
      id: string;
      degree: string;
      institution: string;
      location: string;
      year: string;
    }>;
    certifications: string[];
  };
  ats_keywords: string[];
  system_prompt_ref: string;
  isUserTemplate: true;
}

const STORE_KEY = 'rf_user_templates';

export function getUserTemplates(): UserTemplate[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]') as UserTemplate[];
  } catch {
    return [];
  }
}

export function saveUserTemplate(template: UserTemplate): void {
  const all = getUserTemplates().filter(t => t.id !== template.id);
  localStorage.setItem(STORE_KEY, JSON.stringify([template, ...all]));
}

export function deleteUserTemplate(id: string): void {
  const all = getUserTemplates().filter(t => t.id !== id);
  localStorage.setItem(STORE_KEY, JSON.stringify(all));
}

// ─── Parse raw DOCX text into structured template JSON ─────────────────────

function uid(): string {
  return crypto.randomUUID();
}

function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

const SECTION_HEADERS = [
  'TECHNICAL SKILLS', 'SKILLS', 'WORK EXPERIENCE', 'EXPERIENCE', 'PROFESSIONAL EXPERIENCE',
  'EMPLOYMENT HISTORY', 'CAREER HISTORY', 'EDUCATION', 'ACADEMIC BACKGROUND',
  'CERTIFICATIONS', 'LICENSES', 'AWARDS', 'SUMMARY', 'PROFESSIONAL SUMMARY',
  'CAREER SUMMARY', 'OBJECTIVE', 'PROJECTS', 'PERSONAL PROJECTS', 'KEY PROJECTS',
  'NOTABLE PROJECTS', 'SIDE PROJECTS', 'OPEN SOURCE',
];

function detectSection(line: string): string | null {
  const upper = line.trim().toUpperCase().replace(/[^A-Z\s]/g, '');
  for (const h of SECTION_HEADERS) {
    if (upper === h || upper.startsWith(h)) return h;
  }
  // Fallback: only detect lines that are already ALL-CAPS in the source
  // (avoids matching proper names like "Jane Smith" or "Senior Data Scientist")
  const original = line.trim();
  const isAlreadyUpperCase = original.replace(/[^A-Za-z]/g, '').length > 0 &&
    original.replace(/[^A-Za-z]/g, '') === original.replace(/[^A-Za-z]/g, '').toUpperCase();
  if (isAlreadyUpperCase && upper.length >= 5 && upper.length <= 40 &&
      /^[A-Z\s]+$/.test(upper) && !upper.includes('  ')) {
    const candidate = upper.trim();
    if (candidate.split(' ').length <= 4) return candidate;
  }
  return null;
}

function parseContactLine(line: string): Partial<UserTemplate['contact']> {
  const contact: Partial<UserTemplate['contact']> = {};
  const parts = line.split(/\|/).map(p => p.trim()).filter(Boolean);
  for (const part of parts) {
    if (part.includes('@')) contact.email = part;
    else if (part.match(/^\+?\d/)) contact.phone = part;
    else if (part.includes('linkedin.com')) contact.linkedin = part.replace(/^https?:\/\//, '');
    else if (part.includes('github.com')) contact.github = part.replace(/^https?:\/\//, '');
    else if (part.includes('.')) contact.portfolio = part;
    else if (part.match(/,\s*(TX|CA|NY|WA|FL|IL|MA|CO|GA|OR|PA|AZ|NV|MN|NC|VA)/i)) contact.location = part;
  }
  return contact;
}

// Action verbs commonly used to start resume bullets
const ACTION_VERBS = /^(Led|Built|Designed|Developed|Created|Implemented|Managed|Improved|Increased|Reduced|Delivered|Architected|Deployed|Automated|Collaborated|Launched|Owned|Drove|Scaled|Maintained|Optimized|Streamlined|Established|Mentored|Coordinated|Analyzed|Researched|Engineered|Integrated|Migrated|Refactored|Wrote|Trained|Achieved|Generated|Produced|Executed|Spearheaded|Pioneered|Introduced|Transformed|Worked|Supported|Assisted|Contributed)/i;

function cleanBullet(text: string): string {
  return text
    .replace(/^[-•*·▪▸→]\s*/, '')
    .replace(/—/g, ', ')
    .replace(/–/g, '-')
    .trim();
}

function parseExperienceBlock(lines: string[]): UserTemplate['sections']['experience'] {
  const experiences: UserTemplate['sections']['experience'] = [];
  let current: UserTemplate['sections']['experience'][0] | null = null;

  // Date pattern: "Jul 2025 - Present", "Sep 2021 - May 2022", "2021 - 2023", "2021 – Present"
  const datePattern = /(\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+)?\d{4}\s*[-–]\s*(Present|\d{4}|(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4})/i;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const dateMatch = trimmed.match(datePattern);

    // Detect job title line by pipe separator
    const hasPipe = trimmed.includes(' | ') || trimmed.includes(' | ');
    const titleMatch = hasPipe
      ? trimmed.match(/^(.+?)\s+\|\s+(.+?)\s+\|\s+(.+?)\s+\|\s+(.+)$/) ||
        trimmed.match(/^(.+?)\s+\|\s+(.+?)\s+\|\s+(.+)$/) ||
        trimmed.match(/^(.+?)\s+\|\s+(.+)$/)
      : null;

    if (titleMatch && dateMatch) {
      if (current) experiences.push(current);
      const parts = trimmed.split(/\s+\|\s+/);
      current = {
        id: uid(),
        title: (parts[0] ?? '').trim(),
        company: (parts[1] ?? '').trim(),
        location: (parts[2] ?? '').replace(dateMatch[0], '').trim(),
        dates: dateMatch[0],
        bullets: [],
        locked: false,
      };
    } else if (dateMatch && current && !current.dates) {
      current.dates = dateMatch[0];
    } else if (dateMatch && !current) {
      // Standalone date line — possibly a new entry whose title was on a previous line
    } else if (current) {
      const isBullet = trimmed.startsWith('-') || trimmed.startsWith('•') ||
                       trimmed.startsWith('*') || trimmed.startsWith('·') ||
                       trimmed.startsWith('▪') || trimmed.startsWith('▸') ||
                       trimmed.startsWith('→');
      const isActionVerb = ACTION_VERBS.test(trimmed);
      const isLongLine = trimmed.length > 40;

      if (isBullet || (isActionVerb && isLongLine) || isLongLine) {
        const cb = cleanBullet(trimmed);
        if (cb.length > 20) current.bullets.push(cb);
      }
    }
  }

  if (current) experiences.push(current);
  // Keep entries with at least 1 bullet; discard only completely empty ones
  return experiences.filter(e => e.title.length > 1);
}

function parseSkillsBlock(lines: string[]): UserTemplate['sections']['skills'] {
  const categories: Array<{ name: string; items: string[] }> = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // "Category Name    item1, item2, item3" or "Category Name  |  items"
    const tabMatch = trimmed.match(/^([A-Z][^|]+?)\s{2,}(.+)$/) ||
                     trimmed.match(/^([A-Z][^|]+?)\s*\|\s*(.+)$/);
    if (tabMatch) {
      const name = tabMatch[1].trim();
      const items = tabMatch[2].split(/[,;]/).map(i => i.trim()).filter(i => i.length > 1);
      if (items.length > 0) categories.push({ name, items });
    }
  }

  if (categories.length === 0) {
    // Fallback: treat each line as a category with comma-separated items
    const all: string[] = [];
    for (const line of lines) {
      const parts = line.split(/[,;]/).map(p => p.trim()).filter(p => p.length > 2);
      all.push(...parts);
    }
    if (all.length > 0) {
      categories.push({ name: 'Skills', items: all });
    }
  }

  return { categories, editable: true };
}

function parseEducationBlock(lines: string[]): UserTemplate['sections']['education'] {
  const education: UserTemplate['sections']['education'] = [];
  const yearPattern = /\b(19|20)\d{2}\b/;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const yearMatch = trimmed.match(/\b(Aug|Sep|Jan|Feb|Mar|Apr|May|Jun|Jul|Oct|Nov|Dec)\s+(19|20)\d{2}\b.*?(19|20)\d{2}\b/i);
    const singleYear = trimmed.match(yearPattern);

    if (yearMatch || singleYear) {
      const parts = trimmed.split(/\s+\|\s+/);
      const year = (trimmed.match(/\b(19|20\d{2})\b/g) ?? []).pop() ?? '';
      education.push({
        id: uid(),
        degree: (parts[0] ?? trimmed).replace(/\s+\|.*$/, '').trim(),
        institution: (parts[1] ?? '').trim(),
        location: (parts[2] ?? '').replace(yearPattern, '').trim(),
        year,
      });
    }
  }

  return education;
}

export function parseDocxText(rawText: string, role: string): UserTemplate {
  // Clean EM-dashes and smart quotes globally
  const text = rawText
    .replace(/—/g, ', ')   // em-dash
    .replace(/–/g, '-')    // en-dash
    .replace(/‘|’/g, "'")  // smart single quotes
    .replace(/“|”/g, '"'); // smart double quotes
  const lines = text.split('\n').map(l => l.trim());

  let currentSection = 'HEADER';
  const sectionLines: Record<string, string[]> = {
    HEADER: [], SUMMARY: [], SKILLS: [], EXPERIENCE: [], EDUCATION: [],
    CERTIFICATIONS: [], PROJECTS: [],
  };

  // Determine header boundary (first 10 non-empty lines or until we hit a known section)
  let name = '';
  let titleLine = '';
  const contactLines: string[] = [];
  let headerDone = false;
  let nonEmptyCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l) continue;
    if (!headerDone) {
      const sec = detectSection(l);
      if (sec) { headerDone = true; }
      else {
        nonEmptyCount++;
        if (!name) { name = l; }
        else if (!titleLine && !l.includes('|') && !l.includes('@') && !l.match(/^\+?\d/) && l.length < 60) {
          titleLine = l;
        } else if (l.includes('|') || l.includes('@') || l.match(/^\+?\d/) || l.includes('linkedin') || l.includes('github')) {
          contactLines.push(l);
        }
        if (nonEmptyCount >= 8) headerDone = true;
        continue;
      }
    }

    const section = detectSection(l);
    if (section) {
      if (section.includes('SKILL')) currentSection = 'SKILLS';
      else if (section.includes('EXPERIENCE') || section.includes('EMPLOYMENT') || section.includes('CAREER')) currentSection = 'EXPERIENCE';
      else if (section.includes('EDUCATION') || section.includes('ACADEMIC')) currentSection = 'EDUCATION';
      else if (section.includes('CERTIF') || section.includes('LICENSE') || section.includes('AWARD')) currentSection = 'CERTIFICATIONS';
      else if (section.includes('SUMMARY') || section.includes('OBJECTIVE')) currentSection = 'SUMMARY';
      else if (section.includes('PROJECT') || section.includes('OPEN SOURCE')) currentSection = 'PROJECTS';
      continue;
    }
    if (sectionLines[currentSection]) sectionLines[currentSection].push(l);
  }

  const contact: UserTemplate['contact'] = { name };
  for (const cl of contactLines) {
    Object.assign(contact, parseContactLine(cl));
  }

  const summary = sectionLines.SUMMARY
    .filter(l => l.trim().length > 30)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  const certifications = sectionLines.CERTIFICATIONS
    .filter(l => l.trim().length > 5)
    .map(l => l.replace(/^[-*•]\s*/, '').trim())
    .filter(Boolean);

  // Merge PROJECTS into EXPERIENCE (projects = additional experience entries)
  const allExperienceLines = [...sectionLines.EXPERIENCE, '', ...sectionLines.PROJECTS];

  return {
    id: uid(),
    role,
    slug: slugify(role),
    rawText: text,
    fileName: '',
    uploadedAt: new Date().toISOString(),
    contact,
    sections: {
      summary: { content: summary, editable: true },
      skills: parseSkillsBlock(sectionLines.SKILLS),
      experience: parseExperienceBlock(allExperienceLines),
      education: parseEducationBlock(sectionLines.EDUCATION),
      certifications,
    },
    ats_keywords: [],
    system_prompt_ref: 'data_scientist',
    isUserTemplate: true,
  };
}
