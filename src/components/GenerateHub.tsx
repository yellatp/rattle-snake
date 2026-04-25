import { useState, useEffect, lazy, Suspense } from 'react';
import { getUserTemplates, deleteUserTemplate, type UserTemplate } from '../lib/userTemplates';
import UserTemplateUploader from './UserTemplateUploader';
import { DocIcon, CoverLetterIcon, TemplatesIcon, TrashIcon, SparkleIcon } from './ui/Icons';

const AIGeneratePanel   = lazy(() => import('./AIGeneratePanel'));
const CoverLetterManager = lazy(() => import('./CoverLetterManager'));

type Tab = 'resume' | 'cover-letter' | 'templates';

const TABS: { id: Tab; label: string; Icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { id: 'resume',        label: 'Resume',        Icon: SparkleIcon },
  { id: 'cover-letter',  label: 'Cover Letter',  Icon: CoverLetterIcon },
  { id: 'templates',     label: 'Templates',     Icon: TemplatesIcon },
];

interface BuiltInMeta {
  slug: string;
  role: string;
  category: string;
  hint: string;
  roles: number;
  skillCats: number;
}

const BUILT_IN: BuiltInMeta[] = [
  { slug: 'data_scientist',   role: 'Data Scientist',    category: 'Data & AI',    hint: 'ML models, experiments, business impact',          roles: 3, skillCats: 5 },
  { slug: 'data_analyst',     role: 'Data Analyst',      category: 'Data & AI',    hint: 'SQL, dashboards, stakeholder reporting',           roles: 3, skillCats: 5 },
  { slug: 'ml_engineer',      role: 'ML Engineer',       category: 'Data & AI',    hint: 'Production ML, feature pipelines, infra',          roles: 3, skillCats: 5 },
  { slug: 'ai_engineer',      role: 'AI Engineer',       category: 'Data & AI',    hint: 'LLMs, RAG, agent systems, evals',                  roles: 3, skillCats: 5 },
  { slug: 'product_analyst',  role: 'Product Analyst',   category: 'Product',      hint: 'Growth metrics, A/B testing, conversion funnels', roles: 3, skillCats: 4 },
  { slug: 'business_analyst', role: 'Business Analyst',  category: 'Business',     hint: 'Requirements, process improvement, stakeholders',  roles: 3, skillCats: 4 },
  { slug: 'swe',              role: 'Software Engineer', category: 'Engineering',  hint: 'Systems design, APIs, performance at scale',       roles: 3, skillCats: 5 },
  { slug: 'product_manager',  role: 'Product Manager',   category: 'Product',      hint: 'Roadmap, OKRs, cross-team delivery',               roles: 3, skillCats: 4 },
  { slug: 'devops',           role: 'DevOps Engineer',   category: 'Engineering',  hint: 'CI/CD, cloud, reliability, incident response',     roles: 3, skillCats: 5 },
];

const CATEGORY_ORDER = ['Data & AI', 'Product', 'Engineering', 'Business'];

function BuiltInCard({ t, onUse }: { t: BuiltInMeta; onUse: (slug: string) => void }) {
  return (
    <div className="group bg-slate-900 border border-slate-800 hover:border-slate-600 rounded-xl p-4 transition-all flex flex-col gap-3">
      <div>
        <div className="text-[10px] text-slate-600 font-mono uppercase tracking-widest mb-1">{t.category}</div>
        <div className="font-semibold text-slate-100 text-sm">{t.role}</div>
        <div className="text-xs text-slate-500 mt-1 leading-relaxed">{t.hint}</div>
      </div>
      <div className="flex items-center justify-between mt-auto">
        <div className="text-[10px] text-slate-700">
          {t.roles} roles · {t.skillCats} skill sets
        </div>
        <button
          type="button"
          onClick={() => onUse(t.slug)}
          className="text-[11px] font-medium text-blue-400 hover:text-blue-300 transition-colors
                     px-2.5 py-1 bg-blue-950/30 hover:bg-blue-950/60 rounded-lg border border-blue-900/30
                     hover:border-blue-700/40"
        >
          Use →
        </button>
      </div>
    </div>
  );
}

function CustomTemplateCard({ t, onDelete }: { t: UserTemplate; onDelete: (id: string) => void }) {
  return (
    <div className="bg-slate-900 border border-blue-900/30 rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <DocIcon size={13} className="text-blue-400 shrink-0" />
          <span className="text-[10px] text-blue-500 font-medium uppercase tracking-wider">Personal</span>
        </div>
        <button
          type="button"
          onClick={() => onDelete(t.id)}
          className="text-slate-700 hover:text-red-400 transition-colors shrink-0"
          title="Delete template"
        >
          <TrashIcon size={12} />
        </button>
      </div>
      <div>
        <div className="font-semibold text-slate-100 text-sm">{t.role}</div>
        <div className="text-xs text-slate-500 mt-0.5">{t.fileName}</div>
      </div>
      <div className="flex items-center justify-between">
        <div className="text-[10px] text-slate-700">
          {t.sections.experience.length} roles · {t.sections.skills.categories.length} skill sets
        </div>
        <button
          type="button"
          onClick={() => {
            sessionStorage.setItem('rs_pending_template', t.slug);
            const url = new URL(window.location.href);
            url.searchParams.set('tab', 'resume');
            window.location.href = url.toString();
          }}
          className="text-[11px] font-medium text-blue-400 hover:text-blue-300 transition-colors
                     px-2.5 py-1 bg-blue-950/30 hover:bg-blue-950/60 rounded-lg border border-blue-900/30"
        >
          Use →
        </button>
      </div>
    </div>
  );
}

