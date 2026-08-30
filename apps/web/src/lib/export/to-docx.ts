import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import type { ResumeExportOptions } from "./types";
import type { NormalizedResume } from "./normalize";
import { contactParts, filterSections } from "./normalize";

const PAGE_TWIPS: Record<ResumeExportOptions["page"], { width: number; height: number }> = {
  letter: { width: 12240, height: 15840 },
  a4: { width: 11906, height: 16838 },
};

function styleFor(options: ResumeExportOptions) {
  const accent =
    options.format === "modern" ? "1F6FB2" : options.format === "classic" ? "1F2937" : "333333";
  const bodyFont = options.format === "classic" ? "Georgia" : "Helvetica";
  const size = options.preset === "compact" ? 20 : 22;
  const spacing = options.preset === "compact" ? 120 : options.preset === "minimalist" ? 260 : 180;
  return { accent, bodyFont, size, spacing };
}

function renderSection(
  resume: NormalizedResume,
  options: ResumeExportOptions,
  s: NormalizedResume["sections"][number],
  style: ReturnType<typeof styleFor>,
): Paragraph[] {
  const heading = new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 220, after: 120 },
    children: [
      new TextRun({
        text: s.label.toUpperCase(),
        bold: true,
        size: 20,
        color: style.accent,
        font: style.bodyFont,
      }),
    ],
  });

  if (s.kind === "summary") {
    return [
      heading,
      new Paragraph({
        spacing: { after: style.spacing },
        children: [
          new TextRun({ text: s.body as string, size: style.size, font: style.bodyFont }),
        ],
      }),
    ];
  }

  if (s.kind === "skills") {
    const cats = s.body as { name?: string; items?: string[] }[];
    const children = cats.flatMap<Paragraph>((cat) => {
      const prefix = cat.name ? `${cat.name}: ` : "";
      return [
        new Paragraph({
          spacing: { after: 60 },
          children: [
            new TextRun({ text: prefix, bold: Boolean(cat.name), size: style.size, font: style.bodyFont }),
            new TextRun({ text: (cat.items ?? []).join(", "), size: style.size, font: style.bodyFont }),
          ],
        }),
      ];
    });
    return [heading, ...children];
  }

  if (s.kind === "experience") {
    const exps = s.body as {
      title?: string;
      company?: string;
      location?: string;
      dates?: string;
      bullets?: string[];
    }[];
    const children = exps.flatMap<Paragraph>((exp) => {
      const headText = [exp.title, exp.company].filter(Boolean).join(", ");
      const tail = [exp.location, exp.dates].filter(Boolean).join(" | ");
      const paragraphs: Paragraph[] = [
        new Paragraph({
          spacing: { before: 120, after: 60 },
          children: [
            new TextRun({ text: headText, bold: true, size: style.size, font: style.bodyFont }),
            tail
              ? new TextRun({ text: `  -  ${tail}`, italics: true, size: style.size, font: style.bodyFont })
              : undefined,
          ].filter((run): run is TextRun => Boolean(run)),
        }),
      ];
      for (const bullet of exp.bullets ?? []) {
        paragraphs.push(
          new Paragraph({
            indent: { left: 360 },
            spacing: { after: 40 },
            children: [
              new TextRun({ text: bullet, size: style.size, font: style.bodyFont }),
            ],
          }),
        );
      }
      return paragraphs;
    });
    return [heading, ...children];
  }

  const items = Array.isArray(s.body) ? (s.body as string[]) : [];
  const children = items.map(
    (item) =>
      new Paragraph({
        spacing: { after: 60 },
        children: [new TextRun({ text: item, size: style.size, font: style.bodyFont })],
      }),
  );
  return [heading, ...children];
}

/** Build a DOCX Blob for the resume. */
export async function toDocx(
  resume: NormalizedResume,
  options: ResumeExportOptions,
): Promise<Blob> {
  const filtered = filterSections(resume, options);
  const style = styleFor(options);

  const paragraphs: Paragraph[] = [];

  if (filtered.contact.name) {
    paragraphs.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 60 },
        children: [
          new TextRun({
            text: filtered.contact.name,
            bold: true,
            size: 36,
            color: style.accent,
            font: style.bodyFont,
          }),
        ],
      }),
    );
  }
  const contact = contactParts(filtered.contact);
  if (contact.length > 0) {
    paragraphs.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        children: [
          new TextRun({ text: contact.join("  |  "), size: 18, color: "555555", font: style.bodyFont }),
        ],
      }),
    );
  }

  for (const section of filtered.sections) {
    paragraphs.push(...renderSection(filtered, options, section, style));
  }

  const doc = new Document({
    styles: {
      default: {
        document: { run: { size: style.size, font: style.bodyFont } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: PAGE_TWIPS[options.page],
            margin: {
              top: options.preset === "compact" ? 720 : 1080,
              bottom: options.preset === "compact" ? 720 : 1080,
              left: 1080,
              right: 1080,
            },
          },
        },
        children: paragraphs,
      },
    ],
  });

  return Packer.toBlob(doc);
}
