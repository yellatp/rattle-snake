import { useState } from "react";
import type { JobState } from "@rattlesnake/shared";
import {
  downloadTranscript,
  type TranscriptDownloadKind,
} from "../lib/export/transcript";
import {
  downloadCoverLetter,
  downloadInterviewPlan,
  downloadText,
  type DraftDownloadKind,
} from "../lib/export/drafts";

interface ArtifactRow {
  id: string;
  label: string;
  note: string;
  available: boolean;
  formats: string[];
  download: (format: string) => void;
}

function blueprintToMarkdown(job: JobState): string {
  const b = job.blueprint;
  if (!b) return "";
  const lines: string[] = [`# Hiring Committee Blueprint`, ""];
  lines.push(`Consensus: ${b.consensus}`, "");
  if (b.strengths.length > 0) {
    lines.push("## Strengths to preserve", ...b.strengths.map((s) => `- ${s}`), "");
  }
  if (b.objections.length > 0) {
    lines.push("## Objections to clear", ...b.objections.map((s) => `- ${s}`), "");
  }
  if (b.requiredChanges.length > 0) {
    lines.push("## Required changes", ...b.requiredChanges.map((s) => `- ${s}`), "");
  }
  if (b.sectorNotes.length > 0) {
    lines.push("## Sector notes", ...b.sectorNotes.map((s) => `- ${s}`), "");
  }
  if (b.missingSkillsRanked.length > 0) {
    lines.push(
      "## Missing skills",
      ...b.missingSkillsRanked.map((m) => `- ${m.skill ?? String(m)} (${String(m.severity ?? "")})`),
      "",
    );
  }
  if (b.credibilityFindings.length > 0) {
    lines.push("## Credibility findings", ...b.credibilityFindings.map((s) => `- ${s}`), "");
  }
  return lines.join("\n");
}

function gapToMarkdown(job: JobState): string {
  const g = job.gapAnalysis?.gapAnalysis;
  if (!g) return "";
  const lines: string[] = [`# Gap Analysis`, "", `Overall readiness: ${g.overallReadiness}`, "", g.summary, ""];
  if (g.mustHaveGaps.length > 0) {
    lines.push("## Must-have gaps", ...g.mustHaveGaps.map((m) => `- ${m.item} (${m.evidenceStatus})`), "");
  }
  if (g.niceToHaveGaps.length > 0) {
    lines.push("## Nice-to-have gaps", ...g.niceToHaveGaps.map((m) => `- ${m.item} (${m.evidenceStatus})`), "");
  }
  if (g.strongMatches.length > 0) {
    lines.push("## Strong matches", ...g.strongMatches.map((m) => `- ${m.item}`), "");
  }
  if (job.gapAnalysis?.priorityActions.length) {
    lines.push("## Priority actions", ...job.gapAnalysis.priorityActions.map((p) => `- ${p}`), "");
  }
  return lines.join("\n");
}

function slug(text: string): string {
  return text.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

/**
 * Export Center (design plan R5): one place to download every generated
 * artifact of a run in the format you need. The resume keeps its own export
 * row inside the resume card, alongside the JSON editor.
 */
export default function ExportCenter({ job }: { job: JobState }) {
  const [formats, setFormats] = useState<Record<string, string>>({});

  const rows: ArtifactRow[] = [
    {
      id: "discussion",
      label: "Expert discussion",
      note: `${job.transcript.length} entries`,
      available: job.transcript.length > 0,
      formats: ["md", "txt", "html", "json"],
      download: (format) => downloadTranscript(job, format as TranscriptDownloadKind),
    },
    {
      id: "blueprint",
      label: "Committee blueprint",
      note: "objections, strengths, required changes",
      available: Boolean(job.blueprint),
      formats: ["md", "json"],
      download: (format) => {
        if (!job.blueprint) return;
        const text =
          format === "json" ? JSON.stringify(job.blueprint, null, 2) : blueprintToMarkdown(job);
        downloadText(text, `${slug(job.id)}-blueprint.${format}`);
      },
    },
    {
      id: "gap",
      label: "Gap analysis",
      note: "gaps, matches, priority actions",
      available: Boolean(job.gapAnalysis),
      formats: ["md", "json"],
      download: (format) => {
        if (!job.gapAnalysis) return;
        const text =
          format === "json" ? JSON.stringify(job.gapAnalysis, null, 2) : gapToMarkdown(job);
        downloadText(text, `${slug(job.id)}-gap-analysis.${format}`);
      },
    },
    {
      id: "cold-email",
      label: "Cold-email intro",
      note: job.coldEmailDraft ? `subject: ${job.coldEmailDraft.subject}` : "not generated yet",
      available: Boolean(job.coldEmailDraft),
      formats: ["txt", "md"],
      download: (format) => {
        const d = job.coldEmailDraft;
        if (!d) return;
        const text =
          format === "md"
            ? `# ${d.subject}\n\n${d.body}\n`
            : `Subject: ${d.subject}\n\n${d.body}\n`;
        downloadText(text, `${slug(job.id)}-cold-email.${format}`);
      },
    },
    {
      id: "cover-letter",
      label: "Cover letter",
      note: job.coverLetterDraft ? "ready" : "not generated yet",
      available: Boolean(job.coverLetterDraft),
      formats: ["md", "txt", "json"],
      download: (format) => downloadCoverLetter(job, format as DraftDownloadKind),
    },
    {
      id: "interview",
      label: "Interview prep plan",
      note: job.interviewPlan ? "ready" : "not generated yet",
      available: Boolean(job.interviewPlan),
      formats: ["md", "txt", "json"],
      download: (format) => downloadInterviewPlan(job, format as DraftDownloadKind),
    },
  ];

  return (
    <section className="panel" id="panel-export">
      <div className="panel-head">
        <h2>Export Center</h2>
        <span className="hint">download any artifact in the format you need</span>
      </div>
      <div className="panel-body">
        {rows.map((row) => {
          const format = formats[row.id] ?? row.formats[0]!;
          return (
            <div className="export-row" key={row.id}>
              <div className="export-label">
                <strong>{row.label}</strong>
                <span className="hint">{row.available ? row.note : row.note}</span>
              </div>
              <select
                aria-label={`${row.label} format`}
                value={format}
                disabled={!row.available}
                onChange={(e) =>
                  setFormats((prev) => ({ ...prev, [row.id]: e.target.value }))
                }
              >
                {row.formats.map((f) => (
                  <option key={f} value={f}>
                    {f.toUpperCase()}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn small"
                disabled={!row.available}
                onClick={() => row.download(format)}
              >
                Download
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
