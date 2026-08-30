import { useEffect, useMemo, useState } from "react";
import type { EnhancementTier, JobState, ResumeMeta } from "@rattlesnake/shared";
import ModeratorFeedback from "./ModeratorFeedback";
import {
  generateResume,
  getJob,
  listJobs,
  type GenerateResumeResult,
} from "../lib/api";

interface Props {
  initialJobId?: string;
}

const toLabel = (job: JobState) =>
  `${job.jdMeta?.role ?? job.roleSlug ?? job.domain} · ${job.id} · ${
    job.finalVerdict ?? "no verdict"
  }`;

const detectedRole = (job: JobState | null) =>
  job?.jdMeta?.role ?? job?.roleSlug ?? null;

export default function ResumeGenerator({ initialJobId }: Props) {
  const [jobId, setJobId] = useState<string>(initialJobId ?? "");
  const [jobs, setJobs] = useState<JobState[]>([]);
  const [job, setJob] = useState<JobState | null>(null);
  const [busy, setBusy] = useState(false);
  const [tier, setTier] = useState<EnhancementTier>("balanced");
  const [result, setResult] = useState<GenerateResumeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listJobs()
      .then((j) => {
        if (!alive) return;
        setJobs(j);
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!jobId) {
      setJob(null);
      setResult(null);
      return;
    }
    let alive = true;
    getJob(jobId)
      .then((loaded) => {
        if (!alive) return;
        setJob(loaded);
        setResult(null);
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      alive = false;
    };
  }, [jobId]);

  const readyJobs = useMemo(
    () => jobs.filter((j) => j.status === "completed" && j.blueprint),
    [jobs],
  );

  const canGenerate = Boolean(jobId) && Boolean(job) && !busy;

  async function handleGenerate() {
    if (!jobId || !job) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const out = await generateResume(jobId, { enhancementTier: tier });
      setResult(out);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Generate a resume from a completed evaluation</h2>
      </div>

      <div className="form-row">
        <label htmlFor="resume-job">Evaluation run</label>
        {jobs.length === 0 ? (
          <p className="hint">Loading committee runs...</p>
        ) : (
          <select
            id="resume-job"
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
          >
            <option value="">
              {readyJobs.length === 0
                ? "No completed runs yet, run an evaluation on the SME Panel first"
                : "Select a completed run..."}
            </option>
            {readyJobs.map((j) => (
              <option key={j.id} value={j.id}>
                {toLabel(j)}
              </option>
            ))}
            {jobId && !readyJobs.some((j) => j.id === jobId) && (
              <option value={jobId}>{jobId} (not completed)</option>
            )}
          </select>
        )}
        {job && (
          <p className="hint">
            {job.jdMeta
              ? `${job.jdMeta.company} · ${job.jdMeta.role} · ${job.jdMeta.location}`
              : job.domain}
            {job.analyses && job.analyses.length > 0
              ? ` · ${job.analyses.length} panel analyses`
              : ""}
            {job.blueprint ? ` · blueprint ready (${job.blueprint.requiredChanges.length} required changes)` : ""}
            {job.rewrittenResume && " · a resume was already generated for this run"}
          </p>
        )}
      </div>

      <div className="form-row">
        <label>Role</label>
        <p className="hint">
          {job
            ? `Auto-detected from the job description: ${detectedRole(job) ?? "unknown"}`
            : "Select an evaluation run to show its detected role."}
        </p>
      </div>

      <div className="form-row">
        <label htmlFor="generate-tier">Enhancement tier</label>
        <select
          id="generate-tier"
          value={tier}
          onChange={(e) => setTier(e.target.value as EnhancementTier)}
        >
          <option value="conservative">Conservative (facts as-is)</option>
          <option value="balanced">Balanced (default)</option>
          <option value="competitive">Competitive (surface more)</option>
        </select>
        <p className="hint">
          How aggressively the resume may surface experience implied by the
          source. Every addition stays audited: it must survive a 3-minute
          interview, and regulated sectors force Conservative.
        </p>
      </div>

      <div className="form-actions">
        <button
          type="button"
          className="btn"
          disabled={!canGenerate}
          onClick={() => void handleGenerate()}
        >
          {busy ? "Generating..." : "Generate resume"}
        </button>
        {job && job.rewrittenResume && (
          <a className="btn secondary" href={`/jobs/${job.id}`}>
            View existing resume on the job page
          </a>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}

      {result && (
        <div className="resume-result">
          <div className="resume-result-head">
            <h3>Resume generated</h3>
            <MetaBadge meta={result.meta} />
          </div>
          <pre className="resume-md-plain">{result.markdown}</pre>
          <p className="hint">
            Full editor with export (PDF / DOCX / TXT) on the job page:{" "}
            <a href={`/jobs/${jobId}`}>/jobs/{jobId}</a>
          </p>
        </div>
      )}
    </section>
  );
}

function MetaBadge({ meta }: { meta: ResumeMeta }) {
  return (
    <div>
      <div className="resume-meta">
        <span className="tag accent">role: {meta.roleLabel}</span>
        <span className={`tag ${meta.atsScore >= 60 ? "hire" : "warn"}`}>
          keyword overlap {meta.atsScore}%
        </span>
        <span className={`tag ${meta.moderationApproved ? "hire" : "reject"}`}>
          auditor {meta.moderationScore}/100
        </span>
        {meta.locale && <span className="tag">English: {meta.locale.toUpperCase()}</span>}
        {meta.enhancementTier && (
          <span className="tag">enhancement tier: {meta.enhancementTier}</span>
        )}
        {meta.enhancements && meta.enhancements.length > 0 && (
          <span className="tag warn">{meta.enhancements.length} audited enhancement(s)</span>
        )}
      </div>
      <ModeratorFeedback meta={meta} />
    </div>
  );
}
