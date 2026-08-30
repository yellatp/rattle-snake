import { useEffect, useState } from "react";
import type { InterviewPrepPlan } from "@rattlesnake/shared";
import { generateInterviewMock } from "../lib/api";

/**
 * Per-application interview mock. Applies the same committee used for the
 * debate (recruiter through principal seats) to interview prep: the typical
 * phases for the role, what each expert expects, how they will drill the
 * candidate from the JD, and how a typical interview will go.
 */
export default function InterviewMockPanel({
  jobId,
  initialPlan,
}: {
  jobId: string;
  initialPlan?: InterviewPrepPlan | null;
}) {
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [plan, setPlan] = useState<InterviewPrepPlan | null>(initialPlan ?? null);
  const [error, setError] = useState<string | null>(null);

  // Adopt a plan produced by a chained run (arrives after the panel mounts).
  useEffect(() => {
    if (initialPlan) setPlan(initialPlan);
  }, [initialPlan]);

  async function generate() {
    setGenerating(true);
    setError(null);
    setPlan(null);
    try {
      const next = await generateInterviewMock(jobId);
      setPlan(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <button
          type="button"
          className="panel-toggle"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <span>Interview mock</span>
          <span className="hint">{open ? "hide" : "expand"}</span>
        </button>
      </div>
      {open && (
        <div className="panel-body">
          <div className="form-actions">
            <button
              type="button"
              className="btn"
              onClick={() => void generate()}
              disabled={generating}
            >
              {generating ? "Building plan..." : "Build interview mock"}
            </button>
          </div>

          {error && <div className="error-banner">{error}</div>}

          {plan && (
            <div className="interview-plan">
              <h3>{plan.roleLabel}</h3>
              <p className="hint">{plan.summary}</p>

              <h4>Typical interview pipeline</h4>
              <ol className="phase-list">
                {plan.pipeline.map((phase, i) => (
                  <li key={i} className="phase-item">
                    <div className="phase-head">
                      <strong>{phase.name}</strong>
                      <span className="hint">
                        {phase.duration} · {phase.format}
                      </span>
                    </div>
                    <p>{phase.focus}</p>
                    {phase.typicalQuestions.length > 0 && (
                      <ul>
                        {phase.typicalQuestions.map((q, j) => (
                          <li key={j}>{q}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>

              <h4>How each expert will drill you</h4>
              <div className="expert-list">
                {plan.experts.map((expert, i) => (
                  <details key={i} className="expert-card" open={i === 0}>
                    <summary>
                      <span className="agent-name">{expert.seat}</span>{" "}
                      <span className="agent-role">{expert.role}</span>
                    </summary>
                    <p className="hint">{expert.lens}</p>
                    <p className="subhead">They expect</p>
                    <ul>
                      {expert.expectations.map((item, j) => (
                        <li key={j}>{item}</li>
                      ))}
                    </ul>
                    <p className="subhead">How they drill you</p>
                    <ul>
                      {expert.drillQuestions.map((q, j) => (
                        <li key={j}>{q}</li>
                      ))}
                    </ul>
                    <p className="subhead">Red flags</p>
                    <ul>
                      {expert.redFlags.map((item, j) => (
                        <li key={j}>{item}</li>
                      ))}
                    </ul>
                  </details>
                ))}
              </div>

              <h4>Knowledge checklist</h4>
              <div className="tag-cloud">
                {plan.topics.map((topic, i) => (
                  <span key={i} className="tag accent">
                    {topic}
                  </span>
                ))}
              </div>

              <h4>Prep tips</h4>
              <ol>
                {plan.prepTips.map((tip, i) => (
                  <li key={i}>{tip}</li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
