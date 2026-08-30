import { useState } from "react";
import type { GapAnalysisResult, EnhancementSuggestion, JobState } from "@rattlesnake/shared";
import { updateJobAmendmentNotes } from "../lib/api";

interface Props {
  gapResult: GapAnalysisResult;
  job: JobState;
  onSaved: (patch: Partial<JobState>) => void;
}

function readinessClass(r: string): string {
  if (r === "Strong Match") return "hire";
  if (r === "Partial Match") return "warn";
  return "reject";
}

function impactClass(i: string): string {
  if (i === "High") return "reject";
  if (i === "Medium") return "warn";
  return "hire";
}

function riskClass(r: string): string {
  if (r === "High") return "reject";
  if (r === "Medium") return "warn";
  return "hire";
}

function severityClass(s: string): string {
  if (s === "High") return "reject";
  if (s === "Medium") return "warn";
  return "hire";
}

export default function GapAnalysisCard({ gapResult, job, onSaved }: Props) {
  const { gapAnalysis, suggestions, priorityActions } = gapResult;
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Gap Analysis &amp; Enhancement Suggestions</h2>
        <span className={`tag ${readinessClass(gapAnalysis.overallReadiness)}`}>
          {gapAnalysis.overallReadiness}
        </span>
      </div>
      <p className="hint">{gapAnalysis.summary}</p>

      {gapAnalysis.strongMatches.length > 0 && (
        <GapSection title="Strong Matches" count={gapAnalysis.strongMatches.length}>
          {gapAnalysis.strongMatches.map((m, i) => (
            <div key={i} className="gap-item gap-strong">
              <span className="tag hire">proven</span>
              <strong>{m.item}</strong>
              <span className="hint">{m.notes}</span>
            </div>
          ))}
        </GapSection>
      )}

      {gapAnalysis.mustHaveGaps.length > 0 && (
        <GapSection title="Must-Have Gaps" count={gapAnalysis.mustHaveGaps.length}>
          {gapAnalysis.mustHaveGaps.map((g, i) => (
            <div key={i} className="gap-item gap-must">
              <span className={`tag ${impactClass(g.impact)}`}>{g.impact}</span>
              <span className={`tag ${severityClass(g.evidenceStatus)}`}>{g.evidenceStatus}</span>
              <strong>{g.item}</strong>
              <span className="hint">{g.notes}</span>
            </div>
          ))}
        </GapSection>
      )}

      {gapAnalysis.niceToHaveGaps.length > 0 && (
        <GapSection title="Nice-to-Have Gaps" count={gapAnalysis.niceToHaveGaps.length}>
          {gapAnalysis.niceToHaveGaps.map((g, i) => (
            <div key={i} className="gap-item gap-nice">
              <span className="tag hire">{g.evidenceStatus}</span>
              <strong>{g.item}</strong>
              {g.transferableFrom && (
                <span className="hint">Transferable from: {g.transferableFrom}</span>
              )}
              <span className="hint">{g.notes}</span>
            </div>
          ))}
        </GapSection>
      )}

      {gapAnalysis.inflatedClaims.length > 0 && (
        <GapSection title="Inflated Claims" count={gapAnalysis.inflatedClaims.length}>
          {gapAnalysis.inflatedClaims.map((c, i) => (
            <div key={i} className="gap-item gap-inflated">
              <span className={`tag ${severityClass(c.severity)}`}>{c.severity}</span>
              <strong>{c.claim}</strong>
              <span className="hint">{c.panelNote}</span>
            </div>
          ))}
        </GapSection>
      )}

      {suggestions.length > 0 && (
        <GapSection title="Enhancement Suggestions" count={suggestions.length}>
          {suggestions.map((s) => (
            <SuggestionCard key={s.id} suggestion={s} />
          ))}
        </GapSection>
      )}

      {priorityActions.length > 0 && (
        <div className="sme-aux">
          <p className="sme-subhead">Priority Actions</p>
          <ol>
            {priorityActions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ol>
        </div>
      )}

      <AmendmentNotes job={job} onSaved={onSaved} />
    </section>
  );
}

function GapSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="sme-aux">
      <p className="sme-subhead">
        {title} <span className="tag">{count}</span>
      </p>
      <div className="gap-list">{children}</div>
    </div>
  );
}

function SuggestionCard({ suggestion }: { suggestion: EnhancementSuggestion }) {
  return (
    <div className="gap-item gap-suggestion">
      <div className="gap-suggestion-header">
        <span className="tag">{suggestion.category}</span>
        <span className={`tag ${riskClass(suggestion.risk)}`}>Risk: {suggestion.risk}</span>
        <span className="tag">{suggestion.targetSection}</span>
      </div>
      <p><strong>Suggestion:</strong> {suggestion.suggestion}</p>
      <p className="hint"><strong>Justification:</strong> {suggestion.justification}</p>
      <p className="hint"><strong>Proposed change:</strong> {suggestion.proposedChange}</p>
      <p className="hint"><strong>JD theme:</strong> {suggestion.jdThemeAddressed}</p>
    </div>
  );
}

function AmendmentNotes({
  job,
  onSaved,
}: {
  job: JobState;
  onSaved: (patch: Partial<JobState>) => void;
}) {
  const [notes, setNotes] = useState(job.amendmentNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updateJobAmendmentNotes(job.id, notes);
      onSaved({ amendmentNotes: notes });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="sme-aux">
      <p className="sme-subhead">Amendment Notes</p>
      <p className="hint">
        Add instructions for how you want the resume to address the gaps above.
        You can add skills, work experience, or reframing directions.
      </p>
      <textarea
        className="resume-json-editor"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="e.g., Add my experience with Kafka from the RetailWorks project. Reframe the TravelBuddy role as real-time data pipeline work."
        rows={4}
      />
      <div className="resume-editor-actions" style={{ marginTop: "0.5rem" }}>
        <button className="btn" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Notes"}
        </button>
        {saved && !error && <span className="hint">Notes saved.</span>}
      </div>
      {error && <div className="error-banner">{error}</div>}
    </div>
  );
}
