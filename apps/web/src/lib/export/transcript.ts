import type { JobState } from "@rattlesnake/shared";
import { toTranscriptJson, toTranscriptHtml, toTranscriptMarkdown, toTranscriptPlaintext } from "@rattlesnake/shared";
import { triggerDownload } from "./download";

export { roundHeading, toTranscriptJson, toTranscriptHtml, toTranscriptMarkdown, toTranscriptPlaintext } from "@rattlesnake/shared";
export type { TranscriptEntry } from "@rattlesnake/shared";

export type TranscriptDownloadKind = "md" | "json" | "txt" | "html";

function stemFor(job: JobState): string {
  return `SME_Discussion_${job.id}`.replace(/[^A-Za-z0-9_-]/g, "_");
}

/** Trigger a client-side download of the discussion in the requested format. */
export function downloadTranscript(job: JobState, kind: TranscriptDownloadKind): void {
  const stem = stemFor(job);
  if (kind === "json") {
    triggerDownload(
      new Blob([toTranscriptJson(job)], { type: "application/json;charset=utf-8" }),
      `${stem}.json`,
    );
    return;
  }
  if (kind === "html") {
    triggerDownload(
      new Blob([toTranscriptHtml(job)], { type: "text/html;charset=utf-8" }),
      `${stem}.html`,
    );
    return;
  }
  if (kind === "txt") {
    triggerDownload(
      new Blob([toTranscriptPlaintext(job)], { type: "text/plain;charset=utf-8" }),
      `${stem}.txt`,
    );
    return;
  }
  triggerDownload(
    new Blob([toTranscriptMarkdown(job)], { type: "text/markdown;charset=utf-8" }),
    `${stem}.md`,
  );
}
