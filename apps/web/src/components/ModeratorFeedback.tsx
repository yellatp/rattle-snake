import type { ResumeMeta } from "@rattlesnake/shared";

/** Visible block showing the resume auditor's full feedback, when present. */
export default function ModeratorFeedback({ meta }: { meta: ResumeMeta }) {
  const moderator = meta.moderator;
  if (!moderator) return null;
  return (
    <div className="moderator-feedback">
      <p className="moderator-verdict">
        <span className={`tag ${moderator.approved ? "hire" : "reject"}`}>
          resume auditor {moderator.score}/100
        </span>{" "}
        <strong>{moderator.summaryVerdict}</strong>
      </p>
      {moderator.bannedPhrases.length > 0 && (
        <p className="hint">
          Banned phrases detected: {moderator.bannedPhrases.join(", ")}
        </p>
      )}
      {moderator.issues.length > 0 && (
        <div className="moderator-list">
          <p className="sme-subhead reject">Issues found</p>
          <ul>
            {moderator.issues.map((issue, i) => (
              <li key={i}>{issue}</li>
            ))}
          </ul>
        </div>
      )}
      {moderator.suggestions.length > 0 && (
        <div className="moderator-list">
          <p className="sme-subhead accent">Auditor suggestions</p>
          <ul>
            {moderator.suggestions.map((suggestion, i) => (
              <li key={i}>{suggestion}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
