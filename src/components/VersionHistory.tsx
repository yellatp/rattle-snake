import { useState, useEffect } from 'react';
import { getResumeVersions, updateResumeVersion } from '../lib/db/queries';
import type { ResumeVersion } from '../lib/db/schema';
import { formatDistanceToNow } from 'date-fns';
import { ClipboardIcon, EyeIcon } from './ui/Icons';

interface Props {
  applicationId?: string;
  onRestore?: (version: ResumeVersion) => void;
}

export default function VersionHistory({ applicationId, onRestore }: Props) {
  const [versions, setVersions] = useState<ResumeVersion[]>([]);
  const [selected, setSelected] = useState<ResumeVersion | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);

  useEffect(() => {
    const vv = getResumeVersions(applicationId);
    setVersions(vv.sort((a, b) => b.version_num - a.version_num));
  }, [applicationId]);

  const handleRestore = (version: ResumeVersion) => {
    versions.forEach(v => updateResumeVersion(v.id, { is_active: 0 }));
    updateResumeVersion(version.id, { is_active: 1 });
    setVersions(prev => prev.map(v => ({ ...v, is_active: v.id === version.id ? 1 : 0 })));
    onRestore?.(version);
  };

  const handleToggleApplied = (e: React.MouseEvent, version: ResumeVersion) => {
    e.stopPropagation();
    const next = !version.is_applied;
    updateResumeVersion(version.id, { is_applied: next } as never);
    setVersions(prev => prev.map(v => v.id === version.id ? { ...v, is_applied: next } : v));
  };

  if (versions.length === 0) {
    return (
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 text-center">
        <ClipboardIcon size={24} className="text-slate-700 mx-auto mb-3" />
        <p className="text-sm text-slate-500">No versions yet. Generate your first resume to start tracking.</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-800">
        <h3 className="font-medium text-slate-100">Version History</h3>
        <p className="text-xs text-slate-500 mt-0.5">{versions.length} version{versions.length !== 1 ? 's' : ''}</p>
      </div>

      <div className="divide-y divide-slate-800">
        {versions.map((version, idx) => (
          <div
            key={version.id}
            className={`p-4 cursor-pointer transition-colors ${
              selected?.id === version.id ? 'bg-blue-950/20' : 'hover:bg-slate-800/50'
            }`}
            onClick={() => setSelected(version.id === selected?.id ? null : version)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* Version indicator */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                  version.is_active ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'
                }`}>
                  v{version.version_num}
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-200">
                      {version.label || `Version ${version.version_num}`}
                    </span>
                    {version.is_active === 1 && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-blue-600/30 text-blue-400 rounded-full">
                        ACTIVE
                      </span>
                    )}
                    {idx === 0 && version.is_active !== 1 && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-slate-800 text-slate-500 rounded-full">
                        LATEST
                      </span>
                    )}
                    {version.is_applied && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-green-900/40 text-green-400 border border-green-800/40 rounded-full">
                        APPLIED
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-slate-500">
                      {formatDistanceToNow(new Date(version.created_at), { addSuffix: true })}
                    </span>
                    {version.provider_used && (
                      <span className="text-xs text-slate-600">{version.provider_used}</span>
                    )}
                    {version.ats_score > 0 && (
                      <span className={`text-xs font-medium ${
                        version.ats_score >= 75 ? 'text-green-400' :
                        version.ats_score >= 50 ? 'text-amber-400' : 'text-red-400'
                      }`}>
                        ATS {version.ats_score}%
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => handleToggleApplied(e, version)}
                  title={version.is_applied ? 'Mark as not applied' : 'Mark as applied'}
                  className={`px-2.5 py-1 rounded-lg text-xs transition-colors border ${
                    version.is_applied
                      ? 'bg-green-900/30 border-green-800/40 text-green-400 hover:bg-green-900/50'
                      : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {version.is_applied ? '✓ Applied' : 'Mark Applied'}
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setPreviewId(previewId === version.id ? null : version.id); }}
                  className="p-1.5 text-slate-500 hover:text-slate-300 transition-colors"
                  title="Preview"
                >
                  <EyeIcon size={14} />
                </button>
                {version.is_active !== 1 && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleRestore(version); }}
                    className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs transition-colors"
                  >
                    Restore
                  </button>
                )}
              </div>
            </div>

            {/* Preview panel */}
            {previewId === version.id && (
              <div className="mt-3 bg-slate-800 rounded-lg p-3 text-xs font-mono text-slate-400 max-h-48 overflow-y-auto">
                {version.content.slice(0, 500)}
                {version.content.length > 500 && <span className="text-slate-600">... (truncated)</span>}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Timeline connector */}
      <div className="px-4 py-2 border-t border-slate-800 text-xs text-slate-600 text-center">
        {versions.length} snapshot{versions.length !== 1 ? 's' : ''} stored locally
      </div>
    </div>
  );
}
