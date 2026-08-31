import { useEffect, useState } from "react";
import ErrorBoundary from "./ErrorBoundary";
import {
  deleteJob,
  getJob,
  listStorage,
  type StorageGroup,
  type StorageProfile,
  type StorageRun,
  type StorageResponse,
} from "../lib/api";
import {
  downloadCoverLetter,
  downloadInterviewPlan,
  downloadText,
  downloadTranscript,
} from "../lib/export";

type ArtifactKind = "discussion" | "resume" | "coverletter" | "interview";
type FileKind = "md" | "json" | "txt" | "html";

interface ArtifactSpec {
  artifact: ArtifactKind;
  label: string;
  tab: string;
  formats: FileKind[];
}

function artifactsFor(run: StorageRun): ArtifactSpec[] {
  const specs: ArtifactSpec[] = [
    { artifact: "discussion", label: "Expert discussion", tab: "discussion", formats: ["md", "html", "json", "txt"] },
  ];
  if (run.hasResume) {
    specs.push({ artifact: "resume", label: "Resume", tab: "resume", formats: ["md", "json"] });
  }
  if (run.hasCoverLetter) {
    specs.push({ artifact: "coverletter", label: "Cover letter", tab: "coverletter", formats: ["md", "json", "txt"] });
  }
  if (run.hasInterview) {
    specs.push({ artifact: "interview", label: "Interview prep", tab: "interview", formats: ["md", "json", "txt"] });
  }
  return specs;
}

function RunRow({ jobId, run, onDeleted }: { jobId: string; run: StorageRun; onDeleted: () => void }) {
  const [deleting, setDeleting] = useState(false);
  const [preparing, setPreparing] = useState<string | null>(null);

  async function handleDelete() {
    if (!window.confirm("Delete this run and all its files? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await deleteJob(jobId);
      onDeleted();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
      setDeleting(false);
    }
  }

  async function downloadArtifact(artifact: ArtifactKind, kind: FileKind) {
    const key = `${artifact}-${kind}`;
    if (preparing) return;
    setPreparing(key);
    try {
      const job = await getJob(jobId);
      if (artifact === "discussion") {
        downloadTranscript(job, kind);
      } else if (artifact === "coverletter" && kind !== "html") {
        downloadCoverLetter(job, kind as "md" | "json" | "txt");
      } else if (artifact === "interview" && kind !== "html") {
        downloadInterviewPlan(job, kind as "md" | "json" | "txt");
      } else if (kind === "md" && job.rewrittenResume) {
        downloadText(job.rewrittenResume, `${job.id}-resume.md`);
      } else if (kind === "json" && job.rewrittenResumeJson) {
        downloadText(job.rewrittenResumeJson, `${job.id}-resume.json`);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setPreparing(null);
    }
  }

  return (
    <div className="storage-run">
      <div className="storage-run-top">
        <div className="storage-run-main">
          <a href={`/storage/${jobId}?tab=discussion`} className="mono storage-run-id">
            {run.jobId.slice(0, 12)}
          </a>
          <div className="storage-run-tags">
            <span className={`tag status ${run.status}`}>{run.status}</span>
            {run.verdict && (
              <span className={`tag ${run.verdict === "SHORTLISTED" ? "hire" : "reject"}`}>
                {run.verdict}
              </span>
            )}
            <span className="tag">{run.transcriptLength} entries</span>
          </div>
        </div>
        <div className="storage-run-actions">
          <button type="button" className="btn small danger" onClick={handleDelete} disabled={deleting}>
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
      <div className="storage-run-files">
        {artifactsFor(run).map((spec) => (
          <div className="storage-file" key={spec.artifact}>
            <span className="storage-file-label">{spec.label}</span>
            <a className="btn small subtle" href={`/storage/${jobId}?tab=${spec.tab}`}>
              View
            </a>
            {spec.formats.map((format) => (
              <button
                key={format}
                type="button"
                className="btn small subtle"
                onClick={() => downloadArtifact(spec.artifact, format)}
                disabled={preparing !== null}
              >
                {preparing === `${spec.artifact}-${format}` ? "..." : format.toUpperCase()}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function GroupCard({ group, onDeleted }: { group: StorageGroup; onDeleted: () => void }) {
  return (
    <div className="panel storage-group">
      <div className="storage-group-head">
        <h3>
          {group.role}
          <span className="tag accent">{group.company}</span>
        </h3>
        <span className="hint">{group.runs.length} run{group.runs.length === 1 ? "" : "s"}</span>
      </div>
      {group.runs.map((run) => (
        <RunRow key={run.jobId} jobId={run.jobId} run={run} onDeleted={onDeleted} />
      ))}
    </div>
  );
}

function ProfileSection({ entry, onDeleted }: { entry: StorageProfile; onDeleted: () => void }) {
  return (
    <section className="storage-profile">
      <header className="storage-profile-head">
        <h2>
          {entry.profile.name}
          {entry.profile.isMaster && <span className="tag">master</span>}
        </h2>
        <p className="hint">{entry.profile.id}</p>
      </header>
      <div className="storage-group-list">
        {entry.groups.map((group) => (
          <GroupCard key={`${group.company}/${group.role}`} group={group} onDeleted={onDeleted} />
        ))}
      </div>
    </section>
  );
}

function StorageViewInner() {
  const [data, setData] = useState<StorageResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      setData(await listStorage());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  if (error) return <div className="error-banner">Failed to load storage: {error}</div>;
  if (!data) return <p className="hint">Loading saved results...</p>;

  const totalGroups = data.profiles.reduce((sum, p) => sum + p.groups.length, 0);
  const hasAnything = totalGroups > 0 || data.unassigned.length > 0;

  if (!hasAnything) {
    return (
      <p className="hint">
        Nothing stored yet. Finished runs are grouped here by profile, company, and role,
        with every artifact (discussion, resume, cover letter, interview prep) in one place.
      </p>
    );
  }

  return (
    <div className="storage-view">
      {data.profiles.map((entry) => (
        <ProfileSection key={entry.profile.id} entry={entry} onDeleted={refresh} />
      ))}

      {data.unassigned.length > 0 && (
        <section className="storage-profile">
          <header className="storage-profile-head">
            <h2>Unassigned runs</h2>
            <p className="hint">Runs created without a profile</p>
          </header>
          <div className="storage-group-list">
            {data.unassigned.map((group) => (
              <GroupCard key={`${group.company}/${group.role}`} group={group} onDeleted={refresh} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default function StorageView() {
  return (
    <ErrorBoundary>
      <StorageViewInner />
    </ErrorBoundary>
  );
}
