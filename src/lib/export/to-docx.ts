import {
  Document, Packer, Paragraph, TextRun, AlignmentType,
  BorderStyle, TabStopPosition, TabStopType, convertInchesToTwip,
  ExternalHyperlink,
} from 'docx';
import type { PageFormat } from './index';
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

const FONT = 'Calibri';
const SZ_NAME   = 32; // half-points
const SZ_ROLE   = 22;
const SZ_CONTACT= 18;
const SZ_SECTION= 22;
const SZ_BODY   = 20;
const SZ_SMALL  = 18;

const COLOR_DARK    = '0f172a';
const COLOR_MID     = '475569';
const COLOR_LIGHT   = '94a3b8';
const COLOR_BLUE    = '2563EB';

function hr(): Paragraph {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BLUE, space: 3 } },
    spacing: { before: 0, after: 100 },
    children: [],
  });
}

function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, font: FONT, size: SZ_SECTION, bold: true, color: COLOR_DARK })],
    border: { bottom: { style: BorderStyle.SINGLE, size: 3, color: COLOR_BLUE, space: 2 } },
    spacing: { before: 220, after: 100 },
  });
}

function bodyRun(text: string, opts: { bold?: boolean; italic?: boolean; color?: string; size?: number } = {}): TextRun {
  return new TextRun({
    text,
    font: FONT,
    size: opts.size ?? SZ_BODY,
    bold: opts.bold,
    italics: opts.italic,
    color: opts.color ?? COLOR_DARK,
  });
}

/** Parses "text **bold** more" into TextRun array for DOCX. */
function boldRuns(text: string): TextRun[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map(part =>
    part.startsWith('**') && part.endsWith('**')
      ? bodyRun(part.slice(2, -2), { bold: true })
      : bodyRun(part)
  );
}

const PAGE_SIZES: Record<PageFormat, { width: number; height: number }> = {
  letter: { width: convertInchesToTwip(8.5), height: convertInchesToTwip(11) },
  a4:     { width: convertInchesToTwip(8.27), height: convertInchesToTwip(11.69) },
};

function rightTab(): typeof TabStopPosition.MAX {
  return TabStopPosition.MAX;
}