function TemplatesManager() {
  const [custom, setCustom] = useState<UserTemplate[]>([]);
  const [showUploader, setShowUploader] = useState(false);

  useEffect(() => { setCustom(getUserTemplates()); }, []);

  const handleDelete = (id: string) => {
    deleteUserTemplate(id);
    setCustom(getUserTemplates());
  };

  const handleUseBuiltIn = (slug: string) => {
    sessionStorage.setItem('rs_pending_template', slug);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', 'resume');
    window.location.href = url.toString();
  };

  const handleUploaded = (tmpl: UserTemplate) => {
    setCustom(getUserTemplates());
    setShowUploader(false);
    sessionStorage.setItem('rs_pending_template', tmpl.slug);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', 'resume');
    window.location.href = url.toString();
  };

  const grouped = CATEGORY_ORDER.map(cat => ({
    category: cat,
    items: BUILT_IN.filter(t => t.category === cat),
  })).filter(g => g.items.length > 0);

  return (
    <div className="space-y-10">
      {/* Custom templates */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Your Templates</h2>
            <p className="text-xs text-slate-500 mt-0.5">Upload a .docx resume and Rattle-Snake parses it into a reusable template.</p>
          </div>
          <button
            type="button"
            onClick={() => setShowUploader(v => !v)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              showUploader
                ? 'bg-slate-800 text-slate-300'
                : 'bg-blue-600 hover:bg-blue-500 text-white'
            }`}
          >
            {showUploader ? 'Cancel' : '+ Upload .docx'}
          </button>
        </div>

        {showUploader && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <UserTemplateUploader onUploaded={handleUploaded} />
          </div>
        )}

        {custom.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {custom.map(t => (
              <CustomTemplateCard key={t.id} t={t} onDelete={handleDelete} />
            ))}
          </div>
        ) : !showUploader ? (
          <div className="bg-slate-900 border border-dashed border-slate-800 rounded-xl p-8 text-center">
            <DocIcon size={20} className="text-slate-700 mx-auto mb-3" />
            <p className="text-sm text-slate-500">No custom templates yet.</p>
            <p className="text-xs text-slate-700 mt-1">Upload a .docx to create a personalized base template.</p>
          </div>
        ) : null}
      </section>

      {/* Built-in templates */}
      <section className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Built-in Templates</h2>
          <p className="text-xs text-slate-500 mt-0.5">9 role-specific templates with hand-tuned AI prompts. Click Use to open in the Resume generator.</p>
        </div>

        {grouped.map(({ category, items }) => (
          <div key={category}>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3 font-mono">
              {category}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {items.map(t => (
                <BuiltInCard key={t.slug} t={t} onUse={handleUseBuiltIn} />
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

function TabSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map(i => (
        <div key={i} className="h-24 bg-slate-900 rounded-xl animate-pulse border border-slate-800" />
      ))}
    </div>
  );
}

export default function GenerateHub() {
  const [activeTab, setActiveTab] = useState<Tab>('resume');
  const [mounted, setMounted] = useState<Record<Tab, boolean>>({ resume: true, 'cover-letter': false, templates: false });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab') as Tab;
    if (tab && TABS.some(t => t.id === tab)) {
      setActiveTab(tab);
      setMounted(prev => ({ ...prev, [tab]: true }));
    }
  }, []);

  const switchTab = (tab: Tab) => {
    setActiveTab(tab);
    setMounted(prev => ({ ...prev, [tab]: true }));
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    window.history.pushState({}, '', url.toString());
  };

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="flex gap-1 bg-slate-900/60 border border-slate-800 rounded-xl p-1">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => switchTab(id)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === id
                ? 'bg-slate-700/80 text-slate-100 shadow-sm border border-slate-600/40'
                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
            }`}
          >
            <Icon size={13} className={activeTab === id ? 'text-blue-400' : 'text-slate-600'} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab panels — lazy-mounted, CSS-hidden once mounted */}
      <div className={activeTab === 'resume' ? '' : 'hidden'}>
        {mounted.resume && (
          <Suspense fallback={<TabSkeleton />}>
            <AIGeneratePanel />
          </Suspense>
        )}
      </div>

      <div className={activeTab === 'cover-letter' ? '' : 'hidden'}>
        {mounted['cover-letter'] && (
          <Suspense fallback={<TabSkeleton />}>
            <CoverLetterManager />
          </Suspense>
        )}
      </div>

      <div className={activeTab === 'templates' ? '' : 'hidden'}>
        {mounted.templates && <TemplatesManager />}
      </div>
    </div>
  );
}
