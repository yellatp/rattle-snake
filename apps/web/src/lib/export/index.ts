import type { ResumeExportOptions } from "./types";
import { normalizeResumeJson } from "./normalize";
import { toPlaintext } from "./to-plaintext";
import { downloadFilename } from "./paths";
import { triggerDownload } from "./download";

export type ResumeDownloadKind = "pdf" | "docx" | "txt" | "json" | "md";

export * from "./types";
export { normalizeResumeJson } from "./normalize";
export { toPlaintext } from "./to-plaintext";
export { toMarkdown } from "./to-markdown";
export { downloadFilename } from "./paths";
export { triggerDownload } from "./download";
export { downloadTranscript } from "./transcript";
export { toTranscriptJson, toTranscriptHtml, toTranscriptMarkdown, toTranscriptPlaintext } from "./transcript";
export type { TranscriptDownloadKind } from "./transcript";
export {
  downloadText,
  coverLetterToMarkdown,
  coverLetterToPlaintext,
  coverLetterToJson,
  interviewToMarkdown,
  interviewToPlaintext,
  interviewToJson,
  downloadCoverLetter,
  downloadInterviewPlan,
} from "./drafts";
export type { DraftDownloadKind } from "./drafts";

/** Parse the structured resume JSON and download it in the requested format. */
export async function downloadResume(
  resumeJson: string,
  options: ResumeExportOptions,
  kind: ResumeDownloadKind,
  roleLabel?: string,
): Promise<void> {
  const resume = normalizeResumeJson(resumeJson);
  if (!resume) {
    throw new Error("Resume JSON could not be parsed for download.");
  }
  const filename = downloadFilename(resume, options, kind, roleLabel);

  if (kind === "json") {
    const pretty = JSON.stringify(JSON.parse(resumeJson), null, 2);
    const blob = new Blob([pretty], { type: "application/json;charset=utf-8" });
    triggerDownload(blob, filename);
    return;
  }

  if (kind === "md") {
    const { toMarkdown } = await import("./to-markdown");
    const blob = new Blob([toMarkdown(resume, options)], {
      type: "text/markdown;charset=utf-8",
    });
    triggerDownload(blob, filename);
    return;
  }

  if (kind === "txt") {
    const blob = new Blob([toPlaintext(resume, options)], {
      type: "text/plain;charset=utf-8",
    });
    triggerDownload(blob, filename);
    return;
  }

  if (kind === "docx") {
    const { toDocx } = await import("./to-docx");
    const blob = await toDocx(resume, options);
    triggerDownload(blob, filename);
    return;
  }

  const { toPdf } = await import("./to-pdf");
  toPdf(resume, options).save(filename);
}
