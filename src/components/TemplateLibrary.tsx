import { useState, useEffect, useRef } from 'react';
import ResumeEditor from './ResumeEditor';
import UserTemplateUploader from './UserTemplateUploader';
import {
  getUserTemplates, saveUserTemplate, deleteUserTemplate,
  parseDocxText, type UserTemplate,
} from '../lib/userTemplates';
import { useAppStore } from '../store/app';
import { TrashIcon, UploadIcon, DocIcon, ArrowRightIcon, CheckIcon } from './ui/Icons';

import dataSciTemplate from '../templates/data_scientist.json';
import dataAnalystTemplate from '../templates/data_analyst.json';
import mlEngineerTemplate from '../templates/ml_engineer.json';
import sweTemplate from '../templates/swe.json';
import pmTemplate from '../templates/product_manager.json';
import devopsTemplate from '../templates/devops.json';
import aiEngineerTemplate from '../templates/ai_engineer.json';
import productAnalystTemplate from '../templates/product_analyst.json';
import businessAnalystTemplate from '../templates/business_analyst.json';

type SystemTemplate = typeof dataSciTemplate;
type AnyTemplate   = SystemTemplate | UserTemplate;

const SYSTEM_TEMPLATES: SystemTemplate[] = [
  dataSciTemplate, dataAnalystTemplate, mlEngineerTemplate, aiEngineerTemplate,
  productAnalystTemplate, businessAnalystTemplate, sweTemplate, pmTemplate, devopsTemplate,
];

function isUserTemplate(t: AnyTemplate): t is UserTemplate {
  return 'isUserTemplate' in t && t.isUserTemplate === true;
}

// ── Fill-from-Resume inliner ──────────────────────────────────────────────────

