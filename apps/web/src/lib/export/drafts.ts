import type { JobState } from "@rattlesnake/shared";
import { triggerDownload } from "./download";

export type DraftDownloadKind = "md" | "json" | "txt";

/** Trigger a download of an arbitrary text payload. */
export function downloadText(text: string, filename: string): void {
  triggerDownload(new Blob([text], { type: "text/plain;charset=utf-8" }), filename);
}

function stemFor(job: JobState, prefix: string): string {
  return `${prefix}_${job.id}`.replace(/[^A-Za-z0-9_-]/g, "_");
}

function companyRole(job: JobState): string {
  const company = job.jdMeta?.company ?? "Unknown company";
  const role = job.jdMeta?.role ?? job.roleSlug ?? "Generalist";
  return `${role} at ${company}`;
}

/** Serialize a cover-letter draft to Markdown. */
export function coverLetterToMarkdown(job: JobState): string {
  const draft = job.coverLetterDraft;
  if (!draft) return "";
  const lines = [
    `# Cover Letter - ${companyRole(job)}`,
    "",
    `**Subject:** ${draft.subject}`,
    "",
    draft.salutation,
    "",
    draft.body,
    "",
    draft.closing,
    "",
  ];
  return lines.join("\n");
}

/** Serialize a cover-letter draft to plain text. */
export function coverLetterToPlaintext(job: JobState): string {
  const draft = job.coverLetterDraft;
  if (!draft) return "";
  return [
    `Cover Letter - ${companyRole(job)}`,
    "",
    `Subject: ${draft.subject}`,
    "",
    draft.salutation,
    "",
    draft.body,
    "",
    draft.closing,
    "",
  ].join("\n");
}

/** Serialize a cover-letter draft to pretty JSON. */
export function coverLetterToJson(job: JobState): string {
  if (!job.coverLetterDraft) return "";
  return JSON.stringify(job.coverLetterDraft, null, 2);
}

/** Serialize an interview prep plan to Markdown. */
export function interviewToMarkdown(job: JobState): string {
  const plan = job.interviewPlan;
  if (!plan) return "";
  const lines: string[] = [`# Interview Prep - ${plan.roleLabel} (${companyRole(job)})`, ""];

  lines.push("## Summary", "", plan.summary, "");

  if (plan.pipeline.length > 0) {
    lines.push("## Interview Pipeline");
    for (const phase of plan.pipeline) {
      lines.push("", `### ${phase.name}`, "");
      lines.push(`- Duration: ${phase.duration}`);
      lines.push(`- Format: ${phase.format}`);
      lines.push(`- Focus: ${phase.focus}`);
      if (phase.typicalQuestions.length > 0) {
        lines.push("- Typical questions:");
        for (const q of phase.typicalQuestions) lines.push(`  - ${q}`);
      }
    }
    lines.push("");
  }

  if (plan.experts.length > 0) {
    lines.push("## Expert Drills");
    for (const expert of plan.experts) {
      lines.push("", `### ${expert.seat} - ${expert.role}`, "");
      lines.push(`Lens: ${expert.lens}`);
      if (expert.expectations.length > 0) {
        lines.push("", "Expectations:");
        for (const e of expert.expectations) lines.push(`- ${e}`);
      }
      if (expert.drillQuestions.length > 0) {
        lines.push("", "Drill questions:");
        for (const q of expert.drillQuestions) lines.push(`- ${q}`);
      }
      if (expert.redFlags.length > 0) {
        lines.push("", "Red flags:");
        for (const f of expert.redFlags) lines.push(`- ${f}`);
      }
      lines.push("");
    }
  }

  if (plan.topics.length > 0) {
    lines.push("## Knowledge Checklist", "");
    for (const t of plan.topics) lines.push(`- ${t}`);
    lines.push("");
  }

  if (plan.prepTips.length > 0) {
    lines.push("## Prep Tips", "");
    for (const t of plan.prepTips) lines.push(`- ${t}`);
    lines.push("");
  }

  return lines.join("\n");
}

/** Serialize an interview prep plan to plain text. */
export function interviewToPlaintext(job: JobState): string {
  const plan = job.interviewPlan;
  if (!plan) return "";
  const lines: string[] = [`Interview Prep - ${plan.roleLabel} (${companyRole(job)})`, ""];

  lines.push("SUMMARY", plan.summary, "");

  if (plan.pipeline.length > 0) {
    lines.push("INTERVIEW PIPELINE");
    for (const phase of plan.pipeline) {
      lines.push("", `${phase.name} (${phase.duration}, ${phase.format})`, `Focus: ${phase.focus}`);
      if (phase.typicalQuestions.length > 0) {
        lines.push("Typical questions:");
        for (const q of phase.typicalQuestions) lines.push(`- ${q}`);
      }
    }
    lines.push("");
  }

  if (plan.experts.length > 0) {
    lines.push("EXPERT DRILLS");
    for (const expert of plan.experts) {
      lines.push("", `${expert.seat} (${expert.role})`, `Lens: ${expert.lens}`);
      if (expert.expectations.length > 0) {
        lines.push("Expectations:");
        for (const e of expert.expectations) lines.push(`- ${e}`);
      }
      if (expert.drillQuestions.length > 0) {
        lines.push("Drill questions:");
        for (const q of expert.drillQuestions) lines.push(`- ${q}`);
      }
      if (expert.redFlags.length > 0) {
        lines.push("Red flags:");
        for (const f of expert.redFlags) lines.push(`- ${f}`);
      }
    }
    lines.push("");
  }

  if (plan.topics.length > 0) {
    lines.push("KNOWLEDGE CHECKLIST");
    for (const t of plan.topics) lines.push(`- ${t}`);
    lines.push("");
  }

  if (plan.prepTips.length > 0) {
    lines.push("PREP TIPS");
    for (const t of plan.prepTips) lines.push(`- ${t}`);
  }

  return lines.join("\n");
}

/** Serialize an interview prep plan to pretty JSON. */
export function interviewToJson(job: JobState): string {
  if (!job.interviewPlan) return "";
  return JSON.stringify(job.interviewPlan, null, 2);
}

/** Trigger a client-side download of the cover-letter draft in the requested format. */
export function downloadCoverLetter(job: JobState, kind: DraftDownloadKind): void {
  const stem = stemFor(job, "CoverLetter");
  if (kind === "json") {
    triggerDownload(
      new Blob([coverLetterToJson(job)], { type: "application/json;charset=utf-8" }),
      `${stem}.json`,
    );
    return;
  }
  if (kind === "txt") {
    triggerDownload(
      new Blob([coverLetterToPlaintext(job)], { type: "text/plain;charset=utf-8" }),
      `${stem}.txt`,
    );
    return;
  }
  triggerDownload(
    new Blob([coverLetterToMarkdown(job)], { type: "text/markdown;charset=utf-8" }),
    `${stem}.md`,
  );
}

/** Trigger a client-side download of the interview prep plan in the requested format. */
export function downloadInterviewPlan(job: JobState, kind: DraftDownloadKind): void {
  const stem = stemFor(job, "InterviewPrep");
  if (kind === "json") {
    triggerDownload(
      new Blob([interviewToJson(job)], { type: "application/json;charset=utf-8" }),
      `${stem}.json`,
    );
    return;
  }
  if (kind === "txt") {
    triggerDownload(
      new Blob([interviewToPlaintext(job)], { type: "text/plain;charset=utf-8" }),
      `${stem}.txt`,
    );
    return;
  }
  triggerDownload(
    new Blob([interviewToMarkdown(job)], { type: "text/markdown;charset=utf-8" }),
    `${stem}.md`,
  );
}
