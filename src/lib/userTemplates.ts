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
  'TECHNICAL SKILLS', 'SKILLS', 'EXPERIENCE', 'EDUCATION',
  'CERTIFICATIONS', 'SUMMARY', 'PROFESSIONAL SUMMARY', 'OBJECTIVE',
];

function detectSection(line: string): string | null {
  const upper = line.trim().toUpperCase();
  return SECTION_HEADERS.find(h => upper === h || upper.startsWith(h)) ?? null;
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

function parseExperienceBlock(lines: string[]): UserTemplate['sections']['experience'] {
  const experiences: UserTemplate['sections']['experience'] = [];
  let current: UserTemplate['sections']['experience'][0] | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Detect job title line — contains pipe separator or matches "Title | Company" pattern
    const titleMatch = trimmed.match(/^(.+?)\s+\|\s+(.+?)\s+\|\s+(.+?)\s+\|\s+(.+)$/) ||
                       trimmed.match(/^(.+?)\s+\|\s+(.+?)\s+\|\s+(.+)$/) ||
                       trimmed.match(/^(.+?)\s+\|\s+(.+)$/);

    // Date pattern: "Jul 2025 - Present" or "Sep 2021 - May 2022"
    const datePattern = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}\s*[-]\s*(Present|\w+\s+\d{4})\b/i;
    const dateMatch = trimmed.match(datePattern);

    if (titleMatch && dateMatch) {
      if (current) experiences.push(current);
      // Parse: "Title | Company | Location\tDate" format from docx
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
    } else if (dateMatch && !current?.dates) {
      if (current) current.dates = dateMatch[0];
    } else if (current && (trimmed.startsWith('-') || trimmed.startsWith('•') || trimmed.length > 40)) {
      const bullet = trimmed.replace(/^[-•]\s*/, '').trim();
      // Remove EM-dashes
      const cleanBullet = bullet.replace(/—/g, ', ').replace(/–/g, '-');
      if (cleanBullet.length > 20) current.bullets.push(cleanBullet);
    }
  }

  if (current) experiences.push(current);
  return experiences.filter(e => e.bullets.length >= 2);
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
  // Clean EM-dashes globally
  const text = rawText.replace(/—/g, ', ').replace(/–/g, '-');
  const lines = text.split('\n').map(l => l.trim());

  let currentSection = 'HEADER';
  const sectionLines: Record<string, string[]> = {
    HEADER: [], SUMMARY: [], SKILLS: [], EXPERIENCE: [], EDUCATION: [], CERTIFICATIONS: [],
  };

  // Extract name (first non-empty line) and contact
  let name = '';
  let titleLine = '';
  const contactLines: string[] = [];

  for (let i = 0; i < Math.min(lines.length, 8); i++) {
    const l = lines[i].trim();
    if (!l) continue;
    if (!name) { name = l; continue; }
    if (!titleLine && !l.includes('|') && !l.includes('@')) { titleLine = l; continue; }
    if (l.includes('|')) { contactLines.push(l); }
  }

  const contact: UserTemplate['contact'] = { name };
  for (const cl of contactLines) {
    Object.assign(contact, parseContactLine(cl));
  }

  for (const line of lines) {
    const section = detectSection(line);
    if (section) {
      if (section.includes('SKILL')) currentSection = 'SKILLS';
      else if (section.includes('EXPERIENCE')) currentSection = 'EXPERIENCE';
      else if (section.includes('EDUCATION')) currentSection = 'EDUCATION';
      else if (section.includes('CERTIF')) currentSection = 'CERTIFICATIONS';
      else if (section.includes('SUMMARY') || section.includes('OBJECTIVE')) currentSection = 'SUMMARY';
      continue;
    }
    if (sectionLines[currentSection]) sectionLines[currentSection].push(line);
  }

  const summary = sectionLines.SUMMARY
    .filter(l => l.trim().length > 30)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  const certifications = sectionLines.CERTIFICATIONS
    .filter(l => l.trim().length > 5)
    .map(l => l.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean);

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
      experience: parseExperienceBlock(sectionLines.EXPERIENCE),
      education: parseEducationBlock(sectionLines.EDUCATION),
      certifications,
    },
    ats_keywords: [],
    system_prompt_ref: 'data_scientist',
    isUserTemplate: true,
  };
}
