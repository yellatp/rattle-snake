import { useEffect, useMemo, useState } from "react";
import { marked } from "marked";
import type {
  AuthenticityFlag,
  Blueprint,
  ColdEmailDraft,
  CoverLetterDraft,
  DebatePhase,
  DirectorAudit,
  ExecutiveReview,
  ExecutiveScore,
  GapAnalysisResult,
  InterviewPrepPlan,
  JdMeta,
  JobDecomposition,
  JobState,
  ResumeComparison,
  ResumeMeta,
  SmeAnalysis,
  SmeFactorScore,
  TranscriptEntry,
} from "@rattlesnake/shared";
import {
  cancelJob,
  getJob,
  getResumeVersions,
  selectResumeVersion,
  startResumeAb,
  streamUrl,
  updateJobResume,
  type ResumeVersionsResponse,
} from "../lib/api";
import { sanitizeMarkdownHtml } from "../lib/sanitize";
import ErrorBoundary from "./ErrorBoundary";
import ColdEmailPanel from "./ColdEmailPanel";
import CoverLetterPanel from "./CoverLetterPanel";
import GapAnalysisCard from "./GapAnalysisCard";
import InterviewMockPanel from "./InterviewMockPanel";
import ModeratorFeedback from "./ModeratorFeedback";
import ScenarioPanel from "./ScenarioPanel";
import {
  DEFAULT_EXPORT_OPTIONS,
  EXPORT_FORMAT_LABELS,
  EXPORT_PRESET_LABELS,
  PAGE_FORMAT_LABELS,
  downloadResume,
  downloadTranscript,
  type ResumeDownloadKind,
  type ResumeExportFormat,
  type ResumeExportOptions,
  type ResumeExportPreset,
  type ResumePageFormat,
} from "../lib/export";

interface Props {
  jobId: string;
  initialJob?: JobState | null;
}

type GroupKey = string;

function roundLabel(round: number | "ballot"): string {
  if (round === "ballot") return "Final Ballot";
  return round === 1 ? "360 Analysis & Openings" : `Round ${round}`;
}

/** Fixed order of run stages for the phase tracker. */
const PHASE_STEPS: { key: DebatePhase; label: string }[] = [
  { key: "jdMeta", label: "Job metadata" },
  { key: "decomposition", label: "Role decomposition" },
  { key: "panel", label: "Panel assembly" },
  { key: "opening", label: "Round 1 openings" },
  { key: "crosstalk", label: "Cross-talk" },
  { key: "ballot", label: "Final ballot" },
  { key: "blueprint", label: "Blueprint" },
  { key: "director", label: "Director audit" },
  { key: "executive", label: "Executive review" },
  { key: "gapAnalysis", label: "Gap analysis" },
  { key: "chain", label: "Auto-generation" },
  { key: "done", label: "Complete" },
];

/** Current stage of a run: server-streamed when available, else derived. */
function currentPhase(job: JobState): DebatePhase {
  if (job.phase) return job.phase;
  if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
    return "done";
  }
  if (!job.jdMeta) return "jdMeta";
  if (!job.jobDecomposition) return "decomposition";
  if ((job.analyses?.length ?? 0) === 0) return "panel";
  if (!job.finalVerdict) {
    const rounds = job.transcript.map((e) => e.round);
    if (rounds.includes("ballot")) return "ballot";
    if (rounds.some((r) => typeof r === "number" && r >= 2)) return "crosstalk";
    return "opening";
  }
  if (!job.blueprint) return "blueprint";
  if (job.directorAudit && job.status === "debating" && !job.executiveReview) return "director";
  if (!job.executiveReview) return "executive";
  if (!job.gapAnalysis) return "gapAnalysis";
  if (job.status === "debating") return "chain";
  return "done";
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

