import { useEffect, useState } from "react";
import type { ColdEmailAudience, ColdEmailDraft } from "@rattlesnake/shared";
import { generateColdEmail } from "../lib/api";

const AUDIENCE_OPTIONS: { value: ColdEmailAudience; label: string }[] = [
  { value: "recruiter", label: "Recruiter" },
  { value: "founder", label: "Founder" },
  { value: "hiring_manager", label: "Hiring Manager" },
];

const TONE_OPTIONS = [
  { value: "", label: "Warm (default)" },
  { value: "direct", label: "Direct" },
  { value: "enthusiastic", label: "Enthusiastic" },
  { value: "concise", label: "Concise" },
];

/**
 * Per-application cold-email killer intro. A short, high-signal outreach draft
 * (subject + body) aimed at a recruiter, founder, or hiring manager, built from
 * the application's role, JD, resume, and confirmed strengths.
 */
export default function ColdEmailPanel({
  jobId,
  initialDraft,
}: {
  jobId: string;
  initialDraft?: ColdEmailDraft | null;
}) {
  const [open, setOpen] = useState(false);
  const [audience, setAudience] = useState<ColdEmailAudience>("recruiter");
  const [targetName, setTargetName] = useState("");
  const [tone, setTone] = useState("");
  const [generating, setGenerating] = useState(false);
  const [draft, setDraft] = useState<ColdEmailDraft | null>(initialDraft ?? null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"subject" | "body" | null>(null);

  // Adopt a draft produced by a chained run (arrives after the panel mounts).
  useEffect(() => {
    if (initialDraft) setDraft(initialDraft);
  }, [initialDraft]);

  async function generate() {
    setGenerating(true);
    setError(null);
    setDraft(null);
    try {
      const next = await generateColdEmail(jobId, {
        audience,
        targetName: targetName.trim() || undefined,
        tone: tone || undefined,
      });
      setDraft(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  }

  async function copy(kind: "subject" | "body") {
    if (!draft) return;
    const text = kind === "subject" ? draft.subject : draft.body;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setError("Could not copy to clipboard.");
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <button
          type="button"
          className="panel-toggle"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <span>Cold-email intro</span>
          <span className="hint">{open ? "hide" : "expand"}</span>
        </button>
      </div>
      {open && (
        <div className="panel-body">
          <div className="grid-3">
            <div className="form-row">
              <label htmlFor="ce-audience">Who is it for</label>
              <select
                id="ce-audience"
                value={audience}
                onChange={(e) => setAudience(e.target.value as ColdEmailAudience)}
              >
                {AUDIENCE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <label htmlFor="ce-target">Recipient name</label>
              <input
                id="ce-target"
                type="text"
                value={targetName}
                onChange={(e) => setTargetName(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="form-row">
              <label htmlFor="ce-tone">Tone</label>
              <select id="ce-tone" value={tone} onChange={(e) => setTone(e.target.value)}>
                {TONE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="btn"
              onClick={() => void generate()}
              disabled={generating}
            >
              {generating ? "Writing..." : "Generate intro"}
            </button>
          </div>

          {error && <div className="error-banner">{error}</div>}

          {draft && (
            <div className="cold-email-draft">
              <div className="copy-row">
                <strong>Subject</strong>
                <button
                  type="button"
                  className="btn small"
                  onClick={() => void copy("subject")}
                >
                  {copied === "subject" ? "Copied" : "Copy"}
                </button>
              </div>
              <pre className="ce-subject">{draft.subject}</pre>
              <div className="copy-row">
                <strong>Body</strong>
                <button
                  type="button"
                  className="btn small"
                  onClick={() => void copy("body")}
                >
                  {copied === "body" ? "Copied" : "Copy"}
                </button>
              </div>
              <pre className="ce-body">{draft.body}</pre>
              <button
                type="button"
                className="btn secondary small"
                onClick={() => void generate()}
                disabled={generating}
              >
                Regenerate
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
