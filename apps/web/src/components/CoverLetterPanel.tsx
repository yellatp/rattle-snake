import { useEffect, useState } from "react";
import type { CoverLetterDraft } from "@rattlesnake/shared";
import { generateCoverLetter } from "../lib/api";

/**
 * Per-application cover-letter draft. A classic four-part letter (subject,
 * salutation, body, closing) for the role the job was evaluated against, built
 * from the SME panel's vetted strengths and the candidate profile/resume.
 */
export default function CoverLetterPanel({
  jobId,
  initialDraft,
}: {
  jobId: string;
  initialDraft?: CoverLetterDraft | null;
}) {
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [draft, setDraft] = useState<CoverLetterDraft | null>(initialDraft ?? null);
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
      const next = await generateCoverLetter(jobId);
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
          <span>Cover letter</span>
          <span className="hint">{open ? "hide" : "expand"}</span>
        </button>
      </div>
      {open && (
        <div className="panel-body">
          <div className="form-actions">
            <button
              type="button"
              className="btn"
              onClick={() => void generate()}
              disabled={generating}
            >
              {generating ? "Writing..." : "Generate letter"}
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
                <strong>Salutation</strong>
              </div>
              <pre className="ce-body">{draft.salutation}</pre>
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
              <pre className="ce-body">{draft.closing}</pre>
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