export async function buildDocx(
  content: string,
  role: string,
  company: string,
  options?: { excludedSections?: string[]; pageFormat?: PageFormat }
): Promise<Blob> {
  let data: ResumeData;
  try {
    data = JSON.parse(extractResumeJson(content)) as ResumeData;
  } catch {
    data = { role };
  }

  const excluded = new Set([...(options?.excludedSections ?? []), ...(data.excludedSections ?? [])]);
  const skip = (s: string) => excluded.has(s);

  const c = data.contact ?? {};
  const displayName = c.name ?? data.role ?? role;
  const displayRole = c.name ? (data.role ?? role) : undefined;

  // Candidate metadata for the document (looks like Word-authored file)
  const authorName = c.name ?? 'Candidate';
  const authorMeta = c.email ? `${authorName} <${c.email}>` : authorName;

  const children: Paragraph[] = [];

  // ── Name ──────────────────────────────────────────────────────────────────
  children.push(new Paragraph({
    children: [new TextRun({ text: displayName, font: FONT, size: SZ_NAME, bold: true, color: COLOR_DARK })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 40 },
  }));

  // ── Role subtitle ─────────────────────────────────────────────────────────
  if (displayRole) {
    children.push(new Paragraph({
      children: [new TextRun({ text: displayRole, font: FONT, size: SZ_ROLE, color: COLOR_MID })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
    }));
  }

  // ── Primary contact: Email | Phone | Location ─────────────────────────────
  const primary = [c.email, c.phone, c.location].filter(Boolean) as string[];
  if (primary.length > 0) {
    children.push(new Paragraph({
      children: [new TextRun({ text: primary.join('  |  '), font: FONT, size: SZ_CONTACT, color: COLOR_MID })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 30 },
    }));
  }

  // ── Secondary contact: LinkedIn | GitHub | Portfolio ──────────────────────
  const secondary = [c.linkedin, c.github, c.portfolio].filter(Boolean) as string[];
  if (secondary.length > 0) {
    children.push(new Paragraph({
      children: secondary.flatMap((url, i) => {
        const link = new ExternalHyperlink({
          link: url.startsWith('http') ? url : `https://${url}`,
          children: [new TextRun({ text: url, font: FONT, size: SZ_SMALL, color: COLOR_BLUE, style: 'Hyperlink' })],
        });
        if (i < secondary.length - 1) {
          return [link, new TextRun({ text: '  |  ', font: FONT, size: SZ_SMALL, color: COLOR_LIGHT })];
        }
        return [link];
      }),
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
    }));
  }

  children.push(hr());

  // ── Summary ───────────────────────────────────────────────────────────────
  if (!skip('summary') && data.sections?.summary?.content) {
    children.push(sectionHeading('Summary'));
    children.push(new Paragraph({
      children: [bodyRun(data.sections.summary.content)],
      spacing: { after: 80 },
    }));
  }

  // ── Skills ────────────────────────────────────────────────────────────────
  if (!skip('skills') && data.sections?.skills?.categories?.length) {
    children.push(sectionHeading('Skills'));
    for (const cat of data.sections.skills.categories) {
      if (!cat.name || !cat.items?.length) continue;
      children.push(new Paragraph({
        children: [
          bodyRun(`${cat.name}: `, { bold: true }),
          bodyRun(cat.items.join(', ')),
        ],
        spacing: { after: 50 },
      }));
    }
  }

  // ── Work Experience ───────────────────────────────────────────────────────
  if (!skip('experience') && data.sections?.experience?.length) {
    children.push(sectionHeading('Work Experience'));
    for (const exp of data.sections.experience) {
      // Title (left) ··· Dates (right)
      children.push(new Paragraph({
        children: [
          bodyRun(exp.title ?? '', { bold: true }),
          new TextRun({ text: '\t', font: FONT }),
          bodyRun(exp.dates ?? '', { color: COLOR_MID, size: SZ_SMALL }),
        ],
        tabStops: [{ type: TabStopType.RIGHT, position: rightTab() }],
        spacing: { before: 120, after: 30 },
      }));
      // Company (left) ··· Location (right)
      children.push(new Paragraph({
        children: [
          bodyRun(exp.company ?? '', { italic: true, color: COLOR_MID }),
          new TextRun({ text: '\t', font: FONT }),
          bodyRun(exp.location ?? '', { color: COLOR_LIGHT, size: SZ_SMALL }),
        ],
        tabStops: [{ type: TabStopType.RIGHT, position: rightTab() }],
        spacing: { after: 70 },
      }));
      for (const b of exp.bullets ?? []) {
        children.push(new Paragraph({
          children: boldRuns(b),
          bullet: { level: 0 },
          spacing: { after: 40 },
        }));
      }
    }
  }

  // ── Education ─────────────────────────────────────────────────────────────
  if (!skip('education') && data.sections?.education?.length) {
    children.push(sectionHeading('Education'));
    for (const ed of data.sections.education) {
      // Degree (left) ··· Year (right)
      children.push(new Paragraph({
        children: [
          bodyRun(ed.degree ?? '', { bold: true }),
          new TextRun({ text: '\t', font: FONT }),
          bodyRun(ed.year ?? '', { color: COLOR_MID, size: SZ_SMALL }),
        ],
        tabStops: [{ type: TabStopType.RIGHT, position: rightTab() }],
        spacing: { before: 100, after: 30 },
      }));
      // Institution + Location
      const instLine = [ed.institution, ed.location].filter(Boolean).join(', ');
      if (instLine) {
        children.push(new Paragraph({
          children: [bodyRun(instLine, { italic: true, color: COLOR_MID })],
          spacing: { after: ed.gpa ? 30 : 60 },
        }));
      }
      if (ed.gpa) {
        children.push(new Paragraph({
          children: [bodyRun(`GPA: ${ed.gpa}`, { color: COLOR_LIGHT, size: SZ_SMALL })],
          spacing: { after: 60 },
        }));
      }
    }
  }

  // ── Certifications ────────────────────────────────────────────────────────
  if (!skip('certifications') && data.sections?.certifications?.length) {
    children.push(sectionHeading('Certifications'));
    for (const cert of data.sections.certifications) {
      children.push(new Paragraph({
        children: boldRuns(cert),
        bullet: { level: 0 },
        spacing: { after: 40 },
      }));
    }
  }

  const pageSize = PAGE_SIZES[options?.pageFormat ?? 'letter'];

  const doc = new Document({
    creator: authorMeta,
    lastModifiedBy: authorMeta,
    title: `${displayName} — ${displayRole ?? role} Resume`,
    subject: `${displayRole ?? role} Resume`,
    description: company ? `Tailored for ${company}` : `Resume`,
    keywords: data.sections?.skills?.categories
      ?.flatMap(c => c.items ?? [])
      .slice(0, 10)
      .join(', ') ?? '',
    revision: 1,
    sections: [{
      properties: {
        page: {
          size: pageSize,
          margin: {
            top:    convertInchesToTwip(0.75),
            right:  convertInchesToTwip(0.75),
            bottom: convertInchesToTwip(0.75),
            left:   convertInchesToTwip(0.75),
          },
        },
      },
      children,
    }],
  });

  return Packer.toBlob(doc);
}
