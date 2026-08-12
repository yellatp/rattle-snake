import { useEffect, useState } from "react";
import type { JobState } from "@rattlesnake/shared";
import { listJobs } from "../lib/api";

export default function JobList() {
  const [jobs, setJobs] = useState<JobState[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listJobs()
      .then(setJobs)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  if (error) return <div className="error-banner">Failed to load runs: {error}</div>;
  if (!jobs) return <p className="hint">Loading committee runs...</p>;
  if (jobs.length === 0) {
    return <p className="hint">No committee runs yet. <a href="/">Start one →</a></p>;
  }

  return (
    <div className="panel job-list">
      <table>
        <thead>
          <tr>
            <th>Run</th>
            <th>Domain</th>
            <th>Status</th>
            <th>Verdict</th>
            <th>Entries</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id}>
              <td><a href={`/jobs/${job.id}`} className="mono">{job.id.slice(0, 12)}</a></td>
              <td><span className="tag">{job.domain}</span></td>
              <td>
                <span className={`tag status ${job.status}`}>{job.status}</span>
              </td>
              <td>
                {job.finalVerdict ? (
                  <span className={`tag ${job.finalVerdict === "SHORTLISTED" ? "hire" : "reject"}`}>
                    {job.finalVerdict}
                  </span>
                ) : (
                  <span className="hint">—</span>
                )}
              </td>
              <td>{job.transcript?.length ?? 0}</td>
              <td className="hint">{new Date(job.createdAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
