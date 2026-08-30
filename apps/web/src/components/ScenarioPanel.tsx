import { useEffect, useMemo, useState } from "react";
import { scenarioQuestionsFor } from "../lib/scenarioQuestions";

interface Props {
  domain: string;
  roleSlug?: string;
}

const PAGE = 3;

export default function ScenarioPanel({ domain, roleSlug }: Props) {
  const all = useMemo(() => scenarioQuestionsFor(domain, roleSlug), [domain, roleSlug]);
  const [start, setStart] = useState(0);

  useEffect(() => {
    setStart(0);
  }, [domain, roleSlug]);

  const shown = Array.from({ length: PAGE }, (_, i) => all[(start + i) % all.length]);

  return (
    <section className="panel scenario-panel">
      <div className="panel-head">
        <h2>While the committee debates</h2>
        <span className="tag accent">scenario practice</span>
      </div>
      <p className="hint">
        Senior-level, production-first scenarios. No trivia. See if you can talk through them
        before the verdict lands.
      </p>
      <ol className="scenario-list">
        {shown.map((q) => (
          <li key={q.id} className="scenario-item">
            <p className="scenario-prompt">{q.prompt}</p>
            <p className="scenario-hint">
              <span className="tag warn">think about</span> {q.hint}
            </p>
          </li>
        ))}
      </ol>
      <button className="btn subtle" onClick={() => setStart((s) => s + 1)}>
        Get a new set
      </button>
    </section>
  );
}
