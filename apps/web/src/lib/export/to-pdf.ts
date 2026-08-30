import { jsPDF } from "jspdf";
import type { ResumeExportOptions } from "./types";
import type { NormalizedResume } from "./normalize";
import { contactParts, filterSections } from "./normalize";

const PAGE_DIMS: Record<ResumeExportOptions["page"], [number, number]> = {
  letter: [8.5, 11],
  a4: [8.27, 11.69],
};

function colorFor(options: ResumeExportOptions): [number, number, number] {
  if (options.format === "modern") return [31, 111, 178];
  if (options.format === "classic") return [31, 41, 55];
  return [51, 51, 51];
}

/**
 * Render the resume to a jsPDF document. Layout math is done in points (72 per
 * inch); text uses Helvetica with the classic preset swapped to a serif face.
 */
export function toPdf(resume: NormalizedResume, options: ResumeExportOptions): jsPDF {
  const filtered = filterSections(resume, options);
  const [widthIn, heightIn] = PAGE_DIMS[options.page];
  const pageWidth = widthIn * 72;
  const pageHeight = heightIn * 72;
  const margin = options.preset === "compact" ? 0.5 * 72 : 0.75 * 72;
  const contentWidth = pageWidth - margin * 2;
  const compact = options.preset === "compact";
  const serif = options.format === "classic";
  const face = serif ? "times" : "helvetica";
  const accent = colorFor(options);
  const baseSize = compact ? 9.5 : 10.5;
  const lineGap = compact ? 2.2 : 3;

  const doc = new jsPDF({ unit: "pt", format: [pageWidth, pageHeight] });
  const x = margin;
  let y = margin;

  const newPageIfNeeded = (needed: number) => {
    if (y + needed > pageHeight - margin) {
      doc.addPage([pageWidth, pageHeight]);
      y = margin;
    }
  };

  const drawSectionLabel = (label: string) => {
    y += 10;
    newPageIfNeeded(30);
    doc.setFont(face, "bold");
    doc.setFontSize(baseSize + 2);
    doc.setTextColor(accent[0], accent[1], accent[2]);
    doc.text(label.toUpperCase(), x, y);
    if (!compact) {
      doc.setDrawColor(accent[0], accent[1], accent[2]);
      doc.setLineWidth(0.75);
      doc.line(x, y + 4, x + 28, y + 4);
    }
    y += 12;
  };

  const bodyLines = (text: string, fontSize = baseSize): string[] => {
    doc.setFont(face, "normal");
    doc.setFontSize(fontSize);
    return doc.splitTextToSize(text, contentWidth) as string[];
  };

  const writeBody = (lines: string[], indent = 0, after = 2) => {
    for (const line of lines) {
      newPageIfNeeded(fontSizeToHeight(baseSize) + after);
      doc.setFont(face, "normal");
      doc.setFontSize(baseSize);
      doc.setTextColor(30, 30, 30);
      doc.text(line, x + indent, y);
      y += lineGap;
    }
    y += after;
  };

  const fontSizeToHeight = (size: number) => size * 1.2;

  // Header ---------------------------------------------------------------
  if (filtered.contact.name) {
    doc.setFont(face, "bold");
    doc.setFontSize(compact ? 17 : 19);
    doc.setTextColor(20, 20, 20);
    doc.text(filtered.contact.name, pageWidth / 2, y, { align: "center" });
    y += compact ? 14 : 16;
  }
  const contact = contactParts(filtered.contact);
  if (contact.length > 0) {
    const contactLine = contact.join("  |  ");
    const lines = doc.splitTextToSize(contactLine, contentWidth) as string[];
    doc.setFont(face, "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(120, 120, 120);
    for (const line of lines) {
      doc.text(line, pageWidth / 2, y, { align: "center" });
      y += 11;
    }
    y += 4;
  }

  // Sections ---------------------------------------------------------------
  for (const section of filtered.sections) {
    drawSectionLabel(section.label);

    if (section.kind === "summary") {
      writeBody(bodyLines(section.body as string));
    } else if (section.kind === "skills") {
      const cats = section.body as { name?: string; items?: string[] }[];
      for (const cat of cats) {
        const prefix = cat.name ? `${cat.name}: ` : "";
        const line = `${prefix}${(cat.items ?? []).join(", ")}`;
        const lines = bodyLines(line);
        writeBody(lines);
      }
    } else if (section.kind === "experience") {
      const exps = section.body as {
        title?: string;
        company?: string;
        location?: string;
        dates?: string;
        bullets?: string[];
      }[];
      for (const exp of exps) {
        const headText = [exp.title, exp.company].filter(Boolean).join(", ");
        const tail = [exp.location, exp.dates].filter(Boolean).join(" | ");
        const leftLines = bodyLines(headText);
        newPageIfNeeded(fontSizeToHeight(baseSize + 1) + 10);
        doc.setFont(face, "bold");
        doc.setFontSize(baseSize + 0.5);
        doc.setTextColor(30, 30, 30);
        doc.text(leftLines[0] ?? "", x, y);
        if (tail) {
          doc.setFont(face, "italic");
          doc.setFontSize(baseSize - 0.5);
          doc.setTextColor(110, 110, 110);
          doc.text(tail, x + contentWidth, y, { align: "right" });
        }
        y += lineGap + 3;
        if (leftLines.length > 1) {
          writeBody(leftLines.slice(1));
        }
        for (const bullet of exp.bullets ?? []) {
          const bulletLines = bodyLines(bullet, baseSize - 0.5);
          for (const line of bulletLines) {
            newPageIfNeeded(fontSizeToHeight(baseSize) + 1);
            doc.setFont(face, "normal");
            doc.setFontSize(baseSize - 0.5);
            doc.setTextColor(60, 60, 60);
            doc.text("\u2022", x + 8, y);
            doc.text(line, x + 18, y);
            y += lineGap - 0.5;
          }
        }
        y += 3;
      }
    } else {
      const items = Array.isArray(section.body) ? (section.body as string[]) : [];
      for (const item of items) {
        writeBody(bodyLines(item), 8);
      }
    }
  }

  return doc;
}
