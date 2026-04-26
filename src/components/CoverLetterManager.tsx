import { useState, useEffect } from 'react';
import { useAppStore, keyStore } from '../store/app';
import { streamGeneric } from '../lib/ai/router';
import { buildCoverLetterPrompt } from '../lib/ai/prompts/cover_letter';
import { SparkleIcon, TrashIcon, DownloadIcon } from './ui/Icons';
import { getCoverLetters, createCoverLetter, deleteCoverLetter, getApplications } from '../lib/db/queries';
import { buildCoverLetterFilename } from '../lib/export';
import type { CoverLetterVersion, Application } from '../lib/db/schema';
import { formatDistanceToNow } from 'date-fns';
import { useJobContext } from '../store/jobContext';
import JobContextBar from './JobContextBar';

const TEMPLATES = [
  { id: 'standard',      name: 'Standard',       desc: 'General purpose cover letter for any role' },
  { id: 'career_change', name: 'Career Change',   desc: 'Pivot your background to a new field' },
  { id: 'referral',      name: 'Referral',        desc: 'When someone inside the company referred you' },
  { id: 'cold_outreach', name: 'Cold Outreach',   desc: 'No open req — reaching out directly' },
];

const TEMPLATE_HINTS: Record<string, string> = {
  standard:      'Emphasize 1-2 key achievements that directly match the JD. Be specific.',
  career_change: 'Draw transferable skills from your past. Address the change proactively, not defensively.',
  referral:      'Mention your referral in the first sentence. They vouch for your character.',
  cold_outreach: 'Lead with why this specific team/product excites you. Research matters here.',
};

