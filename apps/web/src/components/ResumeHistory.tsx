import { useEffect, useState } from "react";
import ErrorBoundary from "./ErrorBoundary";
import type { JobState } from "@rattlesnake/shared";
import { listJobs } from "../lib/api";

function ResumeHistoryInner() {
  const [jobs, setJobs] = useState<JobState[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    listJobs()
      .then(setJobs)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [reloadKey]);

  if (error)
    return (
      <div className="error-banner">
        Failed to load resume history: {error}{" "}
        <button
          type="button"
          className="btn small"
          onClick={() => {
            setError(null);
            setReloadKey((k) => k + 1);
          }}
        >
          Retry
        </button>
      </div>
    );
  if (!jobs) return <p className="hint">Loading resume history...</p>;

  const withResume = jobs.filter((j) => j.rewrittenResume);

  if (withResume.length === 0) {
    return (
      <p className="hint">
        No generated resumes yet. <a href="/sme-panel">Start an evaluation</a>, then generate the resume here on demand.
      </p>
    );
  }

  return (
    <div className="panel resume-history">
      <table>
        <thead>
          <tr>
            <th>Run</th>
            <th>Domain</th>
            <th>Role</th>
            <th>Keyword overlap</th>
            <th>Auditor</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {withResume.map((job) => (
            <tr key={job.id}>
              <td>
                <a href={`/jobs/${job.id}`} className="mono">{job.id.slice(0, 12)}</a>
              </td>
              <td><span className="tag">{job.domain}</span></td>
              <td>
                <span className="tag accent mono">{job.resumeMeta?.role ?? "auto"}</span>
              </td>
              <td>
                {job.resumeMeta ? (
                  <span className={`tag ${job.resumeMeta.atsScore >= 60 ? "hire" : "warn"}`}>
                    {job.resumeMeta.atsScore}%
                  </span>
                ) : (
                  <span className="hint">·</span>
                )}
              </td>
              <td>
                {job.resumeMeta ? (
                  <span className={`tag ${job.resumeMeta.moderationApproved ? "hire" : "reject"}`}>
                    {job.resumeMeta.moderationScore}/100
                  </span>
                ) : (
                  <span className="hint">·</span>
                )}
              </td>
              <td className="hint">{new Date(job.createdAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ResumeHistory() {
  return (
    <ErrorBoundary>
      <ResumeHistoryInner />
    </ErrorBoundary>
  );
}
