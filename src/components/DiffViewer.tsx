import { useMemo, useState } from 'react';
import { diff_match_patch } from 'diff-match-patch';

interface ResumeSection {
  key: string;
  label: string;
  original: string;
  revised: string;
}

interface Props {
  original: string;
  revised: string;
  onAccept: (content: string) => void;
  onReject: () => void;
  onEdit: (content: string) => void;
}

function buildSections(original: unknown, revised: unknown): ResumeSection[] {
  const sections: ResumeSection[] = [];

  function extractText(obj: unknown, path: string): string {
    if (typeof obj === 'string') return obj;
    if (Array.isArray(obj)) return obj.map((item, i) => extractText(item, `${path}[${i}]`)).join('\n');
    if (obj && typeof obj === 'object') {
      return Object.entries(obj as Record<string, unknown>)
        .map(([k, v]) => extractText(v, `${path}.${k}`))
        .join('\n');
    }
    return String(obj ?? '');
  }

  const orig = original as Record<string, unknown> | null;
  const rev = revised as Record<string, unknown> | null;

  if (!orig?.sections || !rev?.sections) {
    sections.push({
      key: 'full',
      label: 'Full Resume',
      original: JSON.stringify(original, null, 2),
      revised: JSON.stringify(revised, null, 2),
    });
    return sections;
  }

  const origSections = orig.sections as Record<string, unknown>;
  const revSections = rev.sections as Record<string, unknown>;

  const sectionLabels: Record<string, string> = {
    summary: 'Professional Summary',
    skills: 'Skills',
    experience: 'Experience',
    education: 'Education',
    certifications: 'Certifications',
  };

  for (const [key, label] of Object.entries(sectionLabels)) {
    const o = extractText(origSections[key], key);
    const r = extractText(revSections[key], key);
    if (o || r) {
      sections.push({ key, label, original: o, revised: r });
    }
  }

  return sections;
}

function InlineDiff({ original, revised }: { original: string; revised: string }) {
  const dmp = useMemo(() => new diff_match_patch(), []);
  const diffs = useMemo(() => {
    const d = dmp.diff_main(original, revised);
    dmp.diff_cleanupSemantic(d);
    return d;
  }, [original, revised, dmp]);

  return (
    <div className="text-xs font-mono whitespace-pre-wrap leading-relaxed">
      {diffs.map((diff, i) => {
        const [op, text] = diff;
        if (op === 0) return <span key={i} className="text-slate-300">{text}</span>;
        if (op === 1) return <span key={i} className="bg-green-900/40 text-green-300 rounded px-0.5">{text}</span>;
        if (op === -1) return <span key={i} className="bg-red-900/40 text-red-400 line-through rounded px-0.5">{text}</span>;
        return null;
      })}
    </div>
  );
}

function hasDiff(original: string, revised: string): boolean {
  return original !== revised;
}

export default function DiffViewer({ original, revised, onAccept, onReject, onEdit }: Props) {
  const [viewMode, setViewMode] = useState<'side-by-side' | 'inline'>('side-by-side');
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState(revised);

  const origParsed = useMemo(() => {
    try { return JSON.parse(original); } catch { return null; }
  }, [original]);

  const revParsed = useMemo(() => {
    try { return JSON.parse(revised); } catch { return null; }
  }, [revised]);

  const sections = useMemo(
    () => buildSections(origParsed, revParsed),
    [origParsed, revParsed]
  );

  const changedCount = sections.filter(s => hasDiff(s.original, s.revised)).length;

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/50">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-slate-300">Resume Diff</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-900/30 text-amber-400 border border-amber-900/40">
            {changedCount} section{changedCount !== 1 ? 's' : ''} changed
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex bg-slate-800 rounded-lg p-0.5 text-xs">
            <button
              onClick={() => setViewMode('side-by-side')}
              className={`px-3 py-1 rounded-md transition-colors ${viewMode === 'side-by-side' ? 'bg-slate-600 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Side by side
            </button>
            <button
              onClick={() => setViewMode('inline')}
              className={`px-3 py-1 rounded-md transition-colors ${viewMode === 'inline' ? 'bg-slate-600 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Inline
            </button>
          </div>

          <button
            onClick={() => setEditMode(!editMode)}
            className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${editMode ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
          >
            {editMode ? 'Preview' : 'Edit'}
          </button>
        </div>
      </div>

      {/* Content */}
      {editMode ? (
        <div className="p-4">
          <textarea
            value={editContent}
            onChange={e => setEditContent(e.target.value)}
            className="w-full h-96 bg-slate-800 border border-slate-700 rounded-lg p-3 text-xs font-mono
                       text-slate-200 focus:outline-none focus:border-blue-500 resize-none"
          />
        </div>
      ) : (
        <div className="divide-y divide-slate-800">
          {sections.map(section => {
            const changed = hasDiff(section.original, section.revised);
            return (
              <div key={section.key} className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    {section.label}
                  </span>
                  {changed && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-amber-900/30 text-amber-500 rounded">
                      changed
                    </span>
                  )}
                </div>

                {viewMode === 'side-by-side' ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-800/50 rounded-lg p-3">
                      <div className="text-[10px] text-slate-600 mb-2 uppercase tracking-wider">Original</div>
                      <div className="text-xs text-slate-400 whitespace-pre-wrap font-mono leading-relaxed">
                        {section.original}
                      </div>
                    </div>
                    <div className={`rounded-lg p-3 ${changed ? 'bg-green-950/20 border border-green-900/20' : 'bg-slate-800/50'}`}>
                      <div className="text-[10px] text-slate-600 mb-2 uppercase tracking-wider">AI Version</div>
                      {changed ? (
                        <InlineDiff original={section.original} revised={section.revised} />
                      ) : (
                        <div className="text-xs text-slate-400 whitespace-pre-wrap font-mono leading-relaxed">
                          {section.revised}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <InlineDiff original={section.original} revised={section.revised} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800 bg-slate-950/50">
        <button
          onClick={onReject}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors"
        >
          ✕ Reject All
        </button>

        <div className="flex items-center gap-2">
          {editMode && (
            <button
              onClick={() => onEdit(editContent)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm transition-colors"
            >
              Apply Edits
            </button>
          )}
          <button
            onClick={() => onAccept(editMode ? editContent : revised)}
            className="px-4 py-2 bg-green-700 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            ✓ Accept All
          </button>
        </div>
      </div>
    </div>
  );
}
