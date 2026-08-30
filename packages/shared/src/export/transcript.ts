import type { JobState, TranscriptEntry } from "../types.js";

/** Human label for a transcript round, e.g. the final ballot or cross-talk. */
export function roundHeading(round: TranscriptEntry["round"]): string {
  if (round === "ballot") return "Final Ballot";
  if (round === 1) return "Round 1 - 360 Analysis and Openings";
  return `Round ${round} - Cross-talk`;
}

/** Human-readable label for a transcript entry's decision. */
function decisionTag(d: TranscriptEntry["decision"]): string {
  if (!d) return "";
  return d === "HIRE"
    ? '<span class="tag hire">HIRE</span>'
    : '<span class="tag reject">REJECT</span>';
}

/** Escape HTML special characters. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Render a single line of transcript text, converting **bold** and [MARKER] lines. */
function renderLine(raw: string): string {
  const trimmed = raw.trim();
  const markerMatch = /^\[([A-Z_ ]+)\]/.exec(trimmed);
  const marker = markerMatch?.[1];
  // Split on **bold** spans
  const parts = raw.split(/(\*\*[^*]+\*\*)/g).filter((p) => p.length > 0);
  const inner = parts
    .map((part) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return `<strong>${esc(part.slice(2, -2))}</strong>`;
      }
      return esc(part);
    })
    .join("");
  if (marker) {
    let cls = "neutral";
    if (marker.includes("POSITIVE")) cls = "pos";
    else if (marker.includes("CONCERN") || marker.includes("RISK")) cls = "neg";
    else if (marker.includes("VERDICT")) cls = "verdict";
    return `<div class="line marker ${cls}">${inner}</div>`;
  }
  return `<div class="line">${inner}</div>`;
}

/** Readable Markdown export of the full committee discussion. */
export function toTranscriptMarkdown(job: JobState): string {
  const lines: string[] = [];
  const role = job.jdMeta?.role ?? job.roleSlug ?? null;
  lines.push(`# SME Discussion - ${job.id}`);
  lines.push("");
  if (job.jdMeta?.company) lines.push(`Company: ${job.jdMeta.company}`);
  if (role) lines.push(`Role: ${role}`);
  if (job.finalVerdict) lines.push(`Committee verdict: ${job.finalVerdict}`);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");

  for (const entry of job.transcript) {
    lines.push(`## ${entry.sender} (${entry.role})`);
    lines.push(`> ${roundHeading(entry.round)}${entry.decision ? ` - ${entry.decision}` : ""}`);
    lines.push("");
    for (const raw of entry.text.split("\n")) {
      lines.push(raw);
    }
    lines.push("");
  }

  return lines.join("\n").trim() + "\n";
}

/** Plain-text export of the full committee discussion. */
export function toTranscriptPlaintext(job: JobState): string {
  const lines: string[] = [];
  lines.push(`SME DISCUSSION - ${job.id}`);
  lines.push("=".repeat(30));
  if (job.jdMeta?.company) lines.push(`Company: ${job.jdMeta.company}`);
  const role = job.jdMeta?.role ?? job.roleSlug ?? null;
  if (role) lines.push(`Role: ${role}`);
  if (job.finalVerdict) lines.push(`Committee verdict: ${job.finalVerdict}`);
  lines.push("");

  for (const entry of job.transcript) {
    lines.push(`${entry.sender} (${entry.role})`);
    lines.push(`${roundHeading(entry.round)}${entry.decision ? ` - ${entry.decision}` : ""}`);
    lines.push("-".repeat(24));
    for (const raw of entry.text.split("\n")) lines.push(raw);
    lines.push("");
  }

  return lines.join("\n").trim() + "\n";
}

/** Structured JSON export of the full committee discussion. */
export function toTranscriptJson(job: JobState): string {
  return JSON.stringify(
    {
      jobId: job.id,
      domain: job.domain,
      role: job.jdMeta?.role ?? job.roleSlug ?? null,
      verdict: job.finalVerdict ?? null,
      generatedAt: new Date().toISOString(),
      entries: job.transcript,
      jdMeta: job.jdMeta ?? null,
      jobDecomposition: job.jobDecomposition ?? null,
      analyses: job.analyses ?? null,
      executiveReview: job.executiveReview ?? null,
      blueprint: job.blueprint ?? null,
      resumeMeta: job.resumeMeta ?? null,
      coldEmailDraft: job.coldEmailDraft ?? null,
      coverLetterDraft: job.coverLetterDraft ?? null,
      interviewPlan: job.interviewPlan ?? null,
    },
    null,
    2,
  );
}