export default function CoverLetterManager() {
  const { activeProvider, providers, addToast } = useAppStore();
  const { active: activeJob, setActive: setActiveJob } = useJobContext();
  const [coverLetters, setCoverLetters] = useState<CoverLetterVersion[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);

  const [selectedTemplate, setSelectedTemplate] = useState('standard');
  const [selectedApp, setSelectedApp] = useState('');
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [jobLocation, setJobLocation] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [candidateName, setCandidateName] = useState('');
  const [generatedContent, setGeneratedContent] = useState('');
  const [generating, setGenerating] = useState(false);
  const [streaming, setStreaming] = useState('');
  const [editedContent, setEditedContent] = useState('');
  const [editing, setEditing] = useState(false);

  // Auto-fill from active job on mount — only if all fields are empty
  useEffect(() => {
    if (activeJob && !company && !role && !jobDescription) {
      setCompany(activeJob.company);
      setRole(activeJob.roleTitle);
      setJobDescription(activeJob.jobDescription);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount-only

  useEffect(() => {
    setCoverLetters(getCoverLetters());
    setApplications(getApplications());
  }, []);

  const handleAppSelect = (appId: string) => {
    setSelectedApp(appId);
    const app = applications.find(a => a.id === appId);
    if (app) { setCompany(app.company); setRole(app.role); setJobDescription(app.jd_text); }
  };

  const handleGenerate = async () => {
    if (!jobDescription.trim()) { addToast('error', 'Enter a job description'); return; }
    const apiKey = keyStore.get(activeProvider);
    if (!apiKey) { addToast('error', `No API key for ${activeProvider}. Go to Settings.`); return; }

    setGenerating(true);
    setStreaming('');
    let acc = '';

    const hint = TEMPLATE_HINTS[selectedTemplate];
    const userPrompt = `
Template style: ${selectedTemplate}
${hint}

Company: ${company || 'the company'}
Role: ${role || 'the position'}
My name: ${candidateName || 'the candidate'}
Date: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}

Job Description:
${jobDescription}

Write a cover letter following the system instructions.
`.trim();

    const background = candidateName
      ? `Name: ${candidateName}${role ? `\nTarget role: ${role}` : ''}${company ? `\nApplying to: ${company}` : ''}`
      : `Target role: ${role || 'the position'}${company ? `\nApplying to: ${company}` : ''}`;

    try {
      await streamGeneric(
        { systemPrompt: buildCoverLetterPrompt(background), userPrompt },
        { provider: activeProvider, apiKey, model: providers[activeProvider].model },
        (chunk) => { acc += chunk; setStreaming(acc); }
      );

      // Parse JSON output
      const cleaned = acc.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      let body = '';
      try {
        const parsed = JSON.parse(cleaned) as { body?: string };
        body = parsed.body ?? acc;
      } catch {
        body = acc;
      }

      // Strip any em/en-dashes the AI may have used despite instructions
      body = body.replace(/\s*—\s*/g, ', ').replace(/\s*–\s*/g, ', ').replace(/,\s*,/g, ',');

      setGeneratedContent(body);
      setEditedContent(body);
    } catch (e) {
      addToast('error', e instanceof Error ? e.message : 'Generation failed');
    } finally {
      setGenerating(false);
      setStreaming('');
    }
  };

  const handleSave = () => {
    const content = editing ? editedContent : generatedContent;
    const cl = createCoverLetter({
      application_id: selectedApp || undefined,
      content,
      template_used: selectedTemplate,
      provider_used: activeProvider,
    });
    setCoverLetters(prev => [cl, ...prev]);
    addToast('success', 'Cover letter saved');
  };

  const handleDelete = (id: string) => {
    deleteCoverLetter(id);
    setCoverLetters(prev => prev.filter(c => c.id !== id));
  };

  const handleExport = (content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = buildCoverLetterFilename(role, company, candidateName, 'txt');
    a.click();
    URL.revokeObjectURL(url);
    addToast('success', 'Exported');
  };

  return (
    <div className="grid grid-cols-3 gap-6">
      {/* Generator panel */}
      <div className="col-span-2 space-y-5">
        <h2 className="text-lg font-semibold text-slate-100">Cover Letter Generator</h2>

        {/* Template selection */}
        <div>
          <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Template Style</label>
          <div className="grid grid-cols-2 gap-2">
            {TEMPLATES.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedTemplate(t.id)}
                className={`p-3 rounded-lg border text-left transition-all ${
                  selectedTemplate === t.id
                    ? 'border-blue-500 bg-blue-950/30'
                    : 'border-slate-800 bg-slate-900 hover:border-slate-600'
                }`}
              >
                <div className="text-sm font-medium text-slate-200">{t.name}</div>
                <div className="text-xs text-slate-500 mt-0.5">{t.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Job context auto-fill bar */}
        <JobContextBar
          company={company}
          roleTitle={role}
          jobDescription={jobDescription}
          onApply={(c, r, loc, jd) => { setCompany(c); setRole(r); setJobLocation(loc); setJobDescription(jd); }}
          onPin={() => setActiveJob({ company, roleTitle: role, location: jobLocation, jobDescription })}
        />

        {/* Link to application */}
        {applications.length > 0 && (
          <div>
            <label
              htmlFor="cl-app-select"
              className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5"
            >
              Link to Application (optional)
            </label>
            <select
              id="cl-app-select"
              value={selectedApp}
              onChange={e => handleAppSelect(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100
                         focus:outline-none focus:border-blue-500"
            >
              <option value="">-- Select application --</option>
              {applications.map(a => (
                <option key={a.id} value={a.id}>{a.company} — {a.role}</option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">Your Name</label>
            <input value={candidateName} onChange={e => setCandidateName(e.target.value)} placeholder="Jane Smith"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100
                         placeholder:text-slate-600 focus:outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">Company</label>
            <input value={company} onChange={e => setCompany(e.target.value)} placeholder="Google"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100
                         placeholder:text-slate-600 focus:outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">Role</label>
            <input value={role} onChange={e => setRole(e.target.value)} placeholder="Senior SWE"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100
                         placeholder:text-slate-600 focus:outline-none focus:border-blue-500" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">Job Description *</label>
          <textarea value={jobDescription} onChange={e => setJobDescription(e.target.value)}
            rows={6} placeholder="Paste the job description here..."
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100
                       placeholder:text-slate-600 focus:outline-none focus:border-blue-500 resize-none" />
        </div>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating || !jobDescription.trim()}
          className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl
                     font-medium text-sm transition-colors flex items-center justify-center gap-2"
        >
          {generating ? (
            <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Generating...</>
          ) : (
            <><SparkleIcon size={14} /> Generate Cover Letter</>
          )}
        </button>

        {/* Streaming preview */}
        {streaming && (
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="text-xs text-slate-500 mb-2">Writing...</div>
            <div className="text-sm text-slate-300 whitespace-pre-wrap streaming-cursor">{streaming}</div>
          </div>
        )}

        {/* Generated output */}
        {generatedContent && !streaming && (
          <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
              <span className="text-sm font-medium text-slate-300">Generated Cover Letter</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(!editing)}
                  className={`px-3 py-1 rounded-lg text-xs transition-colors ${editing ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                >
                  {editing ? 'Preview' : 'Edit'}
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="px-3 py-1 bg-green-700 hover:bg-green-600 text-white rounded-lg text-xs transition-colors"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => handleExport(editing ? editedContent : generatedContent)}
                  className="flex items-center gap-1 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors"
                >
                  <DownloadIcon size={11} /> Export
                </button>
              </div>
            </div>
            {editing ? (
              <textarea
                value={editedContent}
                onChange={e => setEditedContent(e.target.value)}
                aria-label="Edit cover letter"
                className="w-full h-64 p-4 bg-slate-800 text-sm text-slate-200 resize-none focus:outline-none"
              />
            ) : (
              <div className="p-4 text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
                {generatedContent}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Saved letters sidebar */}
      <div>
        <h3 className="text-sm font-semibold text-slate-300 mb-3">Saved Letters ({coverLetters.length})</h3>
        {coverLetters.length === 0 ? (
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 text-center">
            <p className="text-xs text-slate-600">No saved letters yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {coverLetters.map(cl => (
              <div key={cl.id} className="bg-slate-900 border border-slate-800 rounded-xl p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-slate-300 capitalize">{cl.template_used.replace('_', ' ')}</span>
                  <button type="button" title="Delete letter" onClick={() => handleDelete(cl.id)} className="text-slate-700 hover:text-red-400 transition-colors"><TrashIcon size={11} /></button>
                </div>
                <p className="text-xs text-slate-600 line-clamp-3">{cl.content.slice(0, 120)}...</p>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[10px] text-slate-700">
                    {formatDistanceToNow(new Date(cl.created_at), { addSuffix: true })}
                  </span>
                  <button
                    type="button"
                    onClick={() => { setGeneratedContent(cl.content); setEditedContent(cl.content); }}
                    className="text-[10px] text-blue-500 hover:text-blue-400 transition-colors"
                  >
                    Load
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
