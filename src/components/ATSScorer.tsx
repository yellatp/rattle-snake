import { useMemo } from 'react';
import { scoreResume, resumeToText, type ATSScoreResult } from '../lib/ats/scorer';

interface Props {
  resumeContent: string;
  jobDescription: string;
  templateKeywords?: string[];
  onAddKeyword?: (keyword: string) => void;
}

function ScoreRing({ score }: { score: number }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const color = score >= 75 ? '#16a34a' : score >= 50 ? '#d97706' : '#dc2626';

  return (
    <div className="relative w-24 h-24 flex items-center justify-center">
      <svg width="96" height="96" className="-rotate-90">
        <circle cx="48" cy="48" r={radius} fill="none" stroke="#1e293b" strokeWidth="8" />
        <circle
          cx="48" cy="48" r={radius} fill="none"
          stroke={color} strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="score-ring transition-all duration-1000"
        />
      </svg>
      <div className="absolute text-center">
        <div className="text-2xl font-bold text-slate-100">{score}</div>
        <div className="text-[10px] text-slate-500">ATS</div>
      </div>
    </div>
  );
}

export default function ATSScorer({ resumeContent, jobDescription, templateKeywords = [], onAddKeyword }: Props) {
  const result: ATSScoreResult | null = useMemo(() => {
    if (!resumeContent || !jobDescription) return null;
    const text = resumeToText(resumeContent);
    return scoreResume(text, jobDescription, templateKeywords);
  }, [resumeContent, jobDescription, templateKeywords]);

  if (!result) {
    return (
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
        <h3 className="font-medium text-slate-400 text-sm">ATS Score</h3>
        <p className="text-xs text-slate-600 mt-2">Enter a job description to see your ATS match score.</p>
      </div>
    );
  }

  const scoreColor = result.score >= 75 ? 'text-green-400' : result.score >= 50 ? 'text-amber-400' : 'text-red-400';
  const scoreBg = result.score >= 75 ? 'bg-green-900/20 border-green-800/40' : result.score >= 50 ? 'bg-amber-900/20 border-amber-800/40' : 'bg-red-900/20 border-red-800/40';

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-100">ATS Score</h3>
        <span className={`text-xs px-2 py-0.5 rounded-full border ${scoreBg} ${scoreColor}`}>
          {result.score >= 75 ? 'Strong Match' : result.score >= 50 ? 'Partial Match' : 'Low Match'}
        </span>
      </div>

      {/* Score ring + stats */}
      <div className="flex items-center gap-6">
        <ScoreRing score={result.score} />
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-slate-400">{result.matched.length} keywords matched</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-slate-400">{result.missing.length} keywords missing</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="w-2 h-2 rounded-full bg-slate-600" />
            <span className="text-slate-400">{result.jdKeywords.length} total JD keywords</span>
          </div>
        </div>
      </div>

      {/* Missing keywords */}
      {result.topMissing.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
            Top Missing Keywords
          </h4>
          <div className="flex flex-wrap gap-2">
            {result.topMissing.map((kw) => (
              <button
                key={kw}
                onClick={() => onAddKeyword?.(kw)}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-red-950/40 border border-red-900/40
                           text-red-400 rounded-lg text-xs hover:bg-red-900/60 transition-colors group"
                title="Click to add to resume"
              >
                {kw}
                {onAddKeyword && (
                  <span className="text-red-600 group-hover:text-red-300 transition-colors">+</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Matched keywords */}
      {result.matched.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
            Matched Keywords
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {result.matched.slice(0, 20).map((m) => (
              <span
                key={m.keyword}
                className="px-2 py-0.5 bg-green-950/30 border border-green-900/30 text-green-400 rounded text-xs"
              >
                {m.keyword}
                {m.stemMatch && <span className="text-green-600 ml-1">~</span>}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
