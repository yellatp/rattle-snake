import { useEffect, useState } from "react";
import type {
  ColdEmailAngle,
  ColdEmailAudience,
  ColdEmailCtaStyle,
  ColdEmailDraft,
  ColdEmailLength,
} from "@rattlesnake/shared";
import { generateColdEmail } from "../lib/api";

const AUDIENCE_OPTIONS: { value: ColdEmailAudience; label: string }[] = [
  { value: "recruiter", label: "Recruiter" },
  { value: "founder", label: "Founder" },
  { value: "hiring_manager", label: "Hiring Manager" },
];

const TONE_OPTIONS: { value: string; label: string }[] = [
  { value: "warm", label: "Warm" },
  { value: "direct", label: "Direct" },
  { value: "bold", label: "Bold" },
  { value: "understated", label: "Understated" },
];

const ANGLE_OPTIONS: { value: ColdEmailAngle; label: string }[] = [
  { value: "transferable", label: "Transferable skills" },
  { value: "depth", label: "Depth of judgment" },
  { value: "scale", label: "Scale and stakes" },
  { value: "leadership", label: "Ownership" },
  { value: "problem_taste", label: "Problem taste" },
];

const LENGTH_OPTIONS: { value: ColdEmailLength; label: string }[] = [
  { value: "short", label: "Short" },
  { value: "standard", label: "Standard" },
];

const CTA_OPTIONS: { value: ColdEmailCtaStyle; label: string }[] = [
  { value: "call", label: "Short call" },
  { value: "reply", label: "Quick reply" },
  { value: "coffee_chat", label: "Virtual coffee" },
];

/**
 * Cold-email composer: the candidate's first-person soft pitch, dynamically
 * aligned with the job description and the selections below (design plan R1).
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
  const [tone, setTone] = useState("warm");
  const [angle, setAngle] = useState<ColdEmailAngle>("transferable");
  const [length, setLength] = useState<ColdEmailLength>("standard");
  const [ctaStyle, setCtaStyle] = useState<ColdEmailCtaStyle>("call");
  const [generating, setGenerating] = useState(false);
  const [draft, setDraft] = useState<ColdEmailDraft | null>(initialDraft ?? null);
  const [subject, setSubject] = useState(initialDraft?.subject ?? "");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"subject" | "body" | null>(null);

  useEffect(() => {
    if (initialDraft) {
      setDraft(initialDraft);
      setSubject(initialDraft.subject);
    }
  }, [initialDraft]);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const next = await generateColdEmail(jobId, {
        audience,
        targetName: targetName.trim() || undefined,
        tone,
        angle,
        length,
        ctaStyle,
      });
      setDraft(next);
      setSubject(next.subject);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  }

  async function copy(kind: "subject" | "body") {
    if (!draft) return;
    const text = kind === "subject" ? subject : draft.body;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setError("Could not copy to clipboard.");
    }
  }

  const words = draft ? draft.body.split(/\s+/).filter(Boolean).length : 0;

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
              <select
                id="ce-tone"
                value={tone}
                onChange={(e) => setTone(e.target.value)}
              >
                {TONE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid-3">
            <div className="form-row">
              <label htmlFor="ce-angle">Lead with</label>
              <select
                id="ce-angle"
                value={angle}
                onChange={(e) => setAngle(e.target.value as ColdEmailAngle)}
              >
                {ANGLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <label htmlFor="ce-length">Length</label>
              <select
                id="ce-length"
                value={length}
                onChange={(e) => setLength(e.target.value as ColdEmailLength)}
              >
                {LENGTH_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <label htmlFor="ce-cta">The ask</label>
              <select
                id="ce-cta"
                value={ctaStyle}
                onChange={(e) => setCtaStyle(e.target.value as ColdEmailCtaStyle)}
              >
                {CTA_OPTIONS.map((opt) => (
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
              <input
                className="ce-subject-edit"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                aria-label="Email subject"
              />
              <div className="copy-row">
                <strong>Body</strong>
                <span className="hint">{words} words</span>
                <button
                  type="button"
                  className="btn small"
                  onClick={() => void copy("body")}
                >
                  {copied === "body" ? "Copied" : "Copy"}
                </button>
              </div>
              <pre className="ce-body">{draft.body}</pre>
              {draft.cta && (
                <p className="hint">
                  <strong>The ask:</strong> {draft.cta}
                </p>
              )}
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
