import { useEffect, useState } from "react";
import type { SyntheticEvent } from "react";
import { detectDomain, type Domain, type LlmOverride } from "@rattlesnake/shared";
import { createJob, listConnections, listJds, listResumes } from "../lib/api";
import type { SavedJd, SavedResume, LlmConnection } from "@rattlesnake/shared";
import { PROVIDERS } from "../lib/providers";

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

const BYOK_STORAGE_KEY = "rattlesnake.byok.v1";

interface LlmSettings {
  enabled: boolean;
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: string;
}

const DEFAULT_LLM: LlmSettings = {
  enabled: false,
  provider: "openai",
  baseUrl: "",
  apiKey: "",
  model: "",
  temperature: "0.3",
};

function loadLlmSettings(): LlmSettings {
  if (typeof window === "undefined") return DEFAULT_LLM;
  try {
    const raw = window.localStorage.getItem(BYOK_STORAGE_KEY);
    if (!raw) return DEFAULT_LLM;
    return { ...DEFAULT_LLM, ...(JSON.parse(raw) as Partial<LlmSettings>) };
  } catch {
    return DEFAULT_LLM;
  }
}

export default function NewJobForm() {
  const [domain, setDomain] = useState<string>("");
  const [sectorFocus, setSectorFocus] = useState("");
  const [jobLocation, setJobLocation] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [baseResume, setBaseResume] = useState("");
  const [detected, setDetected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [llm, setLlm] = useState<LlmSettings>(loadLlmSettings);
  const [savedResumes, setSavedResumes] = useState<SavedResume[]>([]);
  const [savedJds, setSavedJds] = useState<SavedJd[]>([]);
  const [connections, setConnections] = useState<LlmConnection[]>([]);
  const [connectionId, setConnectionId] = useState("");
  const [pickerError, setPickerError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void Promise.all([
      listResumes(),
      listJds(),
      listConnections(),
    ])
      .then(([r, j, c]) => {
        if (!alive) return;
        setSavedResumes(r);
        setSavedJds(j);
        setConnections(c);
        const def = c.find((conn) => conn.isDefault);
        if (def) setConnectionId(def.id);
      })
      .catch((err) => {
        if (alive) setPickerError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      alive = false;
    };
  }, []);

  function handleJdBlur() {
    if (domain) return;
    const guess = detectDomain(jobDescription);
    setDetected(guess ? DOMAIN_OPTIONS.find((d) => d.value === guess)?.label ?? null : null);
    if (guess) setDomain(guess);
  }

  function handleProviderChange(provider: string) {
    const preset = PROVIDERS.find((p) => p.value === provider);
    setLlm((prev) => ({
      ...prev,
      provider,
      baseUrl: prev.baseUrl || preset?.baseUrl || "",
      model: prev.model || preset?.model || "",
    }));
  }

  function patchLlm(patch: Partial<LlmSettings>) {
    setLlm((prev) => ({ ...prev, ...patch }));
  }

  async function handleSubmit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(BYOK_STORAGE_KEY, JSON.stringify(llm));
      }
      const override: LlmOverride | undefined = llm.enabled
        ? {
            provider: llm.provider || undefined,
            baseUrl: llm.baseUrl.trim() || undefined,
            apiKey: llm.apiKey.trim() || undefined,
            model: llm.model.trim() || undefined,
            temperature:
              llm.temperature !== "" ? Number.parseFloat(llm.temperature) : undefined,
          }
        : undefined;
      const job = await createJob({
        domain: domain || undefined,
        jobDescription,
        baseResume,
        sectorFocus: sectorFocus.trim() || undefined,
        location: jobLocation.trim() || undefined,
        llm: override,
        llmConnectionId: connectionId || undefined,
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
        <label htmlFor="llm-connection">
          Saved LLM API{" "}
          <span className="hint">(from Settings — stored encrypted server-side)</span>
        </label>
        <select
          id="llm-connection"
          value={connectionId}
          onChange={(e) => {
            const value = e.target.value;
            setConnectionId(value);
            if (value && llm.enabled) patchLlm({ enabled: false });
          }}
        >
          <option value="">Server default / mock</option>
          {connections.map((conn) => (
            <option key={conn.id} value={conn.id}>
              {conn.name} — {conn.provider}
              {conn.model ? ` (${conn.model})` : ""}
              {conn.isDefault ? " ⭐" : ""}
            </option>
          ))}
        </select>
        {pickerError && <p className="hint error-hint">{pickerError}</p>}
      </div>

      <div className="form-row">
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={llm.enabled}
            disabled={Boolean(connectionId)}
            onChange={(e) => patchLlm({ enabled: e.target.checked })}
          />
          Bring your own LLM API{" "}
          <span className="hint">— endpoint, key and model for this run instead of the server default</span>
        </label>
        {llm.enabled && (
          <div className="llm-box">
            <div className="grid-2">
              <div className="form-row">
                <label htmlFor="llm-provider">Provider</label>
                <select
                  id="llm-provider"
                  value={llm.provider}
                  onChange={(e) => handleProviderChange(e.target.value)}
                >
                  {PROVIDERS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <label htmlFor="llm-model">Model</label>
                <input
                  id="llm-model"
                  type="text"
                  value={llm.model}
                  onChange={(e) => patchLlm({ model: e.target.value })}
                  placeholder="Required if the provider has no default"
                />
              </div>
            </div>
            <div className="form-row">
              <label htmlFor="llm-baseUrl">Base URL</label>
              <input
                id="llm-baseUrl"
                type="text"
                value={llm.baseUrl}
                onChange={(e) => patchLlm({ baseUrl: e.target.value })}
                placeholder="OpenAI-compatible endpoint (preset default is prefilled)"
              />
            </div>
            <div className="form-row">
              <label htmlFor="llm-apiKey">API key</label>
              <input
                id="llm-apiKey"
                type="password"
                autoComplete="off"
                value={llm.apiKey}
                onChange={(e) => patchLlm({ apiKey: e.target.value })}
                placeholder="sk-..."
              />
            </div>
            <div className="form-row">
              <label htmlFor="llm-temperature">
                Temperature{" "}
                <span className="hint">(0–2, default 0.3)</span>
              </label>
              <input
                id="llm-temperature"
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={llm.temperature}
                onChange={(e) => patchLlm({ temperature: e.target.value })}
              />
            </div>
            <p className="hint">
              Stored only in this browser. The key is sent to your API server per run and
              is never persisted to the database.
            </p>
          </div>
        )}
      </div>

      <div className="form-row">
        <label htmlFor="jd">
          Job description{" "}
          {savedJds.length > 0 && (
            <span className="hint">— or load a saved one</span>
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
            <option value="">Load saved JD…</option>
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
          onBlur={handleJdBlur}
          placeholder="Paste the full job description..."
        />
      </div>

      <div className="form-row">
        <label htmlFor="location">
          Job location{" "}
          <span className="hint">— optional; sets US or UK English for the resume</span>
        </label>
        <input
          id="location"
          type="text"
          value={jobLocation}
          onChange={(e) => setJobLocation(e.target.value)}
          placeholder="e.g. New York, USA · London, UK (auto-detected from the JD if left blank)"
        />
      </div>

      <div className="form-row">
        <label htmlFor="resume">
          Base resume{" "}
          {savedResumes.length > 0 && (
            <span className="hint">— or load a saved one</span>
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
            <option value="">Load saved resume…</option>
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
