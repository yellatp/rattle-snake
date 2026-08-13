import { useEffect, useMemo, useState } from "react";
import { marked } from "marked";
import type {
  Blueprint,
  JobState,
  ResumeMeta,
  TranscriptEntry,
} from "@rattlesnake/shared";
import { getJob, streamUrl, updateJobResume } from "../lib/api";

interface Props {
  jobId: string;
  initialJob?: JobState | null;
}

type GroupKey = string;

function roundLabel(round: number | "ballot"): string {
  return round === "ballot" ? "Final Ballot" : `Round ${round}`;
}

function isSectorRole(role: string): boolean {
  return /sector|domain specialist|domain expert/i.test(role);
}

function toneClass(role: string): string {
  if (isSectorRole(role)) return "sector";
  if (/recruiter/i.test(role)) return "recruiter";
  if (/vp|head|director|managing/i.test(role)) return "manager";
  return "tech";
}

function groupEntries(entries: TranscriptEntry[]): { key: GroupKey; label: string; entries: TranscriptEntry[] }[] {
  const groups = new Map<GroupKey, TranscriptEntry[]>();
  for (const entry of entries) {
    const key = roundLabel(entry.round);
    const list = groups.get(key) ?? [];
    list.push(entry);
    groups.set(key, list);
  }
  return [...groups.entries()].map(([key, list]) => ({ key, label: key, entries: list }));
}