function FillFromResume({ onFill }: { onFill: (raw: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<'idle' | 'parsing' | 'done' | 'error'>('idle');
  const [msg, setMsg] = useState('');

  const handleFile = async (file: File) => {
    setStatus('parsing');
    setMsg('');
    try {
      let rawText = '';
      if (file.name.endsWith('.docx')) {
        const mammoth = await import('mammoth');
        const buf = await file.arrayBuffer();
        rawText = (await mammoth.extractRawText({ arrayBuffer: buf })).value;
      } else if (file.name.endsWith('.txt')) {
        rawText = await file.text();
      } else {
        throw new Error('Only .docx and .txt files are supported');
      }
      onFill(rawText);
      setStatus('done');
      setMsg(`Parsed ${file.name}`);
    } catch (e) {
      setStatus('error');
      setMsg(e instanceof Error ? e.message : 'Parse failed');
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input
        ref={fileRef}
        type="file"
        accept=".docx,.txt"
        title="Upload resume to fill template"
        aria-label="Upload resume to fill template"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={status === 'parsing'}
        className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50
                   text-slate-200 rounded-lg text-xs font-medium transition-colors"
      >
        {status === 'parsing' ? (
          <span className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin" />
        ) : (
          <UploadIcon size={12} />
        )}
        Fill from My Resume
      </button>
      {status === 'done'  && <span className="text-xs text-green-400"><CheckIcon size={10} /> {msg}</span>}
      {status === 'error' && <span className="text-xs text-red-400">{msg}</span>}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TemplateLibrary() {
  const { addToast } = useAppStore();
  const [selected,      setSelected]      = useState<AnyTemplate | null>(null);
  const [editContent,   setEditContent]   = useState('');
  const [viewMode,      setViewMode]      = useState<'visual' | 'json'>('visual');
  const [jsonError,     setJsonError]     = useState('');
  const [userTemplates, setUserTemplates] = useState<UserTemplate[]>([]);
  const [tab,           setTab]           = useState<'library' | 'upload'>('library');
  const [saving,        setSaving]        = useState(false);
  const [saved,         setSaved]         = useState(false);

  useEffect(() => { setUserTemplates(getUserTemplates()); }, []);

  const handleSelect = (t: AnyTemplate) => {
    setSelected(t);
    setEditContent(JSON.stringify(t, null, 2));
    setViewMode('visual');
    setJsonError('');
    setSaved(false);
  };

  const handleDeleteUser = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this template? This cannot be undone.')) return;
    deleteUserTemplate(id);
    setUserTemplates(prev => prev.filter(t => t.id !== id));
    if (selected && isUserTemplate(selected) && selected.id === id) setSelected(null);
  };

  const handleUploaded = (template: UserTemplate) => {
    setUserTemplates(prev => [template, ...prev.filter(t => t.id !== template.id)]);
    setTab('library');
  };

  // JSON edit → visual: parse and propagate
  const handleJsonChange = (raw: string) => {
    setEditContent(raw);
    try { JSON.parse(raw); setJsonError(''); } catch { setJsonError('Invalid JSON'); }
    setSaved(false);
  };

  // Visual editor changed → update JSON pane
  const handleVisualChange = (json: string) => {
    setEditContent(json);
    setSaved(false);
  };

  // "Fill from Resume" — parse raw text and merge contact + sections into template JSON
  const handleFill = (rawText: string) => {
    if (!selected) return;
    try {
      const parsed = parseDocxText(rawText, selected.role);
      const base   = JSON.parse(editContent) as AnyTemplate;
      const c = parsed.contact ?? {};
      const s = parsed.sections;

      const merged = {
        ...base,
        contact: {
          ...(base.contact as object),
          ...(c.name      ? { name:      c.name      } : {}),
          ...(c.email     ? { email:     c.email     } : {}),
          ...(c.phone     ? { phone:     c.phone     } : {}),
          ...(c.location  ? { location:  c.location  } : {}),
          ...(c.linkedin  ? { linkedin:  c.linkedin  } : {}),
          ...(c.github    ? { github:    c.github    } : {}),
          ...(c.portfolio ? { portfolio: c.portfolio } : {}),
        },
        sections: {
          ...(base.sections as object),
          ...(s.summary.content ? { summary: { content: s.summary.content, editable: true } } : {}),
          ...(s.experience.length  ? { experience:    s.experience          } : {}),
          ...(s.education.length   ? { education:     s.education           } : {}),
          ...(s.skills.categories.length ? { skills: { categories: s.skills.categories, editable: true } } : {}),
          ...(s.certifications.length    ? { certifications: s.certifications } : {}),
        },
      };

      const newJson = JSON.stringify(merged, null, 2);
      setEditContent(newJson);
      setJsonError('');
      setSaved(false);
      addToast('success', 'Template filled with your resume data');
    } catch (e) {
      addToast('error', e instanceof Error ? e.message : 'Fill failed');
    }
  };

  // Save changes (user template) or create new user template (system template)
  const handleSave = () => {
    if (jsonError) { addToast('error', 'Fix JSON errors before saving'); return; }
    setSaving(true);
    try {
      const data = JSON.parse(editContent) as AnyTemplate;

      if (isUserTemplate(selected!)) {
        // Update existing user template in place
        const updated: UserTemplate = { ...(data as UserTemplate), isUserTemplate: true };
        saveUserTemplate(updated);
        setUserTemplates(prev => prev.map(t => t.id === updated.id ? updated : t));
        setSelected(updated);
      } else {
        // Fork a system template into user templates
        const forked: UserTemplate = {
          ...(data as UserTemplate),
          id:           crypto.randomUUID(),
          fileName:     `${selected!.role} (customized)`,
          uploadedAt:   new Date().toISOString(),
          isUserTemplate: true,
          rawText:      editContent,
        };
        saveUserTemplate(forked);
        setUserTemplates(prev => [forked, ...prev]);
        setSelected(forked);
        addToast('success', 'Saved as your personal template');
      }
      setSaved(true);
    } catch (e) {
      addToast('error', e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const getExpCount   = (t: AnyTemplate) => t.sections.experience.length;
  const getSkillCount = (t: AnyTemplate) => t.sections.skills.categories.length;

  return (
    <div className="space-y-6">
      {!selected ? (
        <>
          {/* Tabs */}
          <div className="flex items-center justify-between">
            <div className="flex bg-slate-800/60 rounded-lg p-1 gap-1">
              <button type="button" onClick={() => setTab('library')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  tab === 'library' ? 'bg-slate-700 text-slate-100 shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}>
                Template Library
              </button>
              <button type="button" onClick={() => setTab('upload')}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  tab === 'upload' ? 'bg-slate-700 text-slate-100 shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}>
                <UploadIcon size={13} />
                Upload Your Own
              </button>
            </div>
            {userTemplates.length > 0 && tab === 'library' && (
              <span className="text-xs text-slate-500">
                {userTemplates.length} personal template{userTemplates.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {tab === 'upload' ? (
            <div className="max-w-lg">
              <p className="text-sm text-slate-400 mb-4">
                Upload your own DOCX resume. It will be parsed in your browser and available as a starting point for generation.
              </p>
              <UserTemplateUploader onUploaded={handleUploaded} />
            </div>
          ) : (
            <>
              {/* User templates */}
              {userTemplates.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Your Templates</h3>
                  <div className="grid grid-cols-3 gap-3 mb-6">
                    {userTemplates.map(t => (
                      <div key={t.id}
                        className="group relative bg-slate-900 border border-blue-900/30 rounded-xl p-4 hover:border-blue-500/50 hover:bg-blue-950/10 transition-all">
                        <div className="absolute top-2.5 right-2.5">
                          <button type="button" title={`Delete ${t.role} template`}
                            onClick={(e) => handleDeleteUser(t.id, e)}
                            className="opacity-0 group-hover:opacity-100 p-1 text-slate-700 hover:text-red-400 transition-all">
                            <TrashIcon size={12} />
                          </button>
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                          <DocIcon size={14} className="text-blue-400 shrink-0" />
                          <span className="text-[10px] text-blue-500 font-medium uppercase tracking-wider">Personal</span>
                        </div>
                        <h3 className="font-semibold text-slate-100 text-sm">{t.role}</h3>
                        <p className="text-xs text-slate-500 mt-0.5 truncate">{t.fileName}</p>
                        <p className="text-xs text-slate-600 mt-1 mb-3">
                          {getExpCount(t)} roles · {getSkillCount(t)} skill sets
                        </p>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => handleSelect(t)}
                            className="flex-1 py-1.5 text-[11px] font-medium rounded-lg bg-slate-800 hover:bg-slate-700
                                       text-slate-300 hover:text-slate-100 transition-colors text-center">
                            Preview / Edit
                          </button>
                          <a href={`/generate?template=${t.slug}`}
                            className="flex-1 py-1.5 text-[11px] font-medium rounded-lg bg-blue-600/20 hover:bg-blue-600/40
                                       text-blue-400 hover:text-blue-300 border border-blue-800/30 transition-colors text-center">
                            Use →
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* System templates */}
              <div>
                {userTemplates.length > 0 && (
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Built-in Templates</h3>
                )}
                <div className="grid grid-cols-3 gap-3">
                  {SYSTEM_TEMPLATES.map(t => (
                    <div key={t.slug}
                      className="group bg-slate-900 border border-slate-800 rounded-xl p-4
                                 hover:border-slate-600/80 hover:bg-slate-800/50 transition-all">
                      <div className="flex items-center justify-between mb-3">
                        <div className="w-7 h-7 bg-slate-800 rounded-lg flex items-center justify-center">
                          <TemplateRoleIcon role={t.slug} />
                        </div>
                      </div>
                      <h3 className="font-semibold text-slate-100 text-sm group-hover:text-white transition-colors">{t.role}</h3>
                      <p className="text-xs text-slate-500 mt-1">{getExpCount(t)} roles · {getSkillCount(t)} skill sets</p>
                      <div className="flex flex-wrap gap-1 mt-2 mb-3">
                        {t.ats_keywords.slice(0, 3).map(kw => (
                          <span key={kw} className="text-[9px] px-1.5 py-0.5 bg-slate-800 text-slate-500 rounded">{kw}</span>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => handleSelect(t)}
                          className="flex-1 py-1.5 text-[11px] font-medium rounded-lg bg-slate-800 hover:bg-slate-700
                                     text-slate-300 hover:text-slate-100 transition-colors text-center">
                          Preview / Edit
                        </button>
                        <a href={`/generate?template=${t.slug}`}
                          className="flex-1 py-1.5 text-[11px] font-medium rounded-lg bg-blue-600/20 hover:bg-blue-600/40
                                     text-blue-400 hover:text-blue-300 border border-blue-800/30 transition-colors text-center">
                          Use →
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      ) : (
        /* ── Template detail view ──────────────────────────────────────── */
        <div className="space-y-4">
          {/* Header bar */}
          <div className="flex items-center gap-3 flex-wrap">
            <button type="button" onClick={() => setSelected(null)}
              className="text-slate-500 hover:text-slate-300 text-sm transition-colors">
              ← Back to templates
            </button>
            <span className="text-slate-700">/</span>
            <h2 className="font-semibold text-slate-100">{selected.role}</h2>
            {isUserTemplate(selected) ? (
              <span className="text-xs px-2 py-0.5 bg-blue-900/40 text-blue-400 rounded-full border border-blue-800/40">Personal</span>
            ) : (
              <span className="text-xs px-2 py-0.5 bg-slate-800 text-slate-500 rounded-full">Built-in</span>
            )}

            <div className="ml-auto flex items-center gap-2 flex-wrap">
              {/* Fill from resume */}
              <FillFromResume onFill={handleFill} />

              {/* Save / Customize */}
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !!jsonError}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 ${
                  saved
                    ? 'bg-green-600/30 text-green-400 border border-green-800/40'
                    : 'bg-blue-600 hover:bg-blue-500 text-white'
                }`}
              >
                {saving ? (
                  <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                ) : saved ? (
                  <><CheckIcon size={11} /> Saved</>
                ) : isUserTemplate(selected) ? (
                  'Save Changes'
                ) : (
                  'Customize → Save as Mine'
                )}
              </button>

              {/* Use template */}
              <a href={`/generate?template=${selected.slug}`}
                className="flex items-center gap-2 px-4 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs font-medium transition-colors">
                Use Template
                <ArrowRightIcon size={11} />
              </a>
            </div>
          </div>

          {/* Visual / JSON toggle */}
          <div className="flex items-center gap-3">
            <div className="flex bg-slate-800/60 rounded-lg p-0.5 gap-0.5 text-xs">
              {(['visual', 'json'] as const).map(mode => (
                <button key={mode} type="button" onClick={() => setViewMode(mode)}
                  className={`px-4 py-1.5 rounded-md font-medium transition-all capitalize ${
                    viewMode === mode ? 'bg-slate-700 text-slate-100 shadow-sm' : 'text-slate-400 hover:text-slate-200'
                  }`}>
                  {mode === 'visual' ? '⊞ Visual' : '{ } JSON'}
                </button>
              ))}
            </div>
            {jsonError && <span className="text-xs text-red-400">{jsonError}</span>}
            {viewMode === 'json' && !jsonError && (
              <span className="text-xs text-slate-600">Edit JSON directly — changes sync to Visual view</span>
            )}
            {viewMode === 'visual' && (
              <span className="text-xs text-slate-600">Click any text field to edit inline</span>
            )}
          </div>

          {/* Editor area */}
          <div className="grid grid-cols-3 gap-6">
            <div className="col-span-2">
              {viewMode === 'visual' ? (
                <ResumeEditor content={editContent} onChange={handleVisualChange} />
              ) : (
                <textarea
                  value={editContent}
                  onChange={e => handleJsonChange(e.target.value)}
                  spellCheck={false}
                  aria-label="Template JSON editor"
                  className={`w-full h-[70vh] bg-slate-900 border rounded-xl px-4 py-3 text-xs font-mono
                              text-slate-300 focus:outline-none resize-none leading-relaxed ${
                    jsonError ? 'border-red-500/50' : 'border-slate-700 focus:border-blue-500'
                  }`}
                />
              )}
            </div>

            {/* Sidebar: keywords + prompt ref */}
            <div className="space-y-4">
              <div>
                <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">ATS Keywords</div>
                <div className="flex flex-wrap gap-2">
                  {(selected.ats_keywords.length > 0 ? selected.ats_keywords : ['No keywords set']).map(kw => (
                    <span key={kw} className="px-2.5 py-1 bg-blue-950/40 border border-blue-900/30 text-blue-400 rounded-lg text-xs">
                      {kw}
                    </span>
                  ))}
                </div>
              </div>

              {!isUserTemplate(selected) && (
                <div>
                  <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">AI System Prompt</div>
                  <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                    <p className="text-xs text-slate-500">
                      Uses the <span className="text-blue-400 font-mono">{selected.system_prompt_ref}</span> prompt,
                      optimized for {selected.role} roles.
                    </p>
                  </div>
                </div>
              )}

              <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3 space-y-1.5 text-xs text-slate-500">
                <p className="font-medium text-slate-400">How to use</p>
                <p>• <span className="text-slate-400">Fill from My Resume</span> — upload your DOCX/TXT to replace the placeholder content with your actual data.</p>
                <p>• <span className="text-slate-400">Visual</span> — click any field to edit inline.</p>
                <p>• <span className="text-slate-400">JSON</span> — direct JSON editing for full control.</p>
                <p>• <span className="text-slate-400">Customize → Save as Mine</span> — forks this template into your personal collection.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TemplateRoleIcon({ role }: { role: string }) {
  const icons: Record<string, string> = {
    data_scientist:   'DS', data_analyst:    'DA', ml_engineer:     'ML',
    ai_engineer:      'AI', product_analyst: 'PA', business_analyst:'BA',
    swe:              'SE', product_manager: 'PM', devops:          'DO',
  };
  return <span className="text-[10px] font-bold text-slate-400">{icons[role] ?? role.slice(0, 2).toUpperCase()}</span>;
}
