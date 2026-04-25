import { extractResumeJson } from './extract-json';

interface ResumeData {
  role?: string;
  contact?: {
    name?: string; email?: string; phone?: string; location?: string;
    linkedin?: string; github?: string; portfolio?: string;
  };
  sections?: {
    summary?: { content?: string };
    skills?: { categories?: Array<{ name?: string; items?: string[] }> };
    experience?: Array<{
      title?: string; company?: string; location?: string;
      dates?: string; bullets?: string[];
    }>;
    education?: Array<{
      degree?: string; institution?: string; location?: string;
      year?: string; gpa?: string;
    }>;
    certifications?: string[];
  };
  excludedSections?: string[];
}

const SEP = '─'.repeat(60);
const PAD = 60; // column width for right-alignment in plaintext

function rightAlign(left: string, right: string): string {
  const gap = Math.max(1, PAD - left.length - right.length);
  return left + ' '.repeat(gap) + right;
}

export function buildPlaintext(
  content: string,
  options?: { excludedSections?: string[] }
): string {
  let data: ResumeData;
  try {
    data = JSON.parse(extractResumeJson(content)) as ResumeData;
  } catch {
    return content;
  }

  const excluded = new Set([...(options?.excludedSections ?? []), ...(data.excludedSections ?? [])]);
  const skip = (s: string) => excluded.has(s);

  const c = data.contact ?? {};
  const lines: string[] = [];

  // ── Header ────────────────────────────────────────────────────────────────
  const displayName = c.name ?? data.role ?? '';
  if (displayName) lines.push(displayName.toUpperCase());
  if (c.name && data.role) lines.push(data.role);

  const primary = [c.email, c.phone, c.location].filter(Boolean);
  if (primary.length) lines.push(primary.join('  |  '));

  const secondary = [c.linkedin, c.github, c.portfolio].filter(Boolean);
  if (secondary.length) lines.push(secondary.join('  |  '));

  lines.push('');

  // ── Summary ───────────────────────────────────────────────────────────────
  if (!skip('summary') && data.sections?.summary?.content) {
    lines.push('SUMMARY');
    lines.push(SEP);
    lines.push(data.sections.summary.content);
    lines.push('');
  }

  // ── Skills ────────────────────────────────────────────────────────────────
  if (!skip('skills') && data.sections?.skills?.categories?.length) {
    lines.push('SKILLS');
    lines.push(SEP);
    for (const cat of data.sections.skills.categories) {
      if (cat.name && cat.items?.length) {
        lines.push(`${cat.name}: ${cat.items.join(', ')}`);
      }
    }
    lines.push('');
  }

  // ── Work Experience ───────────────────────────────────────────────────────
  if (!skip('experience') && data.sections?.experience?.length) {
    lines.push('WORK EXPERIENCE');
    lines.push(SEP);
    for (const exp of data.sections.experience) {
      lines.push(rightAlign(exp.title ?? '', exp.dates ?? ''));
      lines.push(rightAlign(exp.company ?? '', exp.location ?? ''));
      for (const b of exp.bullets ?? []) lines.push(`  • ${b}`);
      lines.push('');
    }
  }

  // ── Education ─────────────────────────────────────────────────────────────
  if (!skip('education') && data.sections?.education?.length) {
    lines.push('EDUCATION');
    lines.push(SEP);
    for (const ed of data.sections.education) {
      lines.push(rightAlign(ed.degree ?? '', ed.year ?? ''));
      const inst = [ed.institution, ed.location].filter(Boolean).join(', ');
      if (inst) lines.push(inst);
      if (ed.gpa) lines.push(`GPA: ${ed.gpa}`);
      lines.push('');
    }
  }

  // ── Certifications ────────────────────────────────────────────────────────
  if (!skip('certifications') && data.sections?.certifications?.length) {
    lines.push('CERTIFICATIONS');
    lines.push(SEP);
    for (const cert of data.sections.certifications) lines.push(`  • ${cert}`);
    lines.push('');
  }

  return lines.join('\n');
}
