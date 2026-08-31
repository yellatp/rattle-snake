import { useEffect, useMemo, useState } from "react";
import ErrorBoundary from "./ErrorBoundary";
import { marked } from "marked";
import { roundHeading, type JobState, type TranscriptEntry } from "@rattlesnake/shared";
import { deleteJob, getJob } from "../lib/api";
import { sanitizeMarkdownHtml } from "../lib/sanitize";
import {
  downloadCoverLetter,
  downloadInterviewPlan,
  downloadTranscript,
} from "../lib/export";

function markerClass(marker: string): string {
  if (marker.includes("POSITIVE")) return "pos";
  if (marker.includes("CONCERN") || marker.includes("RISK")) return "neg";
  if (marker.includes("VERDICT")) return "verdict";
  return "neutral";
}

function EntryCard({ entry }: { entry: TranscriptEntry }) {
  return (
    <div className="agent-card tech">
      <div className="agent-head">
        <span className="avatar tech">{entry.sender[0]}</span>
        <div className="agent-meta">
          <span className="agent-name">{entry.sender}</span>
          <span className="agent-role">{entry.role}</span>
        </div>
        {entry.decision && (
          <span className={`tag ${entry.decision === "HIRE" ? "hire" : "reject"}`}>
            {entry.decision}
          </span>
        )}
      </div>
      <div className="agent-text">
        {entry.text.split("\n").map((line, i) => {
          const trimmed = line.trim();
          const marker = /^\[([A-Z_ ]+)\]/.exec(trimmed)?.[1];
          const parts = line.split(/(\*\*[^*]+\*\*)/g).filter((p) => p.length > 0);
          return (
            <div key={i} className={marker ? `line marker ${markerClass(marker)}` : "line"}>
              {parts.map((part, j) =>
                part.startsWith("**") && part.endsWith("**") ? (
                  <strong key={j}>{part.slice(2, -2)}</strong>
                ) : (
                  <span key={j}>{part}</span>
                ),
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Discussion({ job }: { job: JobState }) {
  const groups = useMemo(() => {
    const map = new Map<string, TranscriptEntry[]>();
    for (const entry of job.transcript) {
      const key = roundHeading(entry.round);
      const list = map.get(key) ?? [];
      list.push(entry);
      map.set(key, list);
    }
    return [...map.entries()].map(([label, entries]) => ({ label, entries }));
  }, [job]);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Committee discussion</h2>
        <div className="panel-head-actions">
          <button
            type="button"
            className="btn small subtle"
            onClick={() => downloadTranscript(job, "md")}
          >
            MD
          </button>
          <button
            type="button"
            className="btn small subtle"
            onClick={() => downloadTranscript(job, "html")}
          >
            HTML
          </button>
          <button
            type="button"
            className="btn small subtle"
            onClick={() => downloadTranscript(job, "json")}
          >
            JSON
          </button>
          <button
            type="button"
            className="btn small subtle"
            onClick={() => downloadTranscript(job, "txt")}
          >
            TXT
          </button>
        </div>
      </div>
      {groups.length === 0 && <p className="hint">This run produced no discussion.</p>}
      {groups.map((group) => (
        <div key={group.label} className="round-group">
          <h3>{group.label}</h3>
          {group.entries.map((entry) => (
            <EntryCard key={entry.id} entry={entry} />
          ))}
        </div>
      ))}
    </section>
  );
}

function ResumeView({ job }: { job: JobState }) {
  const html = useMemo(
    () =>
      job.rewrittenResume
        ? sanitizeMarkdownHtml(marked.parse(job.rewrittenResume, { async: false }) as string)
        : "",
    [job.rewrittenResume],
  );

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Generated resume</h2>
        <div className="panel-head-actions">
          {job.rewrittenResume && (
            <a
              className="btn small subtle"
              href={`data:text/markdown;charset=utf-8,${encodeURIComponent(job.rewrittenResume)}`}
              download={`${job.id}-resume.md`}
            >
              MD
            </a>
          )}
          {job.rewrittenResumeJson && (
            <a
              className="btn small subtle"
              href={`data:application/json;charset=utf-8,${encodeURIComponent(job.rewrittenResumeJson)}`}
              download={`${job.id}-resume.json`}
            >
              JSON
            </a>
          )}
        </div>
      </div>
      {job.rewrittenResume ? (
        <article className="resume-md" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <p className="hint">No resume was generated for this run.</p>
      )}
    </section>
  );
}

function CoverLetterView({ job }: { job: JobState }) {
  const draft = job.coverLetterDraft;
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Cover letter</h2>
        <div className="panel-head-actions">
          <button
            type="button"
            className="btn small subtle"
            onClick={() => downloadCoverLetter(job, "md")}
          >
            MD
          </button>
          <button
            type="button"
            className="btn small subtle"
            onClick={() => downloadCoverLetter(job, "json")}
          >
            JSON
          </button>
          <button
            type="button"
            className="btn small subtle"
            onClick={() => downloadCoverLetter(job, "txt")}
          >
            TXT
          </button>
        </div>
      </div>
      {draft ? (
        <div className="letter">
          <p className="letter-subject">
            <strong>Subject:</strong> {draft.subject}
          </p>
          <p className="letter-paragraph">{draft.salutation}</p>
          {draft.body.split("\n").map((para, i) => (
            <p key={i} className="letter-paragraph">
              {para}
            </p>
          ))}
          <p className="letter-paragraph">{draft.closing}</p>
        </div>
      ) : (
        <p className="hint">No cover letter was generated for this run.</p>
      )}
    </section>
  );
}

function InterviewView({ job }: { job: JobState }) {
  const plan = job.interviewPlan;
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Interview prep</h2>
        <div className="panel-head-actions">
          <button
            type="button"
            className="btn small subtle"
            onClick={() => downloadInterviewPlan(job, "md")}
          >
            MD
          </button>
          <button
            type="button"
            className="btn small subtle"
            onClick={() => downloadInterviewPlan(job, "json")}
          >
            JSON
          </button>
          <button
            type="button"
            className="btn small subtle"
            onClick={() => downloadInterviewPlan(job, "txt")}
          >
            TXT
          </button>
        </div>
      </div>
      {plan ? (
        <div className="interview-plan">
          <p className="hint">{plan.summary}</p>
          {plan.pipeline.length > 0 && (
            <div className="interview-section">
              <h3>Interview pipeline</h3>
              {plan.pipeline.map((phase) => (
                <div className="interview-phase" key={phase.name}>
                  <h4>
                    {phase.name} <span className="hint">({phase.duration} · {phase.format})</span>
                  </h4>
                  <p>{phase.focus}</p>
                  {phase.typicalQuestions.length > 0 && (
                    <ul className="interview-list">
                      {phase.typicalQuestions.map((q, i) => (
                        <li key={i}>{q}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
          {plan.experts.length > 0 && (
            <div className="interview-section">
              <h3>Expert drills</h3>
              {plan.experts.map((expert) => (
                <div className="interview-expert" key={expert.seat}>
                  <h4>
                    {expert.seat} <span className="hint">{expert.role}</span>
                  </h4>
                  <p>{expert.lens}</p>
                  {expert.expectations.length > 0 && (
                    <>
                      <h5>Expectations</h5>
                      <ul className="interview-list">
                        {expert.expectations.map((e, i) => (
                          <li key={i}>{e}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  {expert.drillQuestions.length > 0 && (
                    <>
                      <h5>Drill questions</h5>
                      <ul className="interview-list">
                        {expert.drillQuestions.map((q, i) => (
                          <li key={i}>{q}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  {expert.redFlags.length > 0 && (
                    <>
                      <h5>Red flags</h5>
                      <ul className="interview-list">
                        {expert.redFlags.map((f, i) => (
                          <li key={i}>{f}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
          {plan.topics.length > 0 && (
            <div className="interview-section">
              <h3>Knowledge checklist</h3>
              <ul className="interview-list">
                {plan.topics.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          )}
          {plan.prepTips.length > 0 && (
            <div className="interview-section">
              <h3>Prep tips</h3>
              <ul className="interview-list">
                {plan.prepTips.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <p className="hint">No interview plan was generated for this run.</p>
      )}
    </section>
  );
}

const TABS = ["discussion", "resume", "coverletter", "interview"] as const;
type Tab = (typeof TABS)[number];

function availableTabs(job: JobState): Tab[] {
  const tabs: Tab[] = ["discussion"];
  if (job.rewrittenResume) tabs.push("resume");
  if (job.coverLetterDraft) tabs.push("coverletter");
  if (job.interviewPlan) tabs.push("interview");
  return tabs;
}

function StorageViewerInner({ jobId, initialTab = "discussion" }: { jobId: string; initialTab?: string }) {
  const [job, setJob] = useState<JobState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(
    (TABS as readonly string[]).includes(initialTab) ? (initialTab as Tab) : "discussion",
  );
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    getJob(jobId)
      .then(setJob)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [jobId]);

  useEffect(() => {
    if (job && !availableTabs(job).includes(tab)) setTab("discussion");
  }, [job, tab]);

  if (error) return <div className="error-banner">Could not load this run: {error}</div>;
  if (!job) return <p className="hint">Loading saved result...</p>;

  const handleDelete = async () => {
    if (!window.confirm("Delete this run and all its files? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await deleteJob(job.id);
      window.location.href = "/storage";
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
      setDeleting(false);
    }
  };

  const company = job.jdMeta?.company ?? "Unknown company";
  const role = job.jdMeta?.role ?? job.roleSlug ?? "Generalist";

  return (
    <div className="storage-viewer">
      <header className="panel storage-viewer-head">
        <div className="storage-viewer-title">
          <h2>{role}</h2>
          <p className="hint">
            <span className="tag accent">{company}</span>{" "}
            <a href={`/storage/${job.id}`} className="mono">
              {job.id.slice(0, 12)}
            </a>
          </p>
          <p className="hint">
            <span className={`tag status ${job.status}`}>{job.status}</span>
            {job.finalVerdict && (
              <span className={`tag ${job.finalVerdict === "SHORTLISTED" ? "hire" : "reject"}`}>
                {job.finalVerdict}
              </span>
            )}
            <span>{new Date(job.createdAt).toLocaleString()}</span>
          </p>
        </div>
        <div className="storage-viewer-actions">
          <button
            type="button"
            className="btn danger"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? "Deleting..." : "Delete run"}
          </button>
          <a className="btn subtle" href="/storage">
            Back to storage
          </a>
        </div>
      </header>

      <div className="tabs" role="tablist">
        <button
          type="button"
          className={`tab ${tab === "discussion" ? "active" : ""}`}
          onClick={() => setTab("discussion")}
        >
          Discussion
        </button>
        {job.rewrittenResume && (
          <button
            type="button"
            className={`tab ${tab === "resume" ? "active" : ""}`}
            onClick={() => setTab("resume")}
          >
            Resume
          </button>
        )}
        {job.coverLetterDraft && (
          <button
            type="button"
            className={`tab ${tab === "coverletter" ? "active" : ""}`}
            onClick={() => setTab("coverletter")}
          >
            Cover letter
          </button>
        )}
        {job.interviewPlan && (
          <button
            type="button"
            className={`tab ${tab === "interview" ? "active" : ""}`}
            onClick={() => setTab("interview")}
          >
            Interview prep
          </button>
        )}
      </div>

      {tab === "discussion" && <Discussion job={job} />}
      {tab === "resume" && <ResumeView job={job} />}
      {tab === "coverletter" && <CoverLetterView job={job} />}
      {tab === "interview" && <InterviewView job={job} />}
    </div>
  );
}

export default function StorageViewer(props: { jobId: string; initialTab?: string }) {
  return (
    <ErrorBoundary>
      <StorageViewerInner {...props} />
    </ErrorBoundary>
  );
}
