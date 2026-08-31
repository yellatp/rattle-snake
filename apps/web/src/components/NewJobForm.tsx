import { useEffect, useState } from "react";
import ErrorBoundary from "./ErrorBoundary";
import type { SyntheticEvent } from "react";
import { createJob, listJds, listProfiles, listResumes } from "../lib/api";
import type {
  EnhancementTier,
  GenerateOptions,
  SavedJd,
  SavedResume,
  UserProfile,
} from "@rattlesnake/shared";
import { profileToResumeMarkdown } from "../lib/profileResume";

const SAMPLE_JD = `Senior Backend Engineer, FinTech Payments Platform

We build low-latency payment processing. You will own services that move money
between merchants and banks in real time.

Requirements: 5+ years building backend systems in TypeScript, Go, or Java.
Strong systems design: distributed systems, microservices, concurrency,
idempotency. Experience with event-driven architecture (Kafka, SQS).
PostgreSQL at scale (indexing, partitioning). PCI-DSS awareness. Production
debugging and on-call ownership.

Nice to have: payment domain experience (ledgers, double-entry, settlement).`;

const SAMPLE_RESUME = `Rohan Mehta · Backend Engineer (6 years)

Senior Software Engineer, RetailWorks (E-commerce), 2021-Present
- Built inventory synchronization services keeping warehouse systems in sync
- Improved API response latency by refactoring database queries
- Worked on the order processing pipeline handling 2M+ orders/month
- Introduced automated tests and CI for the payments integration team
- Migrated a monolith to event-driven microservices using Kafka

Software Engineer, TravelBuddy (Travel tech), 2019-2021
- Developed RESTful APIs in Node.js for the booking engine
- Built a Redis caching layer to reduce read load on PostgreSQL
- Helped maintain Docker and Kubernetes deployments

Skills: TypeScript, Node.js, Go, PostgreSQL, Redis, Kafka, Docker, Kubernetes,
AWS, Terraform, CI/CD, TDD, observability (Grafana, Prometheus).`;

