import { useState, useEffect } from 'react';
import ResumeEditor from './ResumeEditor';
import UserTemplateUploader from './UserTemplateUploader';
import { getUserTemplates, deleteUserTemplate, type UserTemplate } from '../lib/userTemplates';
import { TrashIcon, UploadIcon, DocIcon, ArrowRightIcon } from './ui/Icons';

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

const SYSTEM_TEMPLATES: SystemTemplate[] = [
  dataSciTemplate,
  dataAnalystTemplate,
  mlEngineerTemplate,
  aiEngineerTemplate,
  productAnalystTemplate,
  businessAnalystTemplate,
  sweTemplate,
  pmTemplate,
  devopsTemplate,
];

type AnyTemplate = SystemTemplate | UserTemplate;

function isUserTemplate(t: AnyTemplate): t is UserTemplate {
  return 'isUserTemplate' in t && t.isUserTemplate === true;
}

export default function TemplateLibrary() {
  const [selected, setSelected] = useState<AnyTemplate | null>(null);
  const [editContent, setEditContent] = useState('');
  const [userTemplates, setUserTemplates] = useState<UserTemplate[]>([]);
  const [tab, setTab] = useState<'library' | 'upload'>('library');

  useEffect(() => {
    setUserTemplates(getUserTemplates());
  }, []);

  const handleSelect = (t: AnyTemplate) => {
    setSelected(t);
    setEditContent(JSON.stringify(t, null, 2));
  };

  const handleDeleteUser = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteUserTemplate(id);
    setUserTemplates(prev => prev.filter(t => t.id !== id));
    if (selected && isUserTemplate(selected) && selected.id === id) setSelected(null);
  };

  const handleUploaded = (template: UserTemplate) => {
    setUserTemplates(prev => {
      const next = [template, ...prev.filter(t => t.id !== template.id)];
      return next;
    });
    setTab('library');
  };

  const getExpCount = (t: AnyTemplate) => t.sections.experience.length;
  const getSkillCount = (t: AnyTemplate) => t.sections.skills.categories.length;

  return (
    <div className="space-y-6">
      {!selected ? (
        <>
          {/* Tabs */}
          <div className="flex items-center justify-between">
            <div className="flex bg-slate-800/60 rounded-lg p-1 gap-1">
              <button
                type="button"
                onClick={() => setTab('library')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  tab === 'library' ? 'bg-slate-700 text-slate-100 shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Template Library
              </button>
              <button
                type="button"
                onClick={() => setTab('upload')}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  tab === 'upload' ? 'bg-slate-700 text-slate-100 shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <UploadIcon size={13} />
                Upload Your Own
              </button>
            </div>
            {userTemplates.length > 0 && tab === 'library' && (
              <span className="text-xs text-slate-500">{userTemplates.length} personal template{userTemplates.length !== 1 ? 's' : ''}</span>
            )}
          </div>

          {tab === 'upload' ? (
            <div className="max-w-lg">
              <p className="text-sm text-slate-400 mb-4">
                Upload your own DOCX resume. It will be parsed in your browser, stored locally, and available as a starting point for AI generation.
              </p>
              <UserTemplateUploader onUploaded={handleUploaded} />
            </div>
          ) : (
            <>
              {/* User templates */}
              {userTemplates.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                    Your Templates
                  </h3>
                  <div className="grid grid-cols-3 gap-3 mb-6">
                    {userTemplates.map(t => (
                      <button
                        key={t.id}
                        type="button"
                        title={`Open ${t.role} template`}
                        onClick={() => handleSelect(t)}
                        className="group relative bg-slate-900 border border-blue-900/30 rounded-xl p-4 text-left
                                   hover:border-blue-500/50 hover:bg-blue-950/10 transition-all"
                      >
                        <div className="absolute top-2.5 right-2.5">
                          <button
                            type="button"
                            title={`Delete ${t.role} template`}
                            onClick={(e) => handleDeleteUser(t.id, e)}
                            className="opacity-0 group-hover:opacity-100 p-1 text-slate-700 hover:text-red-400 transition-all"
                          >
                            <TrashIcon size={12} />
                          </button>
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                          <DocIcon size={14} className="text-blue-400 shrink-0" />
                          <span className="text-[10px] text-blue-500 font-medium uppercase tracking-wider">Personal</span>
                        </div>
                        <h3 className="font-semibold text-slate-100 text-sm">{t.role}</h3>
                        <p className="text-xs text-slate-500 mt-0.5 truncate">{t.fileName}</p>
                        <p className="text-xs text-slate-600 mt-1">
                          {getExpCount(t)} roles · {getSkillCount(t)} skill sets
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* System templates */}
              <div>
                {userTemplates.length > 0 && (
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                    Built-in Templates
                  </h3>
                )}
                <div className="grid grid-cols-3 gap-3">
                  {SYSTEM_TEMPLATES.map(t => (
                    <button
                      key={t.slug}
                      type="button"
                      onClick={() => handleSelect(t)}
                      className="group bg-slate-900 border border-slate-800 rounded-xl p-4 text-left
                                 hover:border-slate-600/80 hover:bg-slate-800/50 transition-all"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="w-7 h-7 bg-slate-800 rounded-lg flex items-center justify-center">
                          <TemplateRoleIcon role={t.slug} />
                        </div>
                        <ArrowRightIcon size={12} className="text-slate-700 group-hover:text-slate-400 transition-colors" />
                      </div>
                      <h3 className="font-semibold text-slate-100 text-sm group-hover:text-white transition-colors">
                        {t.role}
                      </h3>
                      <p className="text-xs text-slate-500 mt-1">
                        {getExpCount(t)} roles · {getSkillCount(t)} skill sets
                      </p>
                      <div className="flex flex-wrap gap-1 mt-2.5">
                        {t.ats_keywords.slice(0, 3).map(kw => (
                          <span key={kw} className="text-[9px] px-1.5 py-0.5 bg-slate-800 text-slate-500 rounded">
                            {kw}
                          </span>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-slate-500 hover:text-slate-300 text-sm transition-colors"
            >
              Back to templates
            </button>
            <span className="text-slate-700">/</span>
            <h2 className="font-semibold text-slate-100">{selected.role}</h2>
            {isUserTemplate(selected) && (
              <span className="text-xs px-2 py-0.5 bg-blue-900/40 text-blue-400 rounded-full border border-blue-800/40">
                Personal
              </span>
            )}
            <div className="ml-auto">
              <a
                href={`/generate?template=${selected.slug}`}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl
                           text-sm font-medium transition-colors"
              >
                Use This Template
                <ArrowRightIcon size={13} />
              </a>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">Preview</div>
              <ResumeEditor content={editContent} onChange={setEditContent} />
            </div>
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
                      optimized for {selected.role} roles with role-specific vocabulary, ATS injection, and metric preservation.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TemplateRoleIcon({ role }: { role: string }) {
  const icons: Record<string, string> = {
    data_scientist: 'DS',
    data_analyst:   'DA',
    ml_engineer:    'ML',
    ai_engineer:    'AI',
    product_analyst:'PA',
    business_analyst:'BA',
    swe:            'SE',
    product_manager:'PM',
    devops:         'DO',
  };
  return <span className="text-[10px] font-bold text-slate-400">{icons[role] ?? role.slice(0, 2).toUpperCase()}</span>;
}