export default function DebateView({ jobId, initialJob = null }: Props) {
  const [job, setJob] = useState<JobState | null>(initialJob);
  const [hasLoaded, setHasLoaded] = useState<boolean>(!!initialJob);
  const [connected, setConnected] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [tallies, setTallies] = useState<{ HIRE: number; REJECT: number } | null>(null);

  // Fetch the job when the page was server-rendered without data.
  useEffect(() => {
    if (job) return;
    getJob(jobId)
      .then((loaded) => {
        setJob(loaded);
        setHasLoaded(true);
      })
      .catch((err) =>
        setLiveError(err instanceof Error ? err.message : String(err)),
      );
  }, [job, jobId]);

  function patch(patch: Partial<JobState>) {
    setJob((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  // Open the SSE stream once the job exists; persists across state updates.
  useEffect(() => {
    if (!hasLoaded) return;
    const es = new EventSource(streamUrl(jobId));

    es.onopen = () => setConnected(true);

    es.addEventListener("job", (e) => {
      const data = JSON.parse((e as MessageEvent).data) as { job: JobState };
      setJob(data.job);
    });
    es.addEventListener("entry", (e) => {
      const data = JSON.parse((e as MessageEvent).data) as { entry: TranscriptEntry };
      setJob((prev) =>
        prev ? { ...prev, transcript: [...prev.transcript, data.entry] } : prev,
      );
    });
    es.addEventListener("status", (e) => {
      const data = JSON.parse((e as MessageEvent).data) as { status: JobState["status"] };
      patch({ status: data.status });
    });
    es.addEventListener("verdict", (e) => {
      const data = JSON.parse((e as MessageEvent).data) as {
        verdict: "SHORTLISTED" | "REJECTED";
        tallies: { HIRE: number; REJECT: number };
      };
      setTallies(data.tallies);
      patch({ finalVerdict: data.verdict });
    });
    es.addEventListener("blueprint", (e) => {
      const data = JSON.parse((e as MessageEvent).data) as { blueprint: Blueprint };
      patch({ blueprint: data.blueprint });
    });
    es.addEventListener("resume", (e) => {
      const data = JSON.parse((e as MessageEvent).data) as {
        rewrittenResume: string;
        rewrittenResumeJson?: string;
        resumeMeta?: ResumeMeta;
      };
      patch({
        rewrittenResume: data.rewrittenResume,
        rewrittenResumeJson: data.rewrittenResumeJson,
        resumeMeta: data.resumeMeta,
      });
    });
    es.addEventListener("done", (e) => {
      const data = JSON.parse((e as MessageEvent).data) as { job: JobState };
      setJob(data.job);
      es.close();
      setConnected(false);
    });
    es.addEventListener("error", (e) => {
      const data = JSON.parse((e as MessageEvent).data) as { message: string };
      setLiveError(data.message);
      es.close();
      setConnected(false);
    });

    return () => es.close();
  }, [jobId, hasLoaded]);

  const groups = useMemo(() => groupEntries(job?.transcript ?? []), [job?.transcript]);
  const isLive = job?.status === "debating" || job?.status === "rewriting";

  if (!job) {
    return (
      <div className="debate-view">
        <p className="hint">{liveError ? `Failed to load run: ${liveError}` : "Loading run..."}</p>
      </div>
    );
  }

  return (
    <div className="debate-view">
      <header className="run-header">
        <div>
          <div className="run-title-row">
            <h1>Committee Run</h1>
            <span className="tag">{job.domain}</span>
            <StatusPill status={job.status} connected={connected} />
          </div>
          <p className="hint mono">
            {job.id} · sector focus: {job.sectorFocus ?? "template default"}
            {job.llmUsed && (
              <>
                {" · "}
                ran on <span className="tag">{job.llmUsed.provider}</span>{" "}
                <span className="mono">{job.llmUsed.model}</span>
              </>
            )}
          </p>
        </div>
      </header>

      {liveError && <div className="error-banner">{liveError}</div>}
      {isLive && (
        <div className="live-bar">
          <span className="live-dot" />
          {job.status === "debating" ? "Committee debating..." : "Rewriting resume..."}
        </div>
      )}

      {job.finalVerdict && <VerdictCard verdict={job.finalVerdict} tallies={tallies} ballot={job.blueprint?.verdicts} />}

      <section className="panel">
        <h2>Debate Transcript</h2>
        {groups.length === 0 && <p className="hint">The committee has not spoken yet — refreshing live...</p>}
        {groups.map((group) => (
          <div key={group.key} className="round-group">
            <h3>{group.label}</h3>
            {group.entries.map((entry) => (
              <AgentCard key={entry.id} entry={entry} />
            ))}
          </div>
        ))}
      </section>

      {job.blueprint && <BlueprintView blueprint={job.blueprint} />}
      {job.rewrittenResume && (
        <RewrittenResume
          resume={job.rewrittenResume}
          resumeJson={job.rewrittenResumeJson}
          meta={job.resumeMeta}
          jobId={job.id}
          onSaved={patch}
        />
      )}
    </div>
  );
}

function StatusPill({ status, connected }: { status: JobState["status"]; connected: boolean }) {
  const map: Record<JobState["status"], string> = {
    pending: "pending",
    debating: "debating",
    rewriting: "rewriting",
    completed: "completed",
    failed: "failed",
  };
  return (
    <span className={`tag status ${map[status]}`}>
      {connected ? "live" : ""} {status}
    </span>
  );
}

function AgentCard({ entry }: { entry: TranscriptEntry }) {
  const tone = toneClass(entry.role);
  return (
    <div className={`agent-card ${tone}`}>
      <div className="agent-head">
        <span className={`avatar ${tone}`}>{entry.sender[0]}</span>
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
      <pre className="agent-text">{entry.text}</pre>
    </div>
  );
}

function VerdictCard({
  verdict,
  tallies,
  ballot,
}: {
  verdict: "SHORTLISTED" | "REJECTED";
  tallies: { HIRE: number; REJECT: number } | null;
  ballot?: Record<string, string>;
}) {
  const shortlisted = verdict === "SHORTLISTED";
  return (
    <section className={`verdict-card ${shortlisted ? "shortlisted" : "rejected"}`}>
      <h2>{shortlisted ? "SHORTLISTED" : "REJECTED"}</h2>
      <p className="hint">Weighted committee consensus — neutral outcomes are impossible by design.</p>
      {tallies && (
        <div className="tallies">
          <div className="tally">
            <span className="tag hire">HIRE</span> <strong>{tallies.HIRE.toFixed(1)}</strong>
          </div>
          <div className="tally">
            <span className="tag reject">REJECT</span> <strong>{tallies.REJECT.toFixed(1)}</strong>
          </div>
        </div>
      )}
      {ballot && (
        <ul className="ballot-list">
          {Object.entries(ballot).map(([name, vote]) => (
            <li key={name}>
              {name} <span className={`tag ${vote === "HIRE" ? "hire" : "reject"}`}>{vote}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function BlueprintView({ blueprint }: { blueprint: Blueprint }) {
  const sections: { title: string; items: string[]; accent: string }[] = [
    { title: "Objections Raised", items: blueprint.objections, accent: "reject" },
    { title: "Strengths Agreed", items: blueprint.strengths, accent: "hire" },
    { title: "Required Resume Changes", items: blueprint.requiredChanges, accent: "accent" },
    { title: "Sector Specialist Notes", items: blueprint.sectorNotes, accent: "sector" },
    { title: "Deciding Pivot Factors", items: blueprint.pivotFactors, accent: "warn" },
  ];
  return (
    <section className="panel">
      <h2>Hiring Committee Blueprint</h2>
      <div className="blueprint-grid">
        {sections.map((s) => (
          <div key={s.title} className="blueprint-section">
            <h3>
              <span className={`tag ${s.accent}`}>{s.title}</span>
            </h3>
            <ul>
              {(s.items ?? []).length === 0 && <li className="hint">None recorded</li>}
              {(s.items ?? []).map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

type ResumeTab = "markdown" | "json";

function RewrittenResume({
  resume,
  resumeJson,
  meta,
  jobId,
  onSaved,
}: {
  resume: string;
  resumeJson?: string;
  meta?: ResumeMeta;
  jobId: string;
  onSaved: (patch: Partial<JobState>) => void;
}) {
  const html = useMemo(() => marked.parse(resume, { async: false }) as string, [resume]);
  const [tab, setTab] = useState<ResumeTab>("markdown");
  const [draft, setDraft] = useState<string>(resumeJson ?? "");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Keep the draft in sync with the latest streamed version.
  useEffect(() => {
    if (resumeJson !== undefined && resumeJson !== draft) setDraft(resumeJson);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeJson]);

  const save = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const updated = await updateJobResume(jobId, { rewrittenResumeJson: draft });
      onSaved(updated);
      setNotice("Saved");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Rewritten Resume (objections resolved)</h2>
        {meta && <ResumeMetaBadge meta={meta} />}
      </div>

      <div className="tabs" role="tablist">
        <button
          type="button"
          className={`tab ${tab === "markdown" ? "active" : ""}`}
          onClick={() => setTab("markdown")}
        >
          Markdown
        </button>
        <button
          type="button"
          className={`tab ${tab === "json" ? "active" : ""}`}
          onClick={() => setTab("json")}
        >
          JSON {resumeJson ? "· edit" : ""}
        </button>
      </div>

      {tab === "markdown" ? (
        <article className="resume-md" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <div>
          <textarea
            className="resume-json-editor"
            aria-label="Structured resume JSON"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setNotice(null);
            }}
            spellCheck={false}
          />
          <div className="resume-editor-actions">
            <button type="button" className="btn primary" onClick={save} disabled={saving}>
              {saving ? "Saving..." : "Save changes"}
            </button>
            {notice && <span className="hint">{notice}</span>}
          </div>
        </div>
      )}
    </section>
  );
}

function ResumeMetaBadge({ meta }: { meta: ResumeMeta }) {
  return (
    <div className="resume-meta">
      <span className="tag accent">role: {meta.roleLabel}</span>
      <span className={`tag ${meta.atsScore >= 60 ? "hire" : "warn"}`}>
        ATS {meta.atsScore}%
      </span>
      <span className={`tag ${meta.moderationApproved ? "hire" : "reject"}`}>
        auditor {meta.moderationScore}/100
      </span>
      <span className="tag">{meta.iterations > 1 ? `${meta.iterations} passes` : "1 pass"}</span>
      {meta.locale && <span className="tag">English: {meta.locale.toUpperCase()}</span>}
    </div>
  );
}
