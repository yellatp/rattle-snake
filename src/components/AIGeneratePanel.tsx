import { useState, useRef, lazy, Suspense, useEffect } from 'react';
import { useAppStore, keyStore } from '../store/app';
import { useProfileStore } from '../store/profiles';
import { applyProfileToTemplate } from '../lib/profileUtils';
import { streamGenerateResume } from '../lib/ai/router';
import { DATA_SCIENTIST_SYSTEM_PROMPT } from '../lib/ai/prompts/data_scientist';
import { DATA_ANALYST_SYSTEM_PROMPT } from '../lib/ai/prompts/data_analyst';
import { ML_ENGINEER_SYSTEM_PROMPT } from '../lib/ai/prompts/ml_engineer';
import { SWE_SYSTEM_PROMPT } from '../lib/ai/prompts/swe';
import { PRODUCT_MANAGER_SYSTEM_PROMPT } from '../lib/ai/prompts/product_manager';
import { DEVOPS_SYSTEM_PROMPT } from '../lib/ai/prompts/devops';
import { AI_ENGINEER_SYSTEM_PROMPT } from '../lib/ai/prompts/ai_engineer';
import { PRODUCT_ANALYST_SYSTEM_PROMPT } from '../lib/ai/prompts/product_analyst';
import { BUSINESS_ANALYST_SYSTEM_PROMPT } from '../lib/ai/prompts/business_analyst';
import { getUserTemplates, type UserTemplate } from '../lib/userTemplates';
import { addRecentJD } from '../lib/db/queries';
import { useJobContext } from '../store/jobContext';
import JobContextBar from './JobContextBar';
import { extractJDKeywords, scoreResume, resumeToText } from '../lib/ats/scorer';
import {
  SparkleIcon, ArrowRightIcon, RefreshIcon, CheckIcon, CloseIcon, DocIcon,
  LockIcon, UnlockIcon, DownloadIcon, CoverLetterIcon,
} from './ui/Icons';
import { extractResumeJson } from '../lib/export/extract-json';

const DiffViewer = lazy(() => import('./DiffViewer'));
const ATSScorer = lazy(() => import('./ATSScorer'));

import dataSciTemplate from '../templates/data_scientist.json';
import dataAnalystTemplate from '../templates/data_analyst.json';
import mlEngineerTemplate from '../templates/ml_engineer.json';
import sweTemplate from '../templates/swe.json';
import pmTemplate from '../templates/product_manager.json';
import devopsTemplate from '../templates/devops.json';
import aiEngineerTemplate from '../templates/ai_engineer.json';
import productAnalystTemplate from '../templates/product_analyst.json';
import businessAnalystTemplate from '../templates/business_analyst.json';

const PROMPT_MAP: Record<string, string> = {
  data_scientist: DATA_SCIENTIST_SYSTEM_PROMPT,
  data_analyst: DATA_ANALYST_SYSTEM_PROMPT,
  ml_engineer: ML_ENGINEER_SYSTEM_PROMPT,
  swe: SWE_SYSTEM_PROMPT,
  product_manager: PRODUCT_MANAGER_SYSTEM_PROMPT,
  devops: DEVOPS_SYSTEM_PROMPT,
  ai_engineer: AI_ENGINEER_SYSTEM_PROMPT,
  product_analyst: PRODUCT_ANALYST_SYSTEM_PROMPT,
  business_analyst: BUSINESS_ANALYST_SYSTEM_PROMPT,
};

type SystemTemplate = typeof dataSciTemplate & { systemPrompt: string };

const SYSTEM_TEMPLATES: SystemTemplate[] = [
  { ...dataSciTemplate, systemPrompt: DATA_SCIENTIST_SYSTEM_PROMPT },
  { ...dataAnalystTemplate, systemPrompt: DATA_ANALYST_SYSTEM_PROMPT },
  { ...mlEngineerTemplate, systemPrompt: ML_ENGINEER_SYSTEM_PROMPT },
  { ...aiEngineerTemplate, systemPrompt: AI_ENGINEER_SYSTEM_PROMPT },
  { ...productAnalystTemplate, systemPrompt: PRODUCT_ANALYST_SYSTEM_PROMPT },
  { ...businessAnalystTemplate, systemPrompt: BUSINESS_ANALYST_SYSTEM_PROMPT },
  { ...sweTemplate, systemPrompt: SWE_SYSTEM_PROMPT },
  { ...pmTemplate, systemPrompt: PRODUCT_MANAGER_SYSTEM_PROMPT },
  { ...devopsTemplate, systemPrompt: DEVOPS_SYSTEM_PROMPT },
];

