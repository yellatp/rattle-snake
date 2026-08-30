import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  toTranscriptJson,
  toTranscriptMarkdown,
  type JobState,
} from "@rattlesnake/shared";

/**
 * Best-effort persistence of a run's artifacts as files under
 * <exportsDir>/<jobId>/. Markdown + JSON are the default formats: they are
 * compact, human-readable, and cover the full discussion and the resume. A
 * run is written again whenever a new artifact lands (resume generated,
 * manually edited), so the folder always reflects the latest state.
 */
export function writeDossier(job: JobState, exportsDir: string): void {
  try {
    const dir = path.join(exportsDir, job.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "discussion.md"), toTranscriptMarkdown(job), "utf8");
    writeFileSync(path.join(dir, "discussion.json"), toTranscriptJson(job), "utf8");
    if (job.rewrittenResume) {
      writeFileSync(path.join(dir, "resume.md"), job.rewrittenResume, "utf8");
    }
    if (job.rewrittenResumeJson) {
      writeFileSync(path.join(dir, "resume.json"), job.rewrittenResumeJson, "utf8");
    }
  } catch (err) {
    console.error(`[exports] failed to write dossier for ${job.id}:`, err);
  }
}

/**
 * Best-effort removal of a run's exported dossier (<exportsDir>/<jobId>/).
 * Callers validate the jobId against the known pattern before invoking this,
 * so a traversal attempt can never reach a directory outside the export root.
 */
export function removeDossier(jobId: string, exportsDir: string): void {
  try {
    rmSync(path.join(exportsDir, jobId), { recursive: true, force: true });
  } catch (err) {
    console.error(`[exports] failed to remove dossier for ${jobId}:`, err);
  }
}
