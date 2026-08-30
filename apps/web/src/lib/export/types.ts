/**
 * Client-side resume export options (WS-6 downloads).
 *
 * Format drives the visual style; preset drives density/margins; page picks the
 * physical sheet; excludedSections hides selected resume sections.
 */
export type ResumeExportFormat = "modern" | "classic" | "plain";
export type ResumeExportPreset = "standard" | "minimalist" | "compact";
export type ResumePageFormat = "letter" | "a4";

export interface ResumeExportOptions {
  format: ResumeExportFormat;
  preset: ResumeExportPreset;
  page: ResumePageFormat;
  excludedSections: string[];
}

export const DEFAULT_EXPORT_OPTIONS: ResumeExportOptions = {
  format: "modern",
  preset: "standard",
  page: "letter",
  excludedSections: [],
};

export const EXPORT_FORMAT_LABELS: Record<ResumeExportFormat, string> = {
  modern: "Modern",
  classic: "Classic",
  plain: "Plain",
};

export const EXPORT_PRESET_LABELS: Record<ResumeExportPreset, string> = {
  standard: "Standard",
  minimalist: "Minimalist",
  compact: "Compact",
};

export const PAGE_FORMAT_LABELS: Record<ResumePageFormat, string> = {
  letter: "US Letter",
  a4: "A4",
};