type AnyTemplate = SystemTemplate | (UserTemplate & { systemPrompt: string });

type Tone = 'conservative' | 'balanced' | 'aggressive';
type Step = 1 | 2 | 3 | 4;

const LOCKABLE_SECTIONS = ['summary', 'skills', 'experience', 'education', 'certifications'];

export default function AIGeneratePanel() {
  const { activeProvider, providers, addToast } = useAppStore();
  const { getActiveProfile } = useProfileStore();
  const { active: activeJob, setActive: setActiveJob } = useJobContext();

  const [step, setStep] = useState<Step>(1);
  const [selectedSlug, setSelectedSlug] = useState('');
  const [company, setCompany] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [tone, setTone] = useState<Tone>('balanced');
  const [lockedSections, setLockedSections] = useState<string[]>([]);
  const [userTemplates, setUserTemplates] = useState<UserTemplate[]>([]);

  const [generating, setGenerating] = useState(false);
  const [streamedText, setStreamedText] = useState('');
  const [tokensUsed, setTokensUsed] = useState(0);
  const [generatedContent, setGeneratedContent] = useState('');
  const [acceptedContent, setAcceptedContent] = useState('');
  const [includedSections, setIncludedSections] = useState<string[]>(
    ['summary', 'skills', 'experience', 'education', 'certifications']
  );

  // ATS iteration tracking
  const [atsScore, setAtsScore] = useState<number | null>(null);
  const [prevAtsScore, setPrevAtsScore] = useState<number | null>(null);
  const [iteration, setIteration] = useState(0);

  const streamRef = useRef<string>('');

  useEffect(() => {
    setUserTemplates(getUserTemplates());
    // Pre-select a template if the Templates tab sent us here
    const pending = sessionStorage.getItem('rs_pending_template');
    if (pending) {
      sessionStorage.removeItem('rs_pending_template');
      setSelectedSlug(pending);
      setStep(2);
    }
  }, []);

  // Auto-fill from active job context on mount — only if all fields are currently empty
  useEffect(() => {
    if (!activeJob) return;
    if (!company && !jobTitle && !jobDescription) {
      setCompany(activeJob.company);
      setJobTitle(activeJob.roleTitle);
      setJobDescription(activeJob.jobDescription);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally mount-only

  const allTemplates: AnyTemplate[] = [
    ...userTemplates.map(t => ({
      ...t,
      systemPrompt: PROMPT_MAP[t.system_prompt_ref] ?? DATA_SCIENTIST_SYSTEM_PROMPT,
    })),
    ...SYSTEM_TEMPLATES,
  ];

  const selectedTemplate = allTemplates.find(t => t.slug === selectedSlug);

  const toggleSection = (s: string) => {
    setIncludedSections(prev =>
      prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
    );
  };

  const excludedSections = LOCKABLE_SECTIONS.filter(s => !includedSections.includes(s));

  const toggleLock = (section: string) => {
    setLockedSections(prev =>
      prev.includes(section) ? prev.filter(s => s !== section) : [...prev, section]
    );
  };

  // baseContent: if provided, re-generates starting from a previous output (iterative ATS improvement)
  const handleGenerate = async (baseContent?: string) => {
    if (!selectedTemplate) { addToast('error', 'Select a template first'); return; }
    if (!jobDescription.trim()) { addToast('error', 'Enter a job description'); return; }

    const apiKey = keyStore.get(activeProvider);
    if (!apiKey) {
      addToast('error', `No API key for ${activeProvider}. Go to Settings.`);
      return;
    }

    setGenerating(true);
    setStreamedText('');
    // On ATS improvement runs (baseContent provided), keep the existing output visible
    // while streaming — only clear for a fresh generation to avoid blank canvas
    if (!baseContent) setGeneratedContent('');
    streamRef.current = '';

    try {
      const { systemPrompt: _sp, ...cleanTemplate } = selectedTemplate as typeof selectedTemplate & { systemPrompt?: string };

      // Inject active profile contact info on first run (not on ATS iteration re-runs)
      const activeProfile = getActiveProfile();
      const profiledTemplate = (!baseContent && activeProfile)
        ? applyProfileToTemplate(cleanTemplate as Record<string, unknown>, activeProfile)
        : cleanTemplate;

      // On re-runs, score the PREVIOUS output to get a fresh gap analysis.
      // On first run, score the base template.
      const contentToScore = baseContent ?? JSON.stringify(profiledTemplate);
      const templateForAI  = baseContent ?? JSON.stringify(profiledTemplate, null, 2);

      let matchedKeywords: string[] = [];
      let missingKeywords: string[] = [];
      try {
        if (jobDescription.trim()) {
          const jdKeywords = extractJDKeywords(jobDescription);
          const scoreText  = resumeToText(contentToScore);
          const atsResult  = scoreResume(scoreText, jobDescription, jdKeywords);
          matchedKeywords  = atsResult.matched.map(m => m.keyword);
          missingKeywords  = atsResult.missing.map(m => m.keyword);
        }
      } catch {
        // pre-scoring is best-effort — proceed with generation without gap analysis
      }

      const result = await streamGenerateResume(
        {
          templateContent: templateForAI,
          jobDescription,
          companyName: company || 'the company',
          jobTitle: jobTitle || selectedTemplate.role,
          tone,
          lockedSections,
          role: selectedTemplate.role,
          matchedKeywords,
          missingKeywords,
        },
        {
          provider: activeProvider,
          apiKey,
          model: providers[activeProvider].model,
        },
        selectedTemplate.systemPrompt,
        (chunk) => {
          streamRef.current += chunk;
          setStreamedText(streamRef.current);
        }
      );

      setTokensUsed(result.tokensUsed);
      const cleaned = extractResumeJson(streamRef.current);
      setGeneratedContent(cleaned);
      setStep(3); // advance immediately — scoring below is non-critical

      // Persist JD context so Interview Prep can pre-fill without copy-paste
      if (!baseContent && (company.trim() || jobTitle.trim() || jobDescription.trim())) {
        try {
          addRecentJD({
            company:      company.trim(),
            roleTitle:    jobTitle.trim() || selectedTemplate.role,
            jobDescription,
          });
        } catch { /* best-effort */ }
      }

      // Auto-score the new output so the UI can show live ATS delta
      try {
        if (jobDescription.trim() && cleaned.trim()) {
          const jdKws    = extractJDKeywords(jobDescription);
          const newScore = scoreResume(resumeToText(cleaned), jobDescription, jdKws);
          setPrevAtsScore(atsScore);
          setAtsScore(newScore.score);
          setIteration(prev => prev + 1);
        }
      } catch {
        // scoring is best-effort — never block the user from seeing their resume
      }
    } catch (e) {
      addToast('error', e instanceof Error ? e.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const handleAccept = (content: string) => {
    setAcceptedContent(content);
    setStep(4);
    addToast('success', 'Resume version accepted and saved');
  };

  const handleReject = () => {
    setGeneratedContent('');
    setStep(2);
  };

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {([1, 2, 3, 4] as Step[]).map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
              step === s ? 'bg-blue-600 text-white' :
              step > s ? 'bg-green-700 text-white' : 'bg-slate-800 text-slate-500'
            }`}>
              {step > s ? <CheckIcon size={10} /> : s}
            </div>
            <span className={`text-xs ${step === s ? 'text-slate-200' : 'text-slate-500'}`}>
              {['Template', 'Job Details', 'Review', 'Export'][s - 1]}
            </span>
            {s < 4 && <div className="w-6 h-px bg-slate-800" />}
          </div>
        ))}
      </div>

      {/* Step 1: Template selection */}
      {step === 1 && (
        <div className="space-y-5">
          <h2 className="text-lg font-semibold text-slate-100">Choose a Base Template</h2>

          {/* User templates */}
          {userTemplates.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                Your Templates
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
                {userTemplates.map((tmpl) => {
                  const t = { ...tmpl, systemPrompt: PROMPT_MAP[tmpl.system_prompt_ref] ?? DATA_SCIENTIST_SYSTEM_PROMPT };
                  return (
                    <button
                      key={t.slug}
                      type="button"
                      onClick={() => { setSelectedSlug(t.slug); setStep(2); }}
                      className={`p-4 rounded-xl border text-left transition-all ${
                        selectedSlug === t.slug
                          ? 'border-blue-500 bg-blue-950/30'
                          : 'border-blue-900/30 bg-slate-900 hover:border-blue-500/50 hover:bg-blue-950/10'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <DocIcon size={13} className="text-blue-400 shrink-0" />
                        <span className="text-[10px] text-blue-500 font-medium uppercase tracking-wider">Personal</span>
                      </div>
                      <div className="font-medium text-slate-100 text-sm">{t.role}</div>
                      <div className="text-xs text-slate-500 mt-1">
                        {t.sections.experience.length} roles · {t.sections.skills.categories.length} skill sets
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                Built-in Templates
              </div>
            </div>
          )}

          {/* System templates */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {SYSTEM_TEMPLATES.map((tmpl) => (
              <button
                key={tmpl.slug}
                type="button"
                onClick={() => { setSelectedSlug(tmpl.slug); setStep(2); }}
                className={`p-4 rounded-xl border text-left transition-all ${
                  selectedSlug === tmpl.slug
                    ? 'border-blue-500 bg-blue-950/30'
                    : 'border-slate-800 bg-slate-900 hover:border-slate-600'
                }`}
              >
                <div className="font-medium text-slate-100 text-sm">{tmpl.role}</div>
                <div className="text-xs text-slate-500 mt-1">
                  {tmpl.sections.experience.length} roles · {tmpl.sections.skills.categories.length} skill categories
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: Job details */}
      {step === 2 && selectedTemplate && (
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="text-slate-500 hover:text-slate-300 text-sm transition-colors"
            >
              Back
            </button>
            <span className="text-slate-700">/</span>
            <h2 className="text-lg font-semibold text-slate-100">Job Details — {selectedTemplate.role}</h2>
          </div>

          <JobContextBar
            company={company}
            roleTitle={jobTitle}
            jobDescription={jobDescription}
            onApply={(c, r, jd) => { setCompany(c); setJobTitle(r); setJobDescription(jd); }}
            onPin={() => setActiveJob({ company, roleTitle: jobTitle, jobDescription })}
          />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">
                Company Name
              </label>
              <input
                type="text" value={company} onChange={e => setCompany(e.target.value)}
                placeholder="e.g. Google, OpenAI..."
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm
                           text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500
                           focus:ring-1 focus:ring-blue-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">
                Job Title
              </label>
              <input
                type="text" value={jobTitle} onChange={e => setJobTitle(e.target.value)}
                placeholder={`e.g. Senior ${selectedTemplate.role}`}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm
                           text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500
                           focus:ring-1 focus:ring-blue-500 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">
              Job Description <span className="text-blue-500 normal-case font-normal">(required)</span>
            </label>
            <textarea
              value={jobDescription} onChange={e => setJobDescription(e.target.value)}
              placeholder="Paste the full job description here..."
              rows={10}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm
                         text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500
                         focus:ring-1 focus:ring-blue-500 resize-none transition-colors"
            />
          </div>

          {/* Tone selector */}
          <div>
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">
              Tone
            </label>
            <div className="flex gap-2">
              {(['conservative', 'balanced', 'aggressive'] as Tone[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTone(t)}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium capitalize transition-all ${
                    tone === t
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-600 mt-2">
              {tone === 'conservative' && 'Precise, measured language. Emphasizes stability and reliability.'}
              {tone === 'balanced' && 'Confident, clear language. Balances achievements with responsibilities.'}
              {tone === 'aggressive' && 'Bold, impact-focused. Quantifies everything aggressively.'}
            </p>
          </div>

          {/* Section locks */}
          <div>
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
              Lock Sections — AI will not modify locked sections
            </label>
            <div className="flex flex-wrap gap-2">
              {LOCKABLE_SECTIONS.map(sec => {
                const locked = lockedSections.includes(sec);
                return (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => toggleLock(sec)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs capitalize transition-all ${
                      locked
                        ? 'bg-amber-900/40 text-amber-400 border border-amber-800/40'
                        : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-transparent'
                    }`}
                  >
                    {locked
                      ? <LockIcon size={10} />
                      : <UnlockIcon size={10} />
                    }
                    {sec}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section visibility */}
          <div>
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
              Include Sections
            </label>
            <div className="flex flex-wrap gap-2">
              {(['summary', 'skills', 'education', 'certifications'] as const).map(sec => {
                const on = includedSections.includes(sec);
                return (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => toggleSection(sec)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs capitalize transition-all border ${
                      on
                        ? 'bg-slate-800 text-slate-200 border-slate-600'
                        : 'bg-transparent text-slate-600 border-slate-800 line-through'
                    }`}
                  >
                    {on ? <CheckIcon size={10} /> : <CloseIcon size={9} />}
                    {sec}
                  </button>
                );
              })}
              <span className="flex items-center px-3 py-1.5 text-xs text-slate-600 border border-transparent">
                Experience always included
              </span>
            </div>
            <p className="text-xs text-slate-700 mt-1">
              Excluded sections are hidden from exports — the AI still generates them in case you change your mind.
            </p>
          </div>

          <button
            type="button"
            onClick={() => handleGenerate()}
            disabled={generating || !jobDescription.trim()}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed
                       text-white rounded-xl font-medium text-sm transition-colors flex items-center justify-center gap-2"
          >
            {generating ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <SparkleIcon size={14} />
                Generate with {activeProvider}
              </>
            )}
          </button>

          {/* Streaming preview */}
          {generating && streamedText && (
            <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
              <div className="text-xs text-slate-500 mb-2">Streaming response...</div>
              <div className="text-xs font-mono text-slate-300 whitespace-pre-wrap max-h-40 overflow-y-auto streaming-cursor">
                {streamedText}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Diff review */}
      {step === 3 && generatedContent && selectedTemplate && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-slate-100">Review Changes</h2>
              {/* ATS score badge */}
              {atsScore !== null && (
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                  atsScore >= 70
                    ? 'bg-green-900/30 border-green-800/40 text-green-400'
                    : atsScore >= 50
                    ? 'bg-amber-900/30 border-amber-800/40 text-amber-400'
                    : 'bg-red-900/30 border-red-800/40 text-red-400'
                }`}>
                  ATS {atsScore}%
                  {prevAtsScore !== null && prevAtsScore !== atsScore && (
                    <span className={atsScore > prevAtsScore ? 'text-green-300' : 'text-red-300'}>
                      {atsScore > prevAtsScore ? ` ↑ +${atsScore - prevAtsScore}` : ` ↓ ${atsScore - prevAtsScore}`}
                    </span>
                  )}
                  {iteration > 1 && (
                    <span className="text-slate-500 ml-1">v{iteration}</span>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              {tokensUsed > 0 && <span>{tokensUsed.toLocaleString()} tokens</span>}
              {/* Improve ATS — only shown when score is below target */}
              {atsScore !== null && atsScore < 70 && (
                <button
                  type="button"
                  onClick={() => handleGenerate(generatedContent)}
                  disabled={generating}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500
                             disabled:opacity-50 text-white rounded-lg transition-colors font-medium"
                >
                  <SparkleIcon size={11} />
                  Improve ATS Score
                  {atsScore !== null && <span className="opacity-70">({atsScore}% → 70%+)</span>}
                </button>
              )}
              <button
                type="button"
                onClick={() => handleGenerate()}
                disabled={generating}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700
                           disabled:opacity-50 text-slate-300 rounded-lg transition-colors"
              >
                <RefreshIcon size={11} />
                Re-generate from scratch
              </button>
            </div>
          </div>

          {generating && (
            <div className="flex items-center gap-3 px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl">
              <span className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" />
              <span className="text-sm text-slate-300">
                {iteration > 0 ? 'Re-generating with improved keyword coverage...' : 'Generating resume...'}
              </span>
              {streamedText && (
                <span className="text-xs text-slate-600 font-mono ml-auto">
                  {streamedText.length} chars
                </span>
              )}
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <Suspense fallback={<div className="h-64 bg-slate-900 rounded-xl animate-pulse" />}>
                <DiffViewer
                  original={JSON.stringify(
                    (({ systemPrompt: _sp, ...t }) => t)(selectedTemplate as typeof selectedTemplate & { systemPrompt?: string }),
                    null, 2
                  )}
                  revised={generatedContent}
                  onAccept={handleAccept}
                  onReject={handleReject}
                  onEdit={handleAccept}
                />
              </Suspense>
            </div>
            <div>
              <Suspense fallback={<div className="h-48 bg-slate-900 rounded-xl animate-pulse" />}>
                <ATSScorer
                  resumeContent={generatedContent}
                  jobDescription={jobDescription}
                  templateKeywords={selectedTemplate.ats_keywords}
                />
              </Suspense>
            </div>
          </div>
        </div>
      )}

      {/* Step 4: Export */}
      {step === 4 && (
        <div className="space-y-5">
          <h2 className="text-lg font-semibold text-slate-100">Resume Ready</h2>

          <div className="grid grid-cols-2 gap-4">
            {/* Export panel */}
            <div className="space-y-4">
              <div className="bg-slate-900 rounded-xl border border-green-900/40 border-l-4 border-l-green-500 p-4">
                <div className="flex items-center gap-2 text-green-400 font-medium mb-0.5">
                  <CheckIcon size={13} />
                  Resume generated
                </div>
                <p className="text-xs text-slate-500">
                  {excludedSections.length > 0
                    ? `Exporting without: ${excludedSections.join(', ')}`
                    : 'All sections included in export'}
                </p>
              </div>
              <Suspense fallback={null}>
                <ExportMenu
                  content={acceptedContent}
                  role={selectedTemplate?.role ?? ''}
                  company={company}
                  excludedSections={excludedSections}
                />
              </Suspense>
            </div>

            {/* Cover letter panel */}
            <Suspense fallback={null}>
              <CoverLetterPanel
                resumeContent={acceptedContent}
                jobDescription={jobDescription}
                company={company}
                role={selectedTemplate?.role ?? jobTitle}
              />
            </Suspense>
          </div>

          <button
            type="button"
            onClick={() => {
              setStep(1); setSelectedSlug(''); setGeneratedContent('');
              setAtsScore(null); setPrevAtsScore(null); setIteration(0);
            }}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors"
          >
            Start New Resume
          </button>
        </div>
      )}
    </div>
  );
}

function ExportMenu({ content, role, company, excludedSections }: {
  content: string; role: string; company: string; excludedSections?: string[];
}) {
  const [exporting, setExporting] = useState<string | null>(null);
  const [pageFormat, setPageFormat] = useState<'letter' | 'a4'>('letter');
  const { addToast } = useAppStore();

  const handleExport = async (format: 'docx' | 'pdf' | 'txt') => {
    setExporting(format);
    try {
      const { exportToDocx, exportToPdf, exportToPlaintext } = await import('../lib/export/index');
      const opts = { excludedSections, pageFormat };
      if (format === 'docx') await exportToDocx(content, role, company, opts);
      else if (format === 'pdf') await exportToPdf(content, role, company, opts);
      else await exportToPlaintext(content, role, company, opts);
      addToast('success', `Exported as ${format.toUpperCase()}`);
    } catch (e) {
      addToast('error', `Export failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setExporting(null);
    }
  };

  const formats = [
    { id: 'docx' as const, label: 'DOCX', sub: 'Word Document' },
    { id: 'pdf' as const, label: 'PDF', sub: 'PDF File' },
    { id: 'txt' as const, label: 'TXT', sub: 'Plain Text' },
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* Page format selector (PDF / DOCX) */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-400 whitespace-nowrap">Page size</span>
        <select
          value={pageFormat}
          onChange={e => setPageFormat(e.target.value as 'letter' | 'a4')}
          aria-label="Page size"
          title="Page size"
          className="flex-1 bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-1.5
                     focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
        >
          <option value="letter">Letter (8.5 × 11 in) — US Standard</option>
          <option value="a4">A4 (210 × 297 mm) — International</option>
        </select>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {formats.map(({ id, label, sub }) => (
          <button
            key={id}
            type="button"
            onClick={() => handleExport(id)}
            disabled={!!exporting}
            className="flex flex-col items-center gap-2 p-4 bg-slate-900 hover:bg-slate-800 border border-slate-800
                       rounded-xl text-sm transition-all disabled:opacity-50 group"
          >
            {exporting === id ? (
              <span className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <DownloadIcon size={18} className="text-slate-500 group-hover:text-blue-400 transition-colors" />
            )}
            <span className="font-medium text-slate-200 uppercase text-xs">{label}</span>
            <span className="text-xs text-slate-500">{sub}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function sanitizeCoverLetter(text: string): string {
  return text
    .replace(/\s*—\s*/g, ', ')   // em-dash → comma
    .replace(/\s*–\s*/g, ', ')   // en-dash → comma
    .replace(/,\s*,/g, ',');     // clean up double-commas from replacements
}

// ── Inline cover letter generator (Step 4 right panel) ─────────────────────

function CoverLetterPanel({ resumeContent, jobDescription, company, role }: {
  resumeContent: string;
  jobDescription: string;
  company: string;
  role: string;
}) {
  const { activeProvider, providers, addToast } = useAppStore();
  const [generating, setGenerating] = useState(false);
  const [body, setBody] = useState('');
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    const apiKey = keyStore.get(activeProvider);
    if (!apiKey) { addToast('error', `No API key for ${activeProvider}`); return; }

    setGenerating(true);
    setBody('');
    let acc = '';

    try {
      const { buildCoverLetterPrompt, formatCandidateBackground } = await import('../lib/ai/prompts/cover_letter');
      const { streamGeneric } = await import('../lib/ai/router');

      let resumeJson: object = {};
      try {
        const { extractResumeJson } = await import('../lib/export/extract-json');
        resumeJson = JSON.parse(extractResumeJson(resumeContent));
      } catch { /* use empty */ }

      const background = formatCandidateBackground(resumeJson as Parameters<typeof formatCandidateBackground>[0]);
      const systemPrompt = buildCoverLetterPrompt(background);

      const userPrompt = `Template style: standard
Company: ${company || 'the company'}
Role: ${role}
Date: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}

Job Description:
${jobDescription}

Write a targeted cover letter following the system instructions.`.trim();

      await streamGeneric(
        { systemPrompt, userPrompt },
        { provider: activeProvider, apiKey, model: providers[activeProvider].model },
        (chunk) => { acc += chunk; }
      );

      const cleaned = acc.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      try {
        const parsed = JSON.parse(cleaned) as { body?: string };
        setBody(sanitizeCoverLetter(parsed.body ?? acc));
      } catch {
        setBody(sanitizeCoverLetter(acc));
      }
    } catch (e) {
      addToast('error', e instanceof Error ? e.message : 'Cover letter generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(body);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${role.replace(/\s+/g, '_')}_Cover_Letter.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <CoverLetterIcon size={14} className="text-slate-400" />
        <span className="text-sm font-semibold text-slate-200">Cover Letter</span>
        <span className="text-xs text-slate-600 ml-auto">Same resume data · same JD</span>
      </div>

      {!body && (
        <p className="text-xs text-slate-500">
          Generate a matching cover letter using the same resume and job description.
          No extra input needed.
        </p>
      )}

      {!body ? (
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-800 hover:bg-slate-700
                     text-slate-200 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        >
          {generating ? (
            <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Writing...</>
          ) : (
            <><SparkleIcon size={13} /> Generate Cover Letter</>
          )}
        </button>
      ) : (
        <div className="space-y-3">
          <div className="bg-slate-800 rounded-lg p-3 max-h-56 overflow-y-auto">
            <p className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">{body}</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                copied ? 'bg-green-700 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
              }`}
            >
              <CheckIcon size={11} />
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-slate-800 hover:bg-slate-700
                         text-slate-300 rounded-lg text-xs font-medium transition-colors"
            >
              <DownloadIcon size={11} />
              Download
            </button>
            <button
              type="button"
              onClick={() => { setBody(''); handleGenerate(); }}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-500 hover:text-slate-300
                         rounded-lg text-xs transition-colors"
              title="Regenerate"
            >
              <RefreshIcon size={11} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
