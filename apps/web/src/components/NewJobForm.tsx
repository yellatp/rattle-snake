import { useState } from "react";
import type { SyntheticEvent } from "react";
import { detectDomain, type Domain, type LlmOverride } from "@rattlesnake/shared";
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

const BYOK_STORAGE_KEY = "rattlesnake.byok.v1";

const PROVIDERS: { value: string; label: string; baseUrl: string; model: string }[] = [
  { value: "custom", label: "Custom (OpenAI-compatible)", baseUrl: "", model: "" },
  { value: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  { value: "anthropic", label: "Anthropic", baseUrl: "https://api.anthropic.com", model: "claude-sonnet-4-5" },
  { value: "google", label: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com", model: "gemini-2.5-flash" },
  { value: "deepseek", label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  { value: "kimi", label: "Kimi (Moonshot)", baseUrl: "https://api.moonshot.cn/v1", model: "kimi-k2-0905-preview" },
  { value: "grok", label: "Grok (xAI)", baseUrl: "https://api.x.ai/v1", model: "grok-3-mini" },
  { value: "groq", label: "Groq", baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" },
  { value: "qwen", label: "Qwen (Alibaba)", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus" },
  { value: "openrouter", label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4o-mini" },
  { value: "ollama", label: "Ollama (local)", baseUrl: "http://localhost:11434/v1", model: "llama3.1" },
  { value: "vllm", label: "vLLM (local)", baseUrl: "http://localhost:8000/v1", model: "" },
  { value: "lmstudio", label: "LM Studio (local)", baseUrl: "http://localhost:1234/v1", model: "" },
  { value: "localai", label: "LocalAI (local)", baseUrl: "http://localhost:8080/v1", model: "" },
];

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
  const [jobDescription, setJobDescription] = useState("");
  const [baseResume, setBaseResume] = useState("");
  const [detected, setDetected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [llm, setLlm] = useState<LlmSettings>(loadLlmSettings);

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
        llm: override,
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
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={llm.enabled}
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
