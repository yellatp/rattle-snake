import { useState } from "react";
import type { SyntheticEvent } from "react";
import { detectDomain, type Domain } from "@rattlesnake/shared";
import { createJob } from "../lib/api";

const DOMAIN_OPTIONS: { value: Domain; label: string; committee: string }[] = [
  { value: "SWE", label: "Software Engineering", committee: "Priya · Alex · Marcus · Elena · Liam" },
  { value: "DATA_AI", label: "Data & AI", committee: "Sarah · Dr. Aris · Vikram · Karen · Maya" },
  { value: "FINANCE", label: "Finance & Banking", committee: "David · Elena · Michael · Chen · Sophia" },
];

const SAMPLE_JD = `Senior Backend Engineer — FinTech Payments Platform

We build low-latency payment processing. You will own services that move money
between merchants and banks in real time.

Requirements: 5+ years building backend systems in TypeScript, Go, or Java.
Strong systems design: distributed systems, microservices, concurrency,
idempotency. Experience with event-driven architecture (Kafka, SQS).
PostgreSQL at scale (indexing, partitioning). PCI-DSS awareness. Production
debugging and on-call ownership.

Nice to have: payment domain experience (ledgers, double-entry, settlement).`;

const SAMPLE_RESUME = `Rohan Mehta — Backend Engineer (6 years)

Senior Software Engineer — RetailWorks (E-commerce), 2021–Present
- Built inventory synchronization services keeping warehouse systems in sync
- Improved API response latency by refactoring database queries
- Worked on the order processing pipeline handling 2M+ orders/month
- Introduced automated tests and CI for the payments integration team
- Migrated a monolith to event-driven microservices using Kafka

Software Engineer — TravelBuddy (Travel tech), 2019–2021
- Developed RESTful APIs in Node.js for the booking engine
- Built a Redis caching layer to reduce read load on PostgreSQL
- Helped maintain Docker and Kubernetes deployments

Skills: TypeScript, Node.js, Go, PostgreSQL, Redis, Kafka, Docker, Kubernetes,
AWS, Terraform, CI/CD, TDD, observability (Grafana, Prometheus).`;

export default function NewJobForm() {
  const [domain, setDomain] = useState<string>("");
  const [sectorFocus, setSectorFocus] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [baseResume, setBaseResume] = useState("");
  const [detected, setDetected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleJdBlur() {
    if (domain) return;
    const guess = detectDomain(jobDescription);
    setDetected(guess ? DOMAIN_OPTIONS.find((d) => d.value === guess)?.label ?? null : null);
    if (guess) setDomain(guess);
  }

  async function handleSubmit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const job = await createJob({
        domain: domain || undefined,
        jobDescription,
        baseResume,
        sectorFocus: sectorFocus.trim() || undefined,
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
    setDomain("SWE");
    setDetected("Software Engineering");
  }

  const ready =
    jobDescription.trim().length >= 80 && baseResume.trim().length >= 50;

  return (
    <form className="panel form" onSubmit={handleSubmit}>
      <div className="form-row">
        <label htmlFor="domain">Committee domain</label>
        <div className="domain-grid">
          {DOMAIN_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`domain-card ${domain === opt.value ? "selected" : ""}`}
            >
              <input
                type="radio"
                name="domain"
                value={opt.value}
                checked={domain === opt.value}
                onChange={() => setDomain(opt.value)}
              />
              <span className="domain-title">{opt.label}</span>
              <span className="domain-members mono">{opt.committee}</span>
            </label>
          ))}
        </div>
        {detected && (
          <p className="hint">
            Auto-detected from the JD: <strong>{detected}</strong>. You can override above.
          </p>
        )}
      </div>

      <div className="form-row">
        <label htmlFor="sectorFocus">
          Sector Specialist focus{" "}
          <span className="hint">(optional — e.g. FinTech, HealthTech, Energy)</span>
        </label>
        <input
          id="sectorFocus"
          type="text"
          value={sectorFocus}
          onChange={(e) => setSectorFocus(e.target.value)}
          placeholder="Defaults to the domain template's sector specialist"
        />
      </div>

      <div className="form-row">
        <label htmlFor="jd">Job description</label>
        <textarea
          id="jd"
          rows={9}
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
          onBlur={handleJdBlur}
          placeholder="Paste the full job description..."
        />
      </div>

      <div className="form-row">
        <label htmlFor="resume">Base resume</label>
        <textarea
          id="resume"
          rows={12}
          value={baseResume}
          onChange={(e) => setBaseResume(e.target.value)}
          placeholder="Paste the candidate's resume (text or markdown)..."
        />
      </div>

      <div className="form-actions">
        <button type="button" className="btn secondary" onClick={loadSample} disabled={submitting}>
          Load sample
        </button>
        <button type="submit" className="btn" disabled={submitting || !ready}>
          {submitting ? "Starting committee..." : "Start committee debate"}
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}
    </form>
  );
}
