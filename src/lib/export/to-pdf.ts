import { jsPDF } from 'jspdf';
import { extractResumeJson } from './extract-json';
import type { PageFormat } from './index';

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
      degree?: string; institution?: string; location?: string; year?: string; gpa?: string;
    }>;
    certifications?: string[];
  };
  excludedSections?: string[];
}

const MARGIN = 15;
const BLUE:  [number, number, number] = [37, 99, 235];
const DARK:  [number, number, number] = [15, 23, 42];
const MID:   [number, number, number] = [71, 85, 105];
const LIGHT: [number, number, number] = [148, 163, 184];
const BODY:  [number, number, number] = [30, 41, 59];

const PAGE_DIMS: Record<PageFormat, { w: number; h: number }> = {
  letter: { w: 216, h: 279 },
  a4:     { w: 210, h: 297 },
};

/** Parses "text **bold** more" into typed segments. */
function parseBoldSegments(text: string): Array<{ text: string; bold: boolean }> {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map(part =>
    part.startsWith('**') && part.endsWith('**')
      ? { text: part.slice(2, -2), bold: true }
      : { text: part, bold: false }
  );
}

/** Renders text with inline **bold** support, word-wraps to maxRight, returns new y. */
function renderMixedText(
  doc: jsPDF,
  text: string,
  startX: number,
  maxRight: number,
  startY: number,
  fontSize: number,
  color: [number, number, number]
): number {
  const lh = 4.5;
  const tokens: Array<{ word: string; bold: boolean }> = [];
  for (const seg of parseBoldSegments(text)) {
    for (const w of seg.text.split(/\s+/).filter(Boolean)) {
      tokens.push({ word: w, bold: seg.bold });
    }
  }

  let cx = startX;
  let cy = startY;

  for (const tok of tokens) {
    doc.setFont('helvetica', tok.bold ? 'bold' : 'normal');
    doc.setFontSize(fontSize);
    doc.setTextColor(...color);

    const spaceW = cx > startX ? doc.getTextWidth(' ') : 0;
    const wordW  = doc.getTextWidth(tok.word);

    if (cx > startX && cx + spaceW + wordW > maxRight) {
      cy += lh;
      cx = startX;
    } else if (cx > startX) {
      doc.setFont('helvetica', 'normal');
      doc.text(' ', cx, cy);
      cx += spaceW;
    }

    doc.setFont('helvetica', tok.bold ? 'bold' : 'normal');
    doc.text(tok.word, cx, cy);
    cx += wordW;
  }

  return cy + lh;
}