/** Self-contained HTML export of the full committee discussion. */
export function toTranscriptHtml(job: JobState): string {
  const role = job.jdMeta?.role ?? job.roleSlug ?? "Generalist";
  const company = job.jdMeta?.company ?? "Unknown company";

  // Group entries by round
  const groups: { label: string; entries: TranscriptEntry[] }[] = [];
  for (const entry of job.transcript) {
    const label = roundHeading(entry.round);
    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      last.entries.push(entry);
    } else {
      groups.push({ label, entries: [entry] });
    }
  }

  const entryCards = groups
    .map(
      (g) => `
    <div class="round-group">
      <h2>${esc(g.label)}</h2>
      ${g.entries
        .map(
          (e) => `
      <div class="agent-card">
        <div class="agent-head">
          <div class="agent-meta">
            <span class="agent-name">${esc(e.sender)}</span>
            <span class="agent-role">${esc(e.role)}</span>
          </div>
          ${decisionTag(e.decision)}
        </div>
        <div class="agent-text">
          ${e.text.split("\n").map(renderLine).join("\n          ")}
        </div>
      </div>`,
        )
        .join("\n      ")}
    </div>`,
    )
    .join("\n    ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SME Discussion - ${esc(role)} at ${esc(company)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; max-width: 860px; margin: 0 auto; padding: 24px 16px; background: #0d1117; color: #c9d1d9; line-height: 1.6; }
    h1 { font-size: 1.6rem; border-bottom: 1px solid #30363d; padding-bottom: 10px; margin-bottom: 8px; }
    h2 { font-size: 1.15rem; color: #8b949e; margin: 28px 0 12px; }
    .meta { font-size: 13px; color: #8b949e; margin-bottom: 20px; }
    .meta span { margin-right: 14px; }
    .tag { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 12px; font-weight: 600; }
    .tag.hire { background: #0f2d1a; color: #3fb950; border: 1px solid #238636; }
    .tag.reject { background: #2d0f0f; color: #f85149; border: 1px solid #da3633; }
    .round-group { margin-bottom: 24px; }
    .agent-card { background: #161b22; border: 1px solid #30363d; border-radius: 10px; padding: 16px; margin-bottom: 14px; }
    .agent-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
    .agent-name { font-weight: 600; font-size: 14px; }
    .agent-role { font-size: 12.5px; color: #8b949e; margin-left: 6px; }
    .agent-text { font-size: 13.5px; }
    .line { margin: 3px 0; }
    .line strong { color: #e6edf3; }
    .marker { padding: 3px 8px; border-radius: 6px; margin: 5px 0; }
    .marker.pos { background: #0f2d1a; }
    .marker.neg { background: #2d0f0f; }
    .marker.verdict { background: #1c1a2e; font-weight: 600; }
    .marker.neutral { background: #161b22; }
    @media print { body { background: #fff; color: #111; } .agent-card { border-color: #ccc; } .tag.hire { background: #e6ffed; color: #1a7f37; } .tag.reject { background: #ffebe9; color: #cf222e; } .marker.pos { background: #e6ffed; } .marker.neg { background: #ffebe9; } .marker.verdict { background: #f0f0ff; } }
  </style>
</head>
<body>
  <h1>SME Discussion - ${esc(role)} at ${esc(company)}</h1>
  <div class="meta">
    <span>Domain: ${esc(job.domain)}</span>
    <span>ID: ${esc(job.id)}</span>
    ${job.finalVerdict ? `<span>Verdict: <strong>${esc(job.finalVerdict)}</strong></span>` : ""}
    <span>Generated: ${new Date().toISOString()}</span>
  </div>
  <div class="transcript">
    ${entryCards || '<p style="color:#8b949e">No transcript entries available.</p>'}
  </div>
</body>
</html>`;
}
