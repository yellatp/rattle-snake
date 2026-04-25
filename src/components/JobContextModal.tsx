import { useState, useEffect, useRef } from 'react';
import { useJobContext, type JobTarget } from '../store/jobContext';
import { getRecentJDs } from '../lib/db/queries';
import { CloseIcon, SparkleIcon } from './ui/Icons';
import { formatDistanceToNow } from 'date-fns';

export default function JobContextModal() {
  const { active, modalOpen, setActive, clearActive, closeModal } = useJobContext();

  const [company, setCompany]               = useState('');
  const [roleTitle, setRoleTitle]           = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [recentJDs, setRecentJDs]           = useState<ReturnType<typeof getRecentJDs>>([]);
  const companyRef = useRef<HTMLInputElement>(null);

  // Sync form fields when modal opens
  useEffect(() => {
    if (modalOpen) {
      setCompany(active?.company ?? '');
      setRoleTitle(active?.roleTitle ?? '');
      setJobDescription(active?.jobDescription ?? '');
      setRecentJDs(getRecentJDs());
      setTimeout(() => companyRef.current?.focus(), 50);
    }
  }, [modalOpen, active]);

  // Close on Escape
  useEffect(() => {
    if (!modalOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [modalOpen, closeModal]);

  if (!modalOpen) return null;

  const handleSave = () => {
    if (!company.trim() && !roleTitle.trim() && !jobDescription.trim()) {
      closeModal();
      return;
    }
    setActive({ company: company.trim(), roleTitle: roleTitle.trim(), jobDescription });
  };

  const loadRecent = (jd: JobTarget) => {
    setCompany(jd.company);
    setRoleTitle(jd.roleTitle);
    setJobDescription(jd.jobDescription);
  };

  const hasContent = company.trim() || roleTitle.trim() || jobDescription.trim();

  return (
    /* Overlay */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(2px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
    >
      {/* Panel */}
      <div className="w-full max-w-xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col"
           style={{ maxHeight: '90vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className={`w-2 h-2 rounded-full ${active ? 'bg-blue-400' : 'bg-slate-600'}`} />
            <h2 className="text-sm font-semibold text-slate-100">Active Job Target</h2>
            {active && (
              <span className="text-[10px] font-mono text-blue-400 bg-blue-950/40 border border-blue-900/30 px-2 py-0.5 rounded-full">
                Active
              </span>
            )}
          </div>
          <button type="button" onClick={closeModal}
            className="text-slate-600 hover:text-slate-300 transition-colors">
            <CloseIcon size={15} />
          </button>
        </div>

        {/* Recent JDs quick-load */}
        {recentJDs.length > 0 && (
          <div className="px-5 pt-4 pb-0">
            <div className="text-[10px] font-mono uppercase tracking-widest text-slate-600 mb-2">
              Load from recent
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              {recentJDs.map((jd) => (
                <button
                  key={jd.id}
                  type="button"
                  onClick={() => loadRecent(jd)}
                  className="shrink-0 flex flex-col items-start px-3 py-2 bg-slate-800 hover:bg-slate-700
                             border border-slate-700 hover:border-slate-500 rounded-lg transition-all text-left"
                >
                  <span className="text-xs text-slate-200 font-medium whitespace-nowrap">
                    {[jd.company, jd.roleTitle].filter(Boolean).join(' · ') || 'Untitled'}
                  </span>
                  <span className="text-[10px] text-slate-600 whitespace-nowrap">
                    {formatDistanceToNow(new Date(jd.savedAt), { addSuffix: true })}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">
                Company
              </label>
              <input
                ref={companyRef}
                type="text"
                value={company}
                onChange={e => setCompany(e.target.value)}
                placeholder="Google, Stripe, Mayo Clinic…"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm
                           text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500
                           focus:ring-1 focus:ring-blue-500/30 transition-colors"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">
                Role Title
              </label>
              <input
                type="text"
                value={roleTitle}
                onChange={e => setRoleTitle(e.target.value)}
                placeholder="Staff Data Scientist…"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm
                           text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500
                           focus:ring-1 focus:ring-blue-500/30 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">
              Job Description
              <span className="normal-case font-normal text-slate-600 ml-1">— paste the full JD once, all tools use it</span>
            </label>
            <textarea
              value={jobDescription}
              onChange={e => setJobDescription(e.target.value)}
              placeholder="Paste the full job description here. Resume generator, cover letter, and interview prep will all auto-fill from this."
              rows={12}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm
                         text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500
                         focus:ring-1 focus:ring-blue-500/30 resize-none transition-colors font-mono text-xs
                         leading-relaxed"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-800 flex items-center gap-3">
          {active && (
            <button
              type="button"
              onClick={() => { clearActive(); }}
              className="px-3 py-2 text-xs text-slate-500 hover:text-red-400 transition-colors border
                         border-slate-800 hover:border-red-900/40 rounded-lg"
            >
              Clear active
            </button>
          )}
          <div className="flex-1" />
          <button
            type="button"
            onClick={closeModal}
            className="px-4 py-2 text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!hasContent}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40
                       disabled:cursor-not-allowed text-white rounded-lg text-xs font-semibold transition-colors"
          >
            <SparkleIcon size={12} />
            Set as Active Job
          </button>
        </div>
      </div>
    </div>
  );
}