export async function buildPdf(
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
  const authorName  = c.name ?? 'Candidate';
  const authorMeta  = c.email ? `${authorName} <${c.email}>` : authorName;

  const fmt    = options?.pageFormat ?? 'letter';
  const PAGE_W = PAGE_DIMS[fmt].w;
  const PAGE_H = PAGE_DIMS[fmt].h;
  const CONTENT = PAGE_W - MARGIN * 2;

  const doc = new jsPDF({ unit: 'mm', format: fmt, orientation: 'portrait' });
  doc.setProperties({
    title:   `${displayName} — ${displayRole ?? role} Resume`,
    subject: `${displayRole ?? role} Resume`,
    author:  authorMeta,
    creator: authorMeta,
    keywords: data.sections?.skills?.categories
      ?.flatMap(c => c.items ?? [])
      .slice(0, 10)
      .join(', ') ?? '',
  });

  let y = MARGIN;

  const checkPage = (needed: number) => {
    if (y + needed > PAGE_H - MARGIN) { doc.addPage(); y = MARGIN; }
  };

  // ── Name ──────────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...DARK);
  doc.text(displayName, PAGE_W / 2, y, { align: 'center' });
  y += 6;

  // ── Role subtitle ─────────────────────────────────────────────────────────
  if (displayRole) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...MID);
    doc.text(displayRole, PAGE_W / 2, y, { align: 'center' });
    y += 5;
  }

  // ── Primary: Email | Phone | Location ─────────────────────────────────────
  const primary = [c.email, c.phone, c.location].filter(Boolean) as string[];
  if (primary.length > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...MID);
    doc.text(primary.join('  |  '), PAGE_W / 2, y, { align: 'center' });
    y += 4.5;
  }

  // ── Secondary: LinkedIn | GitHub | Portfolio (with hyperlinks) ────────────
  const secondary = [c.linkedin, c.github, c.portfolio].filter(Boolean) as string[];
  if (secondary.length > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...BLUE);
    const secLine = secondary.join('  |  ');
    // Center the full line then add clickable links
    const lineWidth = doc.getTextWidth(secLine);
    let lx = (PAGE_W - lineWidth) / 2;
    const sepW = doc.getTextWidth('  |  ');
    secondary.forEach((url, i) => {
      const href = url.startsWith('http') ? url : `https://${url}`;
      const tw = doc.getTextWidth(url);
      doc.textWithLink(url, lx, y, { url: href });
      lx += tw;
      if (i < secondary.length - 1) {
        doc.setTextColor(...LIGHT);
        doc.text('  |  ', lx, y);
        doc.setTextColor(...BLUE);
        lx += sepW;
      }
    });
    y += 5;
  }

  // Blue divider
  doc.setDrawColor(...BLUE);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 5;

  // ── Section header ────────────────────────────────────────────────────────
  function sectionHdr(title: string) {
    checkPage(10);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...BLUE);
    doc.text(title.toUpperCase(), MARGIN, y);
    y += 1;
    doc.setDrawColor(...BLUE);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += 4;
    doc.setTextColor(...BODY);
  }

  function wrappedText(text: string, x: number, width: number, bold = false, fontSize = 9.5, color = BODY) {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(fontSize);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(text, width);
    checkPage(lines.length * 4.5 + 1);
    doc.text(lines, x, y);
    y += lines.length * 4.5;
    return lines.length;
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  if (!skip('summary') && data.sections?.summary?.content) {
    sectionHdr('Summary');
    wrappedText(data.sections.summary.content, MARGIN, CONTENT);
    y += 3;
  }

  // ── Skills ────────────────────────────────────────────────────────────────
  if (!skip('skills') && data.sections?.skills?.categories?.length) {
    sectionHdr('Skills');
    for (const cat of data.sections.skills.categories) {
      if (!cat.name || !cat.items?.length) continue;
      checkPage(5);
      const labelW = doc.setFont('helvetica', 'bold').setFontSize(9.5).getTextWidth(`${cat.name}: `);
      doc.setTextColor(...DARK);
      doc.text(`${cat.name}: `, MARGIN, y);
      doc.setFont('helvetica', 'normal').setTextColor(...BODY);
      const valLines = doc.splitTextToSize(cat.items.join(', '), CONTENT - labelW);
      doc.text(valLines, MARGIN + labelW, y);
      y += Math.max(valLines.length * 4.5, 4.5);
    }
    y += 2;
  }

  // ── Work Experience ───────────────────────────────────────────────────────
  if (!skip('experience') && data.sections?.experience?.length) {
    sectionHdr('Work Experience');
    for (const exp of data.sections.experience) {
      checkPage(12);

      // Title (left) + Dates (right) on same line
      doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...DARK);
      doc.text(exp.title ?? '', MARGIN, y);
      doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...LIGHT);
      doc.text(exp.dates ?? '', PAGE_W - MARGIN, y, { align: 'right' });
      y += 4.5;

      // Company (left) + Location (right)
      doc.setFont('helvetica', 'italic').setFontSize(9).setTextColor(...MID);
      doc.text(exp.company ?? '', MARGIN, y);
      doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...LIGHT);
      doc.text(exp.location ?? '', PAGE_W - MARGIN, y, { align: 'right' });
      y += 5;

      // Bullets
      for (const b of exp.bullets ?? []) {
        checkPage(5);
        doc.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(...BODY);
        doc.text('•', MARGIN + 1, y);
        y = renderMixedText(doc, b, MARGIN + 5, PAGE_W - MARGIN, y, 9.5, BODY);
      }
      y += 3;
    }
  }

  // ── Education ─────────────────────────────────────────────────────────────
  if (!skip('education') && data.sections?.education?.length) {
    sectionHdr('Education');
    for (const ed of data.sections.education) {
      checkPage(8);

      // Degree (left) + Year (right)
      doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...DARK);
      doc.text(ed.degree ?? '', MARGIN, y);
      doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...LIGHT);
      doc.text(ed.year ?? '', PAGE_W - MARGIN, y, { align: 'right' });
      y += 4.5;

      // Institution + Location
      const inst = [ed.institution, ed.location].filter(Boolean).join(', ');
      if (inst) {
        doc.setFont('helvetica', 'italic').setFontSize(9).setTextColor(...MID);
        doc.text(inst, MARGIN, y);
        y += 4;
      }
      if (ed.gpa) {
        doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...LIGHT);
        doc.text(`GPA: ${ed.gpa}`, MARGIN, y);
        y += 4;
      }
      y += 2;
    }
  }

  // ── Certifications ────────────────────────────────────────────────────────
  if (!skip('certifications') && data.sections?.certifications?.length) {
    sectionHdr('Certifications');
    for (const cert of data.sections.certifications) {
      checkPage(5);
      doc.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(...BODY);
      doc.text('•', MARGIN + 1, y);
      y = renderMixedText(doc, cert, MARGIN + 5, PAGE_W - MARGIN, y, 9.5, BODY);
    }
  }

  return doc.output('blob');
}