function fitClass(score: number): string {
  if (score >= 7) return "hire";
  if (score >= 5) return "warn";
  return "reject";
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

/** Safely extract a JSON payload from an SSE event; null for native/malformed events. */
function sseData<T>(event: Event): T | null {
  if (!(event instanceof MessageEvent) || typeof event.data !== "string") return null;
  try {
    return JSON.parse(event.data) as T;
  } catch {
    console.warn("[sse] dropped malformed payload for event:", event.type);
    return null;
  }
}

function DebateViewInner({ jobId, initialJob = null }: Props) {
  const [job, setJob] = useState<JobState | null>(initialJob);
  const [hasLoaded, setHasLoaded] = useState<boolean>(!!initialJob);
  const [connected, setConnected] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [tallies, setTallies] = useState<Record<string, number> | null>(null);
  const [abV2, setAbV2] = useState<{ markdown: string; templateJson: string } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [stalled, setStalled] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);

  async function handleCancel() {
    const confirmed = window.confirm(
      "Terminate this run now? The current agent call finishes, then the run stops and is marked cancelled.",
    );
    if (!confirmed) return;
    setCancelling(true);
    try {
      await cancelJob(jobId);
      setLiveError(null);
      const loaded = await getJob(jobId);
      setJob(loaded);
    } catch (err) {
      setLiveError(err instanceof Error ? err.message : String(err));
    } finally {
      setCancelling(false);
    }
  }

  // Signals the page-level safety net that the island hydrated successfully.
  useEffect(() => {
    (window as unknown as { __debateViewReady?: boolean }).__debateViewReady = true;
  }, []);

  // Fetch the job when the page was server-rendered without data.
  useEffect(() => {
    if (job) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    setLiveError(null);
    getJob(jobId, controller.signal)
      .then((loaded) => {
        setJob(loaded);
        setHasLoaded(true);
      })
      .catch((err) => {
        if (controller.signal.aborted) {
          setLiveError("Timed out waiting for the API server to respond.");
        } else {
          setLiveError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => clearTimeout(timer));
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [job, jobId, reloadKey]);

  function patch(patch: Partial<JobState>) {
    setJob((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  function addAnalysis(analysis: SmeAnalysis) {
    setJob((prev) => {
      if (!prev) return prev;
      const existing = prev.analyses ?? [];
      const next = existing.filter((a) => a.seat !== analysis.seat);
      return { ...prev, analyses: [...next, analysis] };
    });
  }

  // Open the SSE stream once the job exists; persists across state updates.
  useEffect(() => {
    if (!hasLoaded) return;
    const es = new EventSource(streamUrl(jobId));
    let lastEvent = Date.now();

    es.onopen = () => setConnected(true);

    // The backend pings every 15s while a run is live. If we go silent for a
    // while, the stream is dead (e.g. the backend process was restarted), so
    // close it instead of letting the browser retry forever.
    es.addEventListener("ping", () => {
      lastEvent = Date.now();
    });
    const watchdog = setInterval(() => {
      if (Date.now() - lastEvent > 45_000) {
        setConnected(false);
        setStalled(true);
        es.close();
        clearInterval(watchdog);
      }
    }, 10_000);

    es.addEventListener("job", (e) => {
      const data = sseData<{ job: JobState }>(e);
      if (!data) return;
      setJob(data.job);
    });
    es.addEventListener("entry", (e) => {
      const data = sseData<{ entry: TranscriptEntry }>(e);
      if (!data) return;
      setJob((prev) =>
        prev ? { ...prev, transcript: [...prev.transcript, data.entry] } : prev,
      );
    });
    es.addEventListener("status", (e) => {
      const data = sseData<{ status: JobState["status"] }>(e);
      if (!data) return;
      patch({ status: data.status });
    });
    es.addEventListener("phase", (e) => {
      const data = sseData<{ phase: DebatePhase; activity?: string }>(e);
      if (!data) return;
      patch({ phase: data.phase, activity: data.activity });
    });
    es.addEventListener("jdMeta", (e) => {
      const data = sseData<{ jdMeta: JdMeta }>(e);
      if (!data) return;
      patch({ jdMeta: data.jdMeta });
    });
    es.addEventListener("jobDecomposition", (e) => {
      const data = sseData<{ jobDecomposition: JobDecomposition }>(e);
      if (!data) return;
      patch({ jobDecomposition: data.jobDecomposition });
    });
    es.addEventListener("analysis", (e) => {
      const data = sseData<{ analysis: SmeAnalysis }>(e);
      if (!data) return;
      addAnalysis(data.analysis);
    });
    es.addEventListener("verdict", (e) => {
      const data = sseData<{
        verdict: "SHORTLISTED" | "REJECTED";
        tallies: Record<string, number>;
      }>(e);
      if (!data) return;
      setTallies(data.tallies);
      patch({ finalVerdict: data.verdict });
    });
    es.addEventListener("blueprint", (e) => {
      const data = sseData<{ blueprint: Blueprint }>(e);
      if (!data) return;
      patch({ blueprint: data.blueprint });
    });
    es.addEventListener("director", (e) => {
      const data = sseData<{ audit: DirectorAudit }>(e);
      if (!data) return;
      patch({ directorAudit: data.audit });
    });
    es.addEventListener("executive", (e) => {
      const data = sseData<{ review: ExecutiveReview }>(e);
      if (!data) return;
      patch({ executiveReview: data.review });
    });
    es.addEventListener("gapAnalysis", (e) => {
      const data = sseData<{ gapAnalysis: GapAnalysisResult }>(e);
      if (!data) return;
      patch({ gapAnalysis: data.gapAnalysis });
    });
    es.addEventListener("resume", (e) => {
      const data = sseData<{
        rewrittenResume: string;
        rewrittenResumeJson?: string;
        resumeMeta?: ResumeMeta;
      }>(e);
      if (!data) return;
      patch({
        rewrittenResume: data.rewrittenResume,
        rewrittenResumeJson: data.rewrittenResumeJson,
        resumeMeta: data.resumeMeta,
      });
    });
    es.addEventListener("coldEmail", (e) => {
      const data = sseData<{ draft: ColdEmailDraft }>(e);
      if (!data) return;
      patch({ coldEmailDraft: data.draft });
    });
    es.addEventListener("coverLetter", (e) => {
      const data = sseData<{ draft: CoverLetterDraft }>(e);
      if (!data) return;
      patch({ coverLetterDraft: data.draft });
    });
    es.addEventListener("interview", (e) => {
      const data = sseData<{ plan: InterviewPrepPlan }>(e);
      if (!data) return;
      patch({ interviewPlan: data.plan });
    });
    es.addEventListener("resumeEval", (e) => {
      const data = sseData<{ version: 1 | 2 }>(e);
      if (!data) return;
      patch({ abPhase: data.version === 1 ? "eval1" : "comparison" });
    });
    es.addEventListener("resumeVariant", (e) => {
      const data = sseData<{ markdown: string; templateJson: string }>(e);
      if (!data) return;
      setAbV2({ markdown: data.markdown, templateJson: data.templateJson });
    });
    es.addEventListener("resumeComparison", (e) => {
      const data = sseData<{ comparison: ResumeComparison }>(e);
      if (!data) return;
      patch({ comparison: data.comparison, abPhase: "done" });
    });
    es.addEventListener("done", (e) => {
      const data = sseData<{ job: JobState }>(e);
      if (!data) return;
      setJob(data.job);
      es.close();
      clearInterval(watchdog);
      setConnected(false);
    });
    es.addEventListener("error", (e) => {
      const data = sseData<{ message: string }>(e);
      if (data) {
        setLiveError(data.message);
        es.close();
        clearInterval(watchdog);
        setConnected(false);
        return;
      }
      // Native EventSource error (connection drop/retry attempt): the stream
      // will reconnect on its own; the watchdog closes it if it stays dead.
      setConnected(false);
    });

    return () => {
      clearInterval(watchdog);
      es.close();
    };
  }, [jobId, hasLoaded]);

  const groups = useMemo(() => groupEntries(job?.transcript ?? []), [job?.transcript]);
  const isLive = job?.status === "pending" || job?.status === "debating";

  const liveMessage = useMemo(() => {
    if (!job) return "";
    if (job.status === "pending") {
      return job.jdMeta
        ? "Assembling the SME panel..."
        : "Extracting JD metadata and preparing the panel...";
    }
    if (job.status === "debating") {
      if (!job.jdMeta) return "Extracting JD metadata...";
      if (!job.jobDecomposition) return "Decomposing the role and assembling the panel...";
      const done = job.analyses?.length ?? 0;
      if (done === 0) return "360-degree analysis in progress...";
      if (!job.finalVerdict) return "Committee debating...";
      if (!job.executiveReview) return "Preparing the executive review...";
      if (!job.gapAnalysis) return "Analyzing gaps and drafting enhancement suggestions...";
    }
    return "";
  }, [job]);

  if (!job) {
    if (liveError) {
      return (
        <div className="debate-view">
          <section className="panel">
            <h2 className="panel-title">Could not load this run</h2>
            <p className="hint">{liveError}</p>
            <p className="hint">
              The run may have been created on a different machine or deleted, or the API
              server may be unreachable.
            </p>
            <div className="btn-row">
              <button className="btn" onClick={() => setReloadKey((k) => k + 1)}>
                Retry
              </button>
              <a className="btn subtle" href="/dashboard">
                Back to dashboard
              </a>
            </div>
          </section>
        </div>
      );
    }
    return (
      <div className="debate-view">
        <p id="run-loading" className="hint">
          Loading run...
        </p>
      </div>
    );
  }

  const handoffReady = job.status === "completed" && Boolean(job.blueprint);

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
            {job.id} Â· sector focus: {job.sectorFocus ?? "template default"}
            {job.roleSlug && <> Â· role: <span className="tag">{job.roleSlug}</span></>}
            {job.llmUsed && (
              <>
                {" Â· "}
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
          {liveMessage}
        </div>
      )}

      {stalled && (
        <div className="error-banner">
          Live updates stopped because the backend restarted or the stream went silent. The
          data below is still valid.{" "}
          <a href={`/jobs/${job.id}`}>Reload this run</a>
        </div>
      )}

      {(isLive || job.phase) && (
        <RunMonitor
          job={job}
          connected={connected}
          onCancel={handleCancel}
          cancelling={cancelling}
        />
      )}

      {isLive && <ScenarioPanel domain={job.domain} roleSlug={job.roleSlug} />}

      {handoffReady && (
        <section className="handoff-cta">
          <div>
            <h2>Evaluation complete</h2>
            <p className="hint">
              Resume generation is a separate step you run on demand.
            </p>
          </div>
          <a className="btn" href={`/resume?job=${job.id}`}>
            Generate resume
          </a>
        </section>
      )}

      {job.finalVerdict && <VerdictCard verdict={job.finalVerdict} tallies={tallies} ballot={job.blueprint?.verdicts} />}

      <RejectionBreakdown analyses={job.analyses ?? []} verdict={job.finalVerdict} />

      {job.jdMeta && <JdMetaCard meta={job.jdMeta} />}
      {job.jobDecomposition && <JobDecompositionCard decomposition={job.jobDecomposition} />}

      <SmePanel analyses={job.analyses ?? []} live={job.status === "debating"} />

      <section className="panel">
        <div className="panel-head">
          <h2>Debate Transcript</h2>
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
            <button type="button" className="btn small" onClick={() => setShowTranscript(true)}>
              View discussion
            </button>
          </div>
        </div>
        {groups.length === 0 && <p className="hint">The committee has not spoken yet, refreshing live...</p>}
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
      {job.directorAudit && <DirectorAuditCard audit={job.directorAudit} />}
      {job.executiveReview && <ExecutiveReviewCard review={job.executiveReview} />}
      {job.gapAnalysis && <GapAnalysisCard gapResult={job.gapAnalysis} job={job} onSaved={patch} />}
      {job.rewrittenResume && (
        <RewrittenResume
          resume={job.rewrittenResume}
          resumeJson={job.rewrittenResumeJson}
          meta={job.resumeMeta}
          jobId={job.id}
          onSaved={patch}
        />
      )}

      {job.status === "completed" && job.blueprint && (
        <ResumeAbSection jobId={job.id} job={job} onPatch={patch} v2Preview={abV2} />
      )}

      <ColdEmailPanel jobId={job.id} initialDraft={job.coldEmailDraft} />
      <CoverLetterPanel jobId={job.id} initialDraft={job.coverLetterDraft} />
      <InterviewMockPanel jobId={job.id} initialPlan={job.interviewPlan} />

      {showTranscript && (
        <TranscriptModal job={job} groups={groups} onClose={() => setShowTranscript(false)} />
      )}
    </div>
  );
}

/** Pop-up window showing the full committee discussion with download options. */
function TranscriptModal({
  job,
  groups,
  onClose,
}: {
  job: JobState;
  groups: { key: string; label: string; entries: TranscriptEntry[] }[];
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label="SME discussion window">
        <div className="modal-head">
          <div>
            <h2>SME discussion window</h2>
            <p className="hint mono">{job.id}</p>
          </div>
          <div className="modal-actions">
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
            <button type="button" className="btn small" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <div className="modal-body">
          {groups.length === 0 && <p className="hint">The committee has not spoken yet.</p>}
          {groups.map((group) => (
            <div key={group.key} className="round-group">
              <h3>{group.label}</h3>
              {group.entries.map((entry) => (
                <AgentCard key={entry.id} entry={entry} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status, connected }: { status: JobState["status"]; connected: boolean }) {
  const map: Record<JobState["status"], string> = {
    pending: "pending",
    debating: "debating",
    completed: "completed",
    failed: "failed",
    cancelled: "cancelled",
  };
  return (
    <span className={`tag status ${map[status]}`}>
      {connected ? "live" : ""} {status}
    </span>
  );
}

function RunMonitor({
  job,
  connected,
  onCancel,
  cancelling,
}: {
  job: JobState;
  connected: boolean;
  onCancel: () => void;
  cancelling: boolean;
}) {
  const steps = PHASE_STEPS;
  const current = currentPhase(job);
  const currentIdx = steps.findIndex((s) => s.key === current);
  const live = job.status === "pending" || job.status === "debating";
  return (
    <section className="panel run-monitor">
      <div className="run-monitor-head">
        <div>
          <h2>Run monitor</h2>
          <p className="hint">
            {connected ? "Live stream connected" : "Live stream disconnected"}
            {live ? "" : " Â· run finished"}
          </p>
        </div>
        {live && (
          <button className="btn danger" onClick={onCancel} disabled={cancelling}>
            {cancelling ? "Cancelling..." : "Kill run"}
          </button>
        )}
      </div>
      <ol className="phase-track">
        {steps.map((step, i) => (
          <li
            key={step.key}
            className={`phase-step ${i < currentIdx ? "done" : i === currentIdx ? "active" : ""}`}
          >
            <span className="phase-dot" />
            <span className="phase-label">{step.label}</span>
          </li>
        ))}
      </ol>
      {live && job.activity && (
        <p className="run-activity">
          <span className="live-dot" /> {job.activity}
        </p>
      )}
      <p className="run-progress hint">
        Seats analyzed: {job.analyses?.length ?? 0} Â· Transcript entries:{" "}
        {job.transcript.length}
      </p>
    </section>
  );
}

function JdMetaCard({ meta }: { meta: JdMeta }) {
  const rows: { label: string; value: string }[] = [
    { label: "Company", value: meta.company },
    { label: "Role", value: meta.role },
    { label: "Sector", value: meta.sector },
    { label: "Location", value: meta.location },
    { label: "Team", value: meta.team },
  ];
  return (
    <section className="panel jdmeta-card">
      <div className="panel-head">
        <h2>Job Description Metadata</h2>
        {meta.roleSlug && <span className="tag accent">role slug: {meta.roleSlug}</span>}
      </div>
      <div className="jdmeta-grid">
        {rows.map((row) => (
          <div key={row.label} className="jdmeta-item">
            <span className="jdmeta-label">{row.label}</span>
            <span className="jdmeta-value">{row.value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function JobDecompositionCard({ decomposition }: { decomposition: JobDecomposition }) {
  const metaRows: { label: string; value: string }[] = [];
  if (decomposition.level) metaRows.push({ label: "Level", value: decomposition.level });
  if (decomposition.seniorityExpectation)
    metaRows.push({ label: "Seniority expectation", value: decomposition.seniorityExpectation });
  const listRows: { label: string; items: string[] }[] = [
    { label: "Screening filters", items: decomposition.screeningFilters },
    { label: "Must-haves", items: decomposition.mustHave },
    { label: "Nice-to-haves", items: decomposition.niceToHave },
    { label: "Exact stack", items: decomposition.stackWords },
    { label: "Domain constraints", items: decomposition.domainConstraints },
  ];
  return (
    <section className="panel jdmeta-card">
      <div className="panel-head">
        <h2>Job Decomposition</h2>
        <span className="tag accent">role model shared by every seat</span>
      </div>
      {metaRows.length > 0 && (
        <div className="jdmeta-grid">
          {metaRows.map((row) => (
            <div key={row.label} className="jdmeta-item">
              <span className="jdmeta-label">{row.label}</span>
              <span className="jdmeta-value">{row.value}</span>
            </div>
          ))}
        </div>
      )}
      {listRows.map((row) =>
        row.items.length > 0 ? (
          <div key={row.label} className="jd-decomp-block">
            <p className="sme-subhead accent">{row.label}</p>
            <ul>
              {row.items.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null,
      )}
      {decomposition.businessProblems.length > 0 && (
        <div className="jd-decomp-block">
          <p className="sme-subhead accent">Company's stated problems</p>
          <ul>
            {decomposition.businessProblems.map((p, i) => (
              <li key={i}>
                {p.problem}
                {p.detail && <span className="hint"> Â· {p.detail}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {decomposition.businessContext && (
        <p className="sme-reason">
          <span className="tag accent">business context</span>{" "}
          <span className="hint">{decomposition.businessContext}</span>
        </p>
      )}
    </section>
  );
}

function SmePanel({ analyses, live }: { analyses: SmeAnalysis[]; live: boolean }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>SME Panel 360-degree Analysis</h2>
        {live && <span className="tag status debating">live</span>}
      </div>
      {analyses.length === 0 && (
        <p className="hint">
          Each seat scores the candidate across the role-specific factors, then commits to a
          forced HIRE or REJECT.
        </p>
      )}
      <div className="sme-grid">
        {analyses.map((analysis) => (
          <SeatCard key={analysis.seat} analysis={analysis} />
        ))}
      </div>
    </section>
  );
}

function SeatCard({ analysis }: { analysis: SmeAnalysis }) {
  const decisionTag = analysis.decision === "HIRE" ? "hire" : "reject";
  return (
    <div className="sme-seat">
      <div className="sme-seat-head">
        <div>
          <span className="agent-name">{analysis.seat}</span>
          <span className="agent-role">{analysis.role}</span>
        </div>
        <div className="sme-seat-tags">
          <span className={`tag ${fitClass(analysis.fitScore)}`}>
            fit {analysis.fitScore}/10
          </span>
          <span className={`tag ${decisionTag}`}>{analysis.decision}</span>
        </div>
      </div>
      <div className="sme-factor-list">
        {analysis.factors.map((factor) => (
          <FactorRow key={factor.factor} factor={factor} />
        ))}
      </div>
      <div className="sme-lists">
        <div>
          <p className="sme-subhead hire">Strengths</p>
          <ul>
            {(analysis.strengths ?? []).map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="sme-subhead reject">High-risk concerns</p>
          <ul>
            {(analysis.concerns ?? []).map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="sme-lists">
        <div>
          <p className="sme-subhead hire">Reasons to hire</p>
          <ul>
            {(analysis.hireReasons ?? []).map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="sme-subhead reject">Reasons not to hire</p>
          <ul>
            {(analysis.rejectReasons ?? []).map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
      {(analysis.missingSkills ?? []).length > 0 && (
        <div className="sme-aux">
          <p className="sme-subhead warn">Missing skills</p>
          <ul>
            {(analysis.missingSkills ?? []).map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}
      {(analysis.authenticityFlags ?? []).length > 0 && (
        <div className="sme-aux">
          <p className="sme-subhead warn">Authenticity flags</p>
          <ul>
            {(analysis.authenticityFlags ?? []).map((flag, i) => (
              <li key={i}>
                {flag.flag}{" "}
                <span className={`tag ${severityClass(flag.severity)}`}>{flag.severity}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {(analysis.credibilityFindings ?? []).length > 0 && (
        <div className="sme-aux">
          <p className="sme-subhead warn">Credibility findings</p>
          <ul>
            {(analysis.credibilityFindings ?? []).map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="sme-reason">
        <span className="tag warn">pivot: {analysis.pivotFactor}</span>{" "}
        <span className="hint">{analysis.decisionReason}</span>
      </p>
      {analysis.businessAssessment && (
        <p className="sme-reason">
          <span className="tag accent">business</span>{" "}
          <span className="hint">{analysis.businessAssessment}</span>
        </p>
      )}
    </div>
  );
}

function severityClass(severity: AuthenticityFlag["severity"]): string {
  if (severity === "high") return "reject";
  if (severity === "medium") return "warn";
  return "accent";
}

function FactorRow({ factor }: { factor: SmeFactorScore }) {
  const dots = [1, 2, 3, 4, 5];
  return (
    <div className="sme-factor">
      <span className="sme-factor-name">{factor.factor}</span>
      <span className="sme-factor-dots">
        {dots.map((dot) => (
          <span
            key={dot}
            className={`dot filled-${dot <= factor.score ? "yes" : "no"}`}
          />
        ))}
      </span>
      <span className="sme-factor-note">{factor.note}</span>
    </div>
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
      <div className="agent-text">
        {entry.text.split("\n").map((line, i) => (
          <Line key={i} text={line} />
        ))}
      </div>
    </div>
  );
}

/** Renders one transcript line, converting **bold** spans and keying `[MARKER]` lines. */
function Line({ text }: { text: string }) {
  const trimmed = text.trim();
  const marker = /^\[([A-Z_ ]+)\]/.exec(trimmed)?.[1];
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter((p) => p.length > 0);
  return (
    <div className={marker ? `line marker ${markerClass(marker)}` : "line"}>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i}>{part.slice(2, -2)}</strong>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </div>
  );
}

function markerClass(marker: string): string {
  if (marker.includes("POSITIVE")) return "pos";
  if (marker.includes("CONCERN") || marker.includes("RISK")) return "neg";
  if (marker.includes("VERDICT")) return "verdict";
  return "neutral";
}

/** Transparent view of every expert REJECT vote and its reasoning. */
function RejectionBreakdown({
  analyses,
  verdict,
}: {
  analyses: SmeAnalysis[];
  verdict: "SHORTLISTED" | "REJECTED" | undefined;
}) {
  const rejectSeats = analyses.filter((a) => a.decision === "REJECT");
  if (rejectSeats.length === 0) return null;
  const rejected = verdict === "REJECTED";
  return (
    <section className="panel reject-breakdown">
      <div className="panel-head">
        <h2>Why the experts pushed back</h2>
        <span className={`tag ${rejected ? "reject" : "warn"}`}>
          {rejected
            ? "profile rejected"
            : `${rejectSeats.length} of ${analyses.length} seats rejected`}
        </span>
      </div>
      <p className="hint">
        {rejected
          ? "Your profile was not shortlisted. Every expert REJECT vote is shown here, with the exact reasons, so you can address them."
          : "Even when the committee shortlists, experts vote against you on specific points. These are the exact reasons, ranked by severity."}
      </p>
      <div className="reject-seat-list">
        {rejectSeats.map((analysis) => (
          <div key={analysis.seat} className="reject-seat">
            <div className="reject-seat-head">
              <div>
                <span className="agent-name">{analysis.seat}</span>
                <span className="agent-role">{analysis.role}</span>
              </div>
              <span className={`tag ${fitClass(analysis.fitScore)}`}>
                fit {analysis.fitScore}/10
              </span>
            </div>
            {(analysis.rejectReasons ?? []).length > 0 && (
              <ul className="reject-reasons">
                {(analysis.rejectReasons ?? []).map((reason, i) => (
                  <li key={i}>{reason}</li>
                ))}
              </ul>
            )}
            {(analysis.concerns ?? []).length > 0 && (
              <p className="sme-reason">
                <span className="tag warn">concerns</span>{" "}
                <span className="hint">{(analysis.concerns ?? []).join(" Â· ")}</span>
              </p>
            )}
            <p className="sme-reason">
              <span className="tag warn">pivot: {analysis.pivotFactor}</span>{" "}
              <span className="hint">{analysis.decisionReason}</span>
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function VerdictCard({
  verdict,
  tallies,
  ballot,
}: {
  verdict: "SHORTLISTED" | "REJECTED";
  tallies: Record<string, number> | null;
  ballot?: Record<string, string>;
}) {
  const shortlisted = verdict === "SHORTLISTED";
  return (
    <section className={`verdict-card ${shortlisted ? "shortlisted" : "rejected"}`}>
      <h2>{shortlisted ? "SHORTLISTED" : "REJECTED"}</h2>
      <p className="hint">Weighted committee consensus, neutral outcomes are impossible by design.</p>
      {tallies && (
        <div className="tallies">
          <div className="tally">
            <span className="tag hire">HIRE</span>{" "}
            <strong>{(tallies.HIRE ?? 0).toFixed(1)}</strong>
          </div>
          <div className="tally">
            <span className="tag reject">REJECT</span>{" "}
            <strong>{(tallies.REJECT ?? 0).toFixed(1)}</strong>
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
  const missingSkills = (blueprint.missingSkillsRanked ?? []).map(
    (m) => `${m.skill} (${m.severity})`,
  );
  const sections: { title: string; items: string[]; accent: string }[] = [
    { title: "Objections Raised", items: blueprint.objections, accent: "reject" },
    { title: "Strengths Agreed", items: blueprint.strengths, accent: "hire" },
    { title: "Required Resume Changes", items: blueprint.requiredChanges, accent: "accent" },
    { title: "Sector Specialist Notes", items: blueprint.sectorNotes, accent: "sector" },
    { title: "Deciding Pivot Factors", items: blueprint.pivotFactors, accent: "warn" },
    { title: "Missing Skills (ranked)", items: missingSkills, accent: "warn" },
    { title: "Credibility Findings", items: blueprint.credibilityFindings ?? [], accent: "reject" },
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
      {(blueprint.requirementMap ?? []).length > 0 && (
        <div className="requirement-map">
          <h3>
            <span className="tag accent">Requirement Map</span>
          </h3>
          <div className="requirement-map-row head">
            <span>Requirement</span>
            <span>Evidence</span>
            <span>Status</span>
            <span>Action</span>
          </div>
          {(blueprint.requirementMap ?? []).map((row, i) => (
            <div className="requirement-map-row" key={i}>
              <span>{row.requirement}</span>
              <span>{row.evidence}</span>
              <span className={`tag ${reqStatusClass(row.status)}`}>{row.status}</span>
              <span>{row.action}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function reqStatusClass(status: string): string {
  if (status === "proven") return "hire";
  if (status === "partial") return "warn";
  if (status === "missing") return "reject";
  return "accent";
}

function DirectorAuditCard({ audit }: { audit: DirectorAudit }) {
  const verdictClass = audit.fair ? "hire" : "reject";
  return (
    <section className="panel exec-card">
      <div className="panel-head">
        <h2>Director Audit</h2>
        <span className={`tag ${verdictClass}`}>{audit.fair ? "Fair" : "Unfair"}</span>
        {audit.revoteFactor && <span className="tag warn">re-ballot on {audit.revoteFactor}</span>}
      </div>
      <p className="sme-reason">
        <span className="tag warn">fairness check</span>{" "}
        <span className="hint">
          The Director audits the debate, not the candidate. A flagged factor can
          force one targeted re-ballot; the committee's verdict is never overridden.
        </span>
      </p>
      <div className="sme-aux">
        <p className="sme-subhead warn">Fairness checklist</p>
        <ul>
          {audit.items.map((item, i) => (
            <li key={i}>
              <span className={`tag ${item.passed ? "hire" : "reject"}`}>
                {item.passed ? "PASS" : "FAIL"}
              </span>{" "}
              <strong>{item.factor}</strong>{" "}
              {item.note && <span className="hint">{item.note}</span>}
            </li>
          ))}
        </ul>
      </div>
      {audit.needsHumanReview && (
        <p className="sme-reason">
          <span className="tag reject">human review recommended</span>{" "}
          <span className="hint">Extreme unresolved inconsistency for a hiring manager.</span>
        </p>
      )}
    </section>
  );
}

function ExecutiveReviewCard({ review }: { review: ExecutiveReview }) {
  const opinionClass =
    review.opinion === "FAVORABLE"
      ? "hire"
      : review.opinion === "UNFAVORABLE"
        ? "reject"
        : "warn";
  const personaRole = review.company
    ? `${review.persona} at ${review.company}`
    : review.persona;
  return (
    <section className="panel exec-card">
      <div className="panel-head">
        <h2>Executive Review</h2>
        <span className="tag accent">{personaRole}</span>
      </div>
      <div className="exec-scores">
        <ScoreRow label="Debate relevance" score={review.debateRelevance} />
        <ScoreRow label="Role alignment" score={review.roleAlignment} />
        <ScoreRow label="Growth alignment" score={review.growthAlignment} />
      </div>
      <p className="sme-reason">
        <span className="tag warn">advisory</span>{" "}
        <span className="hint">Opinion only, never overrides the committee verdict.</span>
      </p>
      {review.requirementAssessment && (
        <p className="hint">{review.requirementAssessment}</p>
      )}
      {(review.conditionsToHire ?? []).length > 0 && (
        <div className="sme-aux">
          <p className="sme-subhead warn">Conditions to hire</p>
          <ul>
            {(review.conditionsToHire ?? []).map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="sme-reason">
        <span className={`tag ${opinionClass}`}>{review.opinion}</span>{" "}
        <span className="hint">{review.opinionReason}</span>
      </p>
      {review.summary && <p className="hint">{review.summary}</p>}
    </section>
  );
}

function ScoreRow({ label, score }: { label: string; score: ExecutiveScore }) {
  return (
    <div className="exec-score">
      <span className="sme-factor-name">{label}</span>
      <span className={`tag ${fitClass(score.score)}`}>{score.score}/10</span>
      <span className="hint">{score.note}</span>
    </div>
  );
}

type ResumeTab = "markdown" | "json";

function ExportBar({
  resumeJson,
  onError,
  roleLabel,
}: {
  resumeJson: string;
  onError: (message: string | null) => void;
  roleLabel?: string;
}) {
  const [format, setFormat] = useState<ResumeExportFormat>(DEFAULT_EXPORT_OPTIONS.format);
  const [preset, setPreset] = useState<ResumeExportPreset>(DEFAULT_EXPORT_OPTIONS.preset);
  const [page, setPage] = useState<ResumePageFormat>(DEFAULT_EXPORT_OPTIONS.page);
  const [busy, setBusy] = useState(false);

  const options: ResumeExportOptions = {
    format,
    preset,
    page,
    excludedSections: DEFAULT_EXPORT_OPTIONS.excludedSections,
  };

  const download = async (kind: ResumeDownloadKind) => {
    if (!resumeJson.trim()) return;
    setBusy(true);
    onError(null);
    try {
      await downloadResume(resumeJson, options, kind, roleLabel);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="export-bar">
      <div className="export-controls">
        <label>
          Format
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as ResumeExportFormat)}
          >
            {Object.entries(EXPORT_FORMAT_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Layout
          <select
            value={preset}
            onChange={(e) => setPreset(e.target.value as ResumeExportPreset)}
          >
            {Object.entries(EXPORT_PRESET_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Page
          <select value={page} onChange={(e) => setPage(e.target.value as ResumePageFormat)}>
            {Object.entries(PAGE_FORMAT_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="export-actions">
        <button
          type="button"
          className="btn small"
          disabled={busy}
          onClick={() => void download("pdf")}
        >
          PDF
        </button>
        <button
          type="button"
          className="btn small"
          disabled={busy}
          onClick={() => void download("docx")}
        >
          DOCX
        </button>
        <button
          type="button"
          className="btn small"
          disabled={busy}
          onClick={() => void download("md")}
        >
          MD
        </button>
        <button
          type="button"
          className="btn small"
          disabled={busy}
          onClick={() => void download("json")}
        >
          JSON
        </button>
        <button
          type="button"
          className="btn small"
          disabled={busy}
          onClick={() => void download("txt")}
        >
          TXT
        </button>
      </div>
    </div>
  );
}

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
  const html = useMemo(
    () => sanitizeMarkdownHtml(marked.parse(resume, { async: false }) as string),
    [resume],
  );
  const [tab, setTab] = useState<ResumeTab>("markdown");
  const [draft, setDraft] = useState<string>(resumeJson ?? "");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

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
        <h2>Generated Resume</h2>
      </div>
      {meta && <ResumeMetaBadge meta={meta} />}

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
          JSON {resumeJson ? "Â· edit" : ""}
        </button>
      </div>

      {resumeJson && (
        <div className="export-row">
          <ExportBar
            resumeJson={draft}
            onError={setExportError}
            roleLabel={meta?.roleLabel}
          />
          {exportError && <p className="hint error-hint">{exportError}</p>}
        </div>
      )}

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
    <div>
      <div className="resume-meta">
        <span className="tag accent">role: {meta.roleLabel}</span>
        <span
          className={`tag ${meta.atsScore >= 60 ? "hire" : "warn"}`}
          title={meta.atsScoreNote}
        >
          keyword overlap {meta.atsScore}%
        </span>
        <span className={`tag ${meta.moderationApproved ? "hire" : "reject"}`}>
          auditor {meta.moderationScore}/100
        </span>
        <span className="tag">{meta.iterations > 1 ? `${meta.iterations} passes` : "1 pass"}</span>
        {meta.locale && <span className="tag">English: {meta.locale.toUpperCase()}</span>}
        {meta.screeningCoverage && (
          <span className="tag">
            screening floor {meta.screeningCoverage.matched}/{meta.screeningCoverage.total}
          </span>
        )}
        {meta.atsScoreNote && <span className="hint">{meta.atsScoreNote}</span>}
      </div>
      <ModeratorFeedback meta={meta} />
    </div>
  );
}

export default function DebateView(props: Props) {
  return (
    <ErrorBoundary>
      <DebateViewInner {...props} />
    </ErrorBoundary>
  );
}

/** A/B review: second expert pass, side-by-side comparison, user pick (design plan R2). */
function ResumeAbSection({
  jobId,
  job,
  onPatch,
  v2Preview,
}: {
  jobId: string;
  job: JobState;
  onPatch: (patch: Partial<JobState>) => void;
  v2Preview: { markdown: string; templateJson: string } | null;
}) {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ResumeVersionsResponse | null>(null);
  const [picking, setPicking] = useState<1 | 2 | null>(null);
  const [showV2, setShowV2] = useState(false);

  const phase = job.abPhase;
  const inFlight = phase !== undefined && phase !== "done";
  const comparison = job.comparison ?? data?.comparison ?? null;
  const selectedVersion = job.selectedVersion ?? data?.selectedVersion ?? null;

  useEffect(() => {
    if (!inFlight && (phase === "done" || job.comparison)) {
      let alive = true;
      getResumeVersions(jobId)
        .then((d) => {
          if (alive) setData(d);
        })
        .catch(() => {});
      return () => {
        alive = false;
      };
    }
  }, [jobId, phase, job.comparison, inFlight]);

  async function start() {
    setStarting(true);
    setError(null);
    try {
      const res = await startResumeAb(jobId);
      onPatch({ abPhase: res.abPhase as JobState["abPhase"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStarting(false);
    }
  }

  async function pick(version: 1 | 2) {
    setPicking(version);
    setError(null);
    try {
      const updated = await selectResumeVersion(jobId, version);
      onPatch({
        rewrittenResume: updated.rewrittenResume,
        rewrittenResumeJson: updated.rewrittenResumeJson,
        resumeMeta: updated.resumeMeta,
        selectedVersion: updated.selectedVersion,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPicking(null);
    }
  }

  const phaseLabels: Record<string, string> = {
    v1: "writing version 1",
    eval1: "reviewing version 1",
    v2: "writing version 2",
    eval2: "reviewing version 2",
    comparison: "comparing versions",
  };

  const versions = data?.versions ?? [];
  const v2Markdown =
    v2Preview?.markdown ?? versions.find((v) => v.version === 2)?.markdown;
  const v2Issues = (() => {
    const raw = versions.find((v) => v.version === 2)?.evaluationJson;
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as {
        issues?: Array<{ severity: string; section: string; finding: string }>;
      };
      return parsed.issues ?? null;
    } catch {
      return null;
    }
  })();

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Resume A/B review</h2>
        {selectedVersion && <span className="tag">v{selectedVersion} selected</span>}
      </div>
      <div className="panel-body">
        {!phase && !comparison && (
          <>
            <p className="hint">
              A second expert pass rewrites the current resume, both versions are scored
              against the same job description by a three-reviewer panel, and you pick
              the winner. Runs about seven model calls.
            </p>
            <button type="button" className="btn" onClick={() => void start()} disabled={starting}>
              {starting ? "Starting..." : "Run A/B review"}
            </button>
          </>
        )}
        {inFlight && (
          <p className="hint">A/B review in progress: {phaseLabels[phase] ?? phase}...</p>
        )}
        {error && <div className="error-banner">{error}</div>}
        {comparison && (
          <div className="ab-comparison">
            <div className="ab-totals">
              <div className="ab-total">
                <span className="tag">Version 1</span> <strong>{comparison.v1Total}</strong>
                {selectedVersion === 1 && <span className="hint"> (in use)</span>}
              </div>
              <div className="ab-total">
                <span className="tag">Version 2</span> <strong>{comparison.v2Total}</strong>
                {selectedVersion === 2 && <span className="hint"> (in use)</span>}
              </div>
              <div className="ab-total">
                <span className="tag">Recommendation</span>{" "}
                <strong>{comparison.recommendation}</strong>
              </div>
            </div>
            <p className="hint">{comparison.rationale}</p>
            <div className="ab-deltas">
              {Object.entries(comparison.dimensionDeltas).map(([dim, delta]) => (
                <span key={dim} className="hint">
                  {dim}: {delta > 0 ? `+${delta}` : delta}{" "}
                </span>
              ))}
            </div>
            <div className="form-actions">
              <button
                type="button"
                className="btn"
                onClick={() => void pick(2)}
                disabled={picking !== null || selectedVersion === 2}
              >
                {picking === 2 ? "Switching..." : "Use version 2"}
              </button>
              <button
                type="button"
                className="btn secondary"
                onClick={() => void pick(1)}
                disabled={picking !== null || selectedVersion === 1}
              >
                {picking === 1 ? "Switching..." : "Use version 1"}
              </button>
            </div>
            {v2Markdown && (
              <>
                <button
                  type="button"
                  className="btn secondary small"
                  onClick={() => setShowV2((v) => !v)}
                  aria-expanded={showV2}
                >
                  {showV2 ? "Hide version 2" : "Show version 2"}
                </button>
                {showV2 && (
                  <pre className="ce-body" style={{ marginTop: "0.5rem" }}>
                    {v2Markdown}
                  </pre>
                )}
              </>
            )}
            {v2Issues && v2Issues.length > 0 && (
              <div className="ab-issues">
                {v2Issues.map((issue, i) => (
                  <p key={i} className="hint">
                    <strong>
                      [{issue.severity}] {issue.section}:
                    </strong>{" "}
                    {issue.finding}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

