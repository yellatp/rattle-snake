import type { ResumeExportOptions } from "./types";
import type { NormalizedResume } from "./normalize";

/** ASCII-only file stem: "Fullname_Role_Resume". */
export function downloadFilename(
  resume: NormalizedResume,
  options: ResumeExportOptions,
  extension: "pdf" | "docx" | "txt" | "json" | "md",
  roleLabel?: string,
): string {
  const sanitize = (value: string | undefined): string =>
    (value ?? "")
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[^A-Za-z0-9_-]/g, "")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 60);

  const name = sanitize(resume.contact.name) || "resume";
  const role = sanitize(roleLabel ?? resume.role);
  const stem = role ? `${name}_${role}_Resume` : `${name}_Resume`;
  return `${stem}.${extension}`;
}