function NewJobFormInner() {
  const [jobLocation, setJobLocation] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [baseResume, setBaseResume] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedResumes, setSavedResumes] = useState<SavedResume[]>([]);
  const [savedJds, setSavedJds] = useState<SavedJd[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [profileId, setProfileId] = useState("");
  const [resumeFromProfile, setResumeFromProfile] = useState("");
  const [automations, setAutomations] = useState<GenerateOptions>({});

  /** Fill the base-resume box with the profile's resume text, unless it is empty. */
  function fillResumeFromProfile(profile: UserProfile) {
    const text = profileToResumeMarkdown(profile);
    if (text.trim().length === 0) return;
    setBaseResume(text);
    setResumeFromProfile(profile.id);
  }

  useEffect(() => {
    let alive = true;
    void Promise.all([listResumes(), listJds(), listProfiles()])
      .then(([r, j, p]) => {
        if (!alive) return;
        setSavedResumes(r);
        setSavedJds(j);
        setProfiles(p);
        // The master profile is the default input for new evaluations.
        const master = p.find((prof) => prof.isMaster);
        if (master) {
          setProfileId(master.id);
          fillResumeFromProfile(master);
        }
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      alive = false;
    };
  }, []);

  async function handleSubmit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const job = await createJob({
        profileId: profileId || undefined,
        jobDescription,
        baseResume,
        location: jobLocation.trim() || undefined,
        generate: Object.values(automations).some(Boolean) ? automations : undefined,
      });
      window.location.href = `/jobs/${job.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  function loadSample() {
    setJobDescription(SAMPLE_JD);
    setBaseResume(SAMPLE_RESUME);
  }

  function toggleAutomation(key: keyof GenerateOptions) {
    setAutomations((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const ready =
    jobDescription.trim().length >= 80 && baseResume.trim().length >= 50;
  const activeProfile = profiles.find((p) => p.id === profileId);

  return (
    <form className="panel form" onSubmit={handleSubmit}>
      <div className="form-row">
        <label htmlFor="candidate-profile">Candidate profile</label>
        <select
          id="candidate-profile"
          value={profileId}
          onChange={(e) => {
            const value = e.target.value;
            setProfileId(value);
            if (!value) return;
            const profile = profiles.find((p) => p.id === value);
            if (profile && resumeFromProfile !== profile.id) fillResumeFromProfile(profile);
          }}
        >
          <option value="">No profile (resume text only)</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.isMaster ? " (master)" : ""}
              {p.email ? ` · ${p.email}` : ""}
            </option>
          ))}
        </select>
        {activeProfile && (
          <p className="hint">
            Base resume auto-filled from this profile. Edit freely; the structured
            profile JSON is also passed to generation.
          </p>
        )}
      </div>

      <div className="form-row">
        <label htmlFor="jd">
          Job description{" "}
          {savedJds.length > 0 && (
            <span className="hint">or load a saved one</span>
          )}
        </label>
        {savedJds.length > 0 && (
          <select
            aria-label="Saved job descriptions"
            value=""
            onChange={(e) => {
              const found = savedJds.find((j) => j.id === e.target.value);
              if (found) setJobDescription(found.content);
            }}
          >
            <option value="">Load saved JD...</option>
            {savedJds.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title}
              </option>
            ))}
          </select>
        )}
        <textarea
          id="jd"
          rows={9}
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
          placeholder="Paste the full job description..."
        />
      </div>

      <div className="form-row">
        <label htmlFor="location">
          Job location{" "}
          <span className="hint">(optional)</span>
        </label>
        <input
          id="location"
          type="text"
          value={jobLocation}
          onChange={(e) => setJobLocation(e.target.value)}
          placeholder="e.g. New York, USA"
        />
      </div>

      <div className="form-row">
        <label htmlFor="resume">
          Base resume{" "}
          {savedResumes.length > 0 && (
            <span className="hint">or load a saved one</span>
          )}
        </label>
        {savedResumes.length > 0 && (
          <select
            aria-label="Saved resumes"
            value=""
            onChange={(e) => {
              const found = savedResumes.find((r) => r.id === e.target.value);
              if (found) setBaseResume(found.content);
            }}
          >
            <option value="">Load saved resume...</option>
            {savedResumes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </select>
        )}
        <textarea
          id="resume"
          rows={12}
          value={baseResume}
          onChange={(e) => setBaseResume(e.target.value)}
          placeholder="Paste the candidate's resume (text or markdown)..."
        />
      </div>

      <div className="form-row">
        <label>Auto-generate after the committee</label>
        <div className="checkbox-row">
          <label className="check">
            <input
              type="checkbox"
              checked={Boolean(automations.resume)}
              onChange={() => toggleAutomation("resume")}
            />
            Resume
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={Boolean(automations.coverLetter)}
              onChange={() => toggleAutomation("coverLetter")}
            />
            Cover letter
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={Boolean(automations.coldEmail)}
              onChange={() => toggleAutomation("coldEmail")}
            />
            Cold-email intro
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={Boolean(automations.interview)}
              onChange={() => toggleAutomation("interview")}
            />
            Interview mock
          </label>
        </div>
        <p className="hint">
          Leave unchecked to generate each artifact on demand from its panel.
        </p>
      </div>

      <div className="form-row">
        <label htmlFor="enhancement-tier">Resume enhancement tier</label>
        <select
          id="enhancement-tier"
          value={automations.enhancementTier ?? ""}
          onChange={(e) => {
            const value = e.target.value as EnhancementTier | "";
            setAutomations((prev) => ({
              ...prev,
              enhancementTier: value || undefined,
            }));
          }}
        >
          <option value="">Balanced (default)</option>
          <option value="conservative">Conservative</option>
          <option value="balanced">Balanced</option>
          <option value="competitive">Competitive</option>
        </select>
        <p className="hint">
          How aggressively the resume may surface experience implied by the source:
          Conservative keeps facts as-is, Competitive surfaces more (still audited).
        </p>
      </div>

      <div className="form-actions">
        <button type="button" className="btn secondary" onClick={loadSample} disabled={submitting}>
          Load sample
        </button>
        <button type="submit" className="btn" disabled={submitting || !ready}>
          {submitting ? "Starting evaluation..." : "Start evaluation"}
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}
    </form>
  );
}

export default function NewJobForm() {
  return (
    <ErrorBoundary>
      <NewJobFormInner />
    </ErrorBoundary>
  );
}
