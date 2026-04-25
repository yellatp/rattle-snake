import { extractResumeJson } from './extract-json';

export type PageFormat = 'letter' | 'a4';

export interface ExportOptions {
  excludedSections?: string[];
  pageFormat?: PageFormat;
}

export async function exportToDocx(
  content: string, role: string, company: string, options?: ExportOptions
): Promise<void> {
  const { buildDocx } = await import('./to-docx');
  const blob = await buildDocx(content, role, company, options);
  downloadBlob(blob, buildFilename(content, role, company, 'Resume', 'docx'));
}

export async function exportToPdf(
  content: string, role: string, company: string, options?: ExportOptions
): Promise<void> {
  const { buildPdf } = await import('./to-pdf');
  const blob = await buildPdf(content, role, company, options);
  downloadBlob(blob, buildFilename(content, role, company, 'Resume', 'pdf'));
}

export async function exportToPlaintext(
  content: string, role: string, company: string, options?: ExportOptions
): Promise<void> {
  const { buildPlaintext } = await import('./to-plaintext');
  const text = buildPlaintext(content, options);
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  downloadBlob(blob, buildFilename(content, role, company, 'Resume', 'txt'));
}

export async function exportCoverLetterTxt(
  content: string, role: string, company: string, candidateName?: string
): Promise<void> {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  downloadBlob(blob, buildCoverLetterFilename(role, company, candidateName, 'txt'));
}

export function buildCoverLetterFilename(
  role: string, company: string, candidateName?: string, ext = 'txt'
): string {
  const namePart = candidateName
    ? candidateName.trim().split(/\s+/).join('-')
    : hyphenate(role);
  const rolePart = hyphenate(role);
  const compPart = company ? `-${hyphenate(company)}` : '';
  return `${namePart}-${rolePart}${compPart}-CoverLetter.${ext}`;
}

// Format: Firstname-Lastname-Role-Company-Type.ext
// e.g. Pavan-Yellathakota-Data-Scientist-Voleon-Group-Resume.pdf
function buildFilename(
  content: string, role: string, company: string, type: string, ext: string
): string {
  let candidateName = '';
  try {
    const data = JSON.parse(extractResumeJson(content)) as { contact?: { name?: string } };
    candidateName = data.contact?.name ?? '';
  } catch { /* ignore */ }

  const namePart = candidateName
    ? candidateName.trim().split(/\s+/).join('-')
    : hyphenate(role);
  const rolePart = hyphenate(role);
  const compPart = company ? `-${hyphenate(company)}` : '';
  return `${namePart}-${rolePart}${compPart}-${type}.${ext}`;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Converts "Data Scientist" → "Data-Scientist", strips special chars. */
function hyphenate(str: string): string {
  return str.trim().replace(/[^a-zA-Z0-9\s]+/g, '').replace(/\s+/g, '-');
}
