import { useState, useEffect } from 'react';
import { useAppStore, keyStore } from '../store/app';
import { callGeneric, streamGeneric } from '../lib/ai/router';
import { getApplications, createInterviewPrep, getInterviewPreps, getRecentJDs, type RecentJD } from '../lib/db/queries';
import { useJobContext } from '../store/jobContext';
import JobContextBar from './JobContextBar';
import type { Application } from '../lib/db/schema';
import { formatDistanceToNow } from 'date-fns';
import { QA_SYSTEM_PROMPT, buildQAPrompt } from '../lib/ai/prompts/qa';
import { SparkleIcon, CloseIcon, BriefcaseIcon, MessageIcon } from './ui/Icons';

// ── Types ────────────────────────────────────────────────────────────────────

interface PrepQuestion {
  question: string;
  type: 'behavioral' | 'technical' | 'role_specific' | 'case';
  difficulty: 'easy' | 'medium' | 'hard';
  framework: string;
  keyPoints: string[];
}

interface PrepTopic {
  name: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  questions: PrepQuestion[];
}

interface PipelineStage {
  id: string;
  name: string;
  description: string;
  tools: string[];
  skills: string[];
  outputs: string[];
}

interface WorkflowPipeline {
  title: string;
  description: string;
  stages: PipelineStage[];
}

interface SkillNode {
  skill: string;
  category: 'core' | 'supporting' | 'nice-to-have';
  realWorldApplication: string;
  depth: string;
}

interface MiniProject {
  title: string;
  description: string;
  skills: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimatedTime: string;
  outcomes: string;
}

interface PrepPlan {
  overview: string;
  sectorInsights: string;
  estimatedProcess: string;
  workflowPipeline: WorkflowPipeline;
  skillMap: SkillNode[];
  miniProjects: MiniProject[];
  topics: PrepTopic[];
}

interface SavedPrep {
  id: string;
  application_id?: string;
  plan: PrepPlan;
  roleTitle: string;
  company: string;
  jobDescription: string;
  created_at: string;
}

interface QAAnswer {
  question: string;
  answer: string;
}

// ── Style maps ────────────────────────────────────────────────────────────────

const TYPE_COLORS = {
  behavioral:   'bg-blue-900/40 text-blue-400 border-blue-800/40',
  technical:    'bg-purple-900/40 text-purple-400 border-purple-800/40',
  role_specific:'bg-amber-900/40 text-amber-400 border-amber-800/40',
  case:         'bg-emerald-900/40 text-emerald-400 border-emerald-800/40',
};

const DIFF_COLORS = {
  easy:   'text-green-400',
  medium: 'text-amber-400',
  hard:   'text-red-400',
};

const PRIORITY_DOT = { high: 'bg-red-400', medium: 'bg-amber-400', low: 'bg-slate-500' };

const SKILL_CAT_STYLES = {
  core:            'border-blue-500/60 bg-blue-950/30 text-blue-300',
  supporting:      'border-amber-500/40 bg-amber-950/20 text-amber-300',
  'nice-to-have':  'border-slate-700 bg-slate-800/50 text-slate-400',
};

const PROJ_DIFF_STYLES = {
  beginner:     'bg-green-900/30 text-green-400',
  intermediate: 'bg-amber-900/30 text-amber-400',
  advanced:     'bg-red-900/30 text-red-400',
};

// ── Split prompts (parallel calls) ───────────────────────────────────────────

// Call A — workflow analysis: overview, pipeline, skill map, projects (~3-4KB output)
const STRUCTURE_SYSTEM_PROMPT = `
You are a senior career coach and domain expert with deep knowledge of hiring across tech, finance, healthcare, consulting, and marketing.

Given a company, role, and JD, generate a JSON object. Output ONLY valid JSON — no prose, no markdown. Start with "{" and end with "}".

{
  "overview": "2-3 sentences: typical round structure, panel composition, culture signals from JD",
  "sectorInsights": "1-2 sentences: known interview patterns for this role/sector, common traps, what interviewers emphasize",
  "estimatedProcess": "e.g. Recruiter screen → 2× Technical → Behavioral panel → Offer",
  "workflowPipeline": {
    "title": "Role-specific pipeline title (e.g. 'Healthcare Data Analytics Pipeline')",
    "description": "1 sentence: what actual day-to-day work looks like",
    "stages": [
      {"id":"1","name":"Stage name","description":"What happens here specific to this role","tools":["tool1"],"skills":["skill1"],"outputs":["output1"]}
    ]
  },
  "skillMap": [
    {"skill":"Skill","category":"core","realWorldApplication":"1 sentence: how used day-to-day in this exact role","depth":"Expected depth (e.g. Expert: window functions, CTEs)"}
  ],
  "miniProjects": [
    {"title":"Project title","description":"What to build — specific enough to start immediately","skills":["skill1"],"difficulty":"intermediate","estimatedTime":"1 week","outcomes":"What you learn and can show interviewers"}
  ]
}

Rules:
- workflowPipeline: 4-6 stages reflecting the ACTUAL workflow for this specific role (healthcare vs marketing vs FP&A pipelines differ)
- skillMap: 8-12 skills from JD, category = "core" | "supporting" | "nice-to-have"
- miniProjects: exactly 3-4 projects, specific enough to Google and start. Mention real public datasets or APIs
- sectorInsights: cite real patterns (e.g. "FP&A roles include Excel/model case studies")
`.trim();

// Call B — interview questions: topics array only (~3-4KB output)
const QUESTIONS_SYSTEM_PROMPT = `
You are an expert technical interviewer with deep knowledge of hiring patterns across sectors.

Given a company, role, and JD, generate interview topics and questions. Output ONLY valid JSON — no prose, no markdown. Start with "{" and end with "}".

{
  "topics": [
    {
      "name": "Topic name",
      "description": "1 sentence: why this appears and depth expected",
      "priority": "high",
      "questions": [
        {
          "question": "Question as interviewer would ask it",
          "type": "behavioral",
          "difficulty": "medium",
          "framework": "1-2 sentence answer framework (STAR, CAR, etc.)",
          "keyPoints": ["key point 1","key point 2","key point 3"]
        }
      ]
    }
  ]
}

Rules:
- Generate exactly 6-8 topics, 2-3 questions each (15-20 total — keep it tight)
- priority: "high" = explicitly required in JD, "medium" = useful, "low" = general/culture
- type: "behavioral" | "technical" | "role_specific" | "case"
- difficulty: "easy" | "medium" | "hard"
- Include at least 1 case/scenario question if role involves decisions or product sense
`.trim();

function buildRoleContext(company: string, roleTitle: string, jobDescription: string): string {
  return `Company: ${company || 'the company'}
Role: ${roleTitle || 'Analyst'}
Job Description:
${jobDescription || 'A senior analytical role requiring strong data skills and business acumen.'}`.trim();
}

// ── JSON extraction with fallback ─────────────────────────────────────────────

function extractJson<T>(raw: string): T {
  const start = raw.indexOf('{');
  const end   = raw.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object found in response');
  return JSON.parse(raw.slice(start, end + 1)) as T;
}

// ── Markdown export ───────────────────────────────────────────────────────────

function planToMarkdown(plan: PrepPlan, company: string, roleTitle: string, jobDescription: string): string {
  const now = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const totalQ = plan.topics?.reduce((s, t) => s + (t.questions?.length ?? 0), 0) ?? 0;
  const label = [company, roleTitle].filter(Boolean).join(' — ');

  const lines: string[] = [
    `# Interview Prep Plan`,
    `## ${label}`,
    `_Generated ${now} · ${plan.topics?.length ?? 0} topics · ${totalQ} questions_`,
    '',
    '---',
    '',
    '## Overview',
    plan.overview ?? '',
    '',
    '### Expected Process',
    plan.estimatedProcess ?? '',
    '',
    '### Sector & Role Patterns',
    plan.sectorInsights ?? '',
    '',
    '---',
    '',
  ];

  // Workflow pipeline
  if (plan.workflowPipeline?.stages?.length) {
    lines.push(`## ${plan.workflowPipeline.title}`);
    lines.push(`_${plan.workflowPipeline.description}_`);
    lines.push('');
    plan.workflowPipeline.stages.forEach((stage, i) => {
      lines.push(`### Stage ${i + 1}: ${stage.name}`);
      lines.push(stage.description);
      if (stage.tools?.length)   lines.push(`**Tools:** ${stage.tools.join(', ')}`);
      if (stage.skills?.length)  lines.push(`**Skills:** ${stage.skills.join(', ')}`);
      if (stage.outputs?.length) lines.push(`**Outputs:** ${stage.outputs.join(', ')}`);
      lines.push('');
    });
    lines.push('---', '');
  }

  // Skill map
  if (plan.skillMap?.length) {
    lines.push('## Skill Map');
    lines.push('');
    const core = plan.skillMap.filter(s => s.category === 'core');
    const sup  = plan.skillMap.filter(s => s.category === 'supporting');
    const nth  = plan.skillMap.filter(s => s.category === 'nice-to-have');
    [['Core Required', core], ['Supporting', sup], ['Nice-to-Have', nth]].forEach(([label, skills]) => {
      if ((skills as SkillNode[]).length) {
        lines.push(`### ${label as string}`);
        (skills as SkillNode[]).forEach(s => {
          lines.push(`**${s.skill}** — ${s.depth}`);
          lines.push(`> ${s.realWorldApplication}`);
          lines.push('');
        });
      }
    });
    lines.push('---', '');
  }

  // Mini projects
  if (plan.miniProjects?.length) {
    lines.push('## Practice Projects');
    lines.push('');
    plan.miniProjects.forEach((p, i) => {
      lines.push(`### Project ${i + 1}: ${p.title}`);
      lines.push(`**Difficulty:** ${p.difficulty} · **Time:** ${p.estimatedTime}`);
      lines.push('');
      lines.push(p.description);
      lines.push('');
      if (p.skills?.length) lines.push(`**Skills:** ${p.skills.join(', ')}`);
      lines.push(`**What you'll demonstrate:** ${p.outcomes}`);
      lines.push('');
    });
    lines.push('---', '');
  }

  // Topic pipeline
  lines.push('## Interview Topics');
  lines.push('');
  plan.topics?.forEach((topic, ti) => {
    const dot = topic.priority === 'high' ? '[HIGH]' : topic.priority === 'medium' ? '[MED]' : '[LOW]';
    lines.push(`### ${ti + 1}. ${dot} ${topic.name}`);
    lines.push(`_Priority: ${topic.priority} · ${topic.description}_`);
    lines.push('');
    topic.questions?.forEach((q, qi) => {
      lines.push(`**Q${qi + 1}. ${q.question}**`);
      lines.push(`> ${q.type.replace('_', ' ')} · ${q.difficulty}`);
      lines.push('');
      lines.push(`**Framework:** ${q.framework}`);
      if (q.keyPoints?.length) {
        lines.push('');
        lines.push('**Key Points:**');
        q.keyPoints.forEach(pt => lines.push(`- ${pt}`));
      }
      lines.push('');
    });
    lines.push('---', '');
  });

  if (jobDescription) {
    lines.push('## Original Job Description', '```', jobDescription, '```');
  }

  return lines.join('\n');
}

function downloadMarkdown(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PlanOverview({ plan, company, roleTitle }: { plan: PrepPlan; company: string; roleTitle: string }) {
  const totalQ = plan.topics?.reduce((s, t) => s + (t.questions?.length ?? 0), 0) ?? 0;
  const highCount = plan.topics?.filter(t => t.priority === 'high').length ?? 0;

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-5 space-y-4">
      {(company || roleTitle) && (
        <div>
          <h2 className="text-base font-semibold text-slate-100">
            {[company, roleTitle].filter(Boolean).join(' — ')}
          </h2>
        </div>
      )}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-800/60 rounded-lg p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Questions</div>
          <div className="text-2xl font-bold text-slate-100">{totalQ}</div>
        </div>
        <div className="bg-slate-800/60 rounded-lg p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Topics</div>
          <div className="text-2xl font-bold text-slate-100">{plan.topics?.length ?? 0}</div>
        </div>
        <div className="bg-red-950/40 border border-red-900/30 rounded-lg p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-red-500 mb-1">High Priority</div>
          <div className="text-2xl font-bold text-red-400">{highCount}</div>
        </div>
      </div>
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">What to Expect</div>
        <p className="text-sm text-slate-300 leading-relaxed">{plan.overview}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-blue-950/20 border border-blue-900/30 rounded-lg p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-400 mb-1">Process</div>
          <p className="text-xs text-slate-300">{plan.estimatedProcess}</p>
        </div>
        <div className="bg-amber-950/20 border border-amber-900/30 rounded-lg p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-400 mb-1">Sector Patterns</div>
          <p className="text-xs text-slate-300">{plan.sectorInsights}</p>
        </div>
      </div>
    </div>
  );
}

function WorkflowPipelineView({ pipeline }: { pipeline: WorkflowPipeline }) {
  const [activeStage, setActiveStage] = useState<string | null>(null);

  if (!pipeline?.stages?.length) return null;

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-5">
      <div className="mb-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
          Work Pipeline
        </div>
        <h3 className="text-sm font-semibold text-slate-100">{pipeline.title}</h3>
        <p className="text-xs text-slate-500 mt-0.5">{pipeline.description}</p>
      </div>

      {/* Stage flow — horizontal scroll */}
      <div className="overflow-x-auto pb-2">
        <div className="flex items-start gap-0 min-w-max">
          {pipeline.stages.map((stage, i) => (
            <div key={stage.id} className="flex items-start">
              <button
                type="button"
                onClick={() => setActiveStage(activeStage === stage.id ? null : stage.id)}
                className={`w-36 rounded-lg border p-3 text-left transition-all ${
                  activeStage === stage.id
                    ? 'border-blue-500/60 bg-blue-950/30'
                    : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                }`}
              >
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Step {i + 1}
                </div>
                <div className="text-xs font-semibold text-slate-200 leading-tight">{stage.name}</div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {stage.tools?.slice(0, 3).map(t => (
                    <span key={t} className="text-[9px] px-1 py-0.5 rounded bg-slate-700 text-slate-400">{t}</span>
                  ))}
                </div>
              </button>
              {i < pipeline.stages.length - 1 && (
                <div className="flex items-center px-1 mt-5 shrink-0">
                  <div className="w-3 h-px bg-slate-600" />
                  <span className="text-slate-600 text-[10px]">▶</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Expanded stage detail */}
      {activeStage && (() => {
        const stage = pipeline.stages.find(s => s.id === activeStage);
        if (!stage) return null;
        return (
          <div className="mt-4 rounded-lg border border-blue-900/40 bg-blue-950/15 p-4 space-y-3">
            <div className="flex items-start justify-between">
              <h4 className="text-sm font-semibold text-slate-100">{stage.name}</h4>
              <button type="button" onClick={() => setActiveStage(null)} title="Close" className="text-slate-600 hover:text-slate-400"><CloseIcon size={12} /></button>
            </div>
            <p className="text-xs text-slate-300">{stage.description}</p>
            <div className="grid grid-cols-3 gap-3">
              {stage.tools?.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-400 mb-1.5">Tools</div>
                  <div className="flex flex-wrap gap-1">
                    {stage.tools.map(t => (
                      <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-blue-900/40 text-blue-300 border border-blue-800/40">{t}</span>
                    ))}
                  </div>
                </div>
              )}
              {stage.skills?.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-purple-400 mb-1.5">Skills Applied</div>
                  <div className="flex flex-wrap gap-1">
                    {stage.skills.map(s => (
                      <span key={s} className="text-[10px] px-2 py-0.5 rounded-full bg-purple-900/30 text-purple-300 border border-purple-800/30">{s}</span>
                    ))}
                  </div>
                </div>
              )}
              {stage.outputs?.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 mb-1.5">Outputs</div>
                  <div className="space-y-0.5">
                    {stage.outputs.map(o => (
                      <div key={o} className="text-[10px] text-emerald-300 flex items-center gap-1">
                        <span className="text-emerald-600">▸</span> {o}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function SkillMapView({ skills }: { skills: SkillNode[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (!skills?.length) return null;

  const core = skills.filter(s => s.category === 'core');
  const supporting = skills.filter(s => s.category === 'supporting');
  const niceToHave = skills.filter(s => s.category === 'nice-to-have');

  const SkillBubble = ({ skill }: { skill: SkillNode }) => (
    <button
      type="button"
      onClick={() => setExpanded(expanded === skill.skill ? null : skill.skill)}
      className={`text-left rounded-lg border px-3 py-2 transition-all text-xs font-medium ${SKILL_CAT_STYLES[skill.category]} ${
        expanded === skill.skill ? 'ring-1 ring-blue-500/40' : 'hover:opacity-90'
      }`}
    >
      <div className="font-semibold">{skill.skill}</div>
      {expanded === skill.skill && (
        <div className="mt-2 space-y-1">
          <div className="text-[10px] opacity-80 leading-relaxed">{skill.realWorldApplication}</div>
          <div className="text-[10px] opacity-60 italic">{skill.depth}</div>
        </div>
      )}
    </button>
  );

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-5 space-y-4">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Skill Map</div>
        <p className="text-xs text-slate-500">Click any skill to see how it's applied in this exact role.</p>
      </div>
      <div className="flex gap-3 text-[10px] text-slate-500 flex-wrap">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500/60 inline-block" /> Core required</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500/50 inline-block" /> Supporting</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-600 inline-block" /> Nice-to-have</span>
      </div>
      {core.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-400 mb-2">Core Required</div>
          <div className="flex flex-wrap gap-2">
            {core.map(s => <SkillBubble key={s.skill} skill={s} />)}
          </div>
        </div>
      )}
      {supporting.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-400 mb-2">Supporting Skills</div>
          <div className="flex flex-wrap gap-2">
            {supporting.map(s => <SkillBubble key={s.skill} skill={s} />)}
          </div>
        </div>
      )}
      {niceToHave.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Nice-to-Have</div>
          <div className="flex flex-wrap gap-2">
            {niceToHave.map(s => <SkillBubble key={s.skill} skill={s} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function MiniProjectsView({ projects }: { projects: MiniProject[] }) {
  if (!projects?.length) return null;
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-5">
      <div className="mb-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Practice Projects</div>
        <p className="text-xs text-slate-500">
          Build these to get hands-on with the expected workflow before the interview.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3">
        {projects.map((p, i) => (
          <div key={i} className="rounded-lg border border-slate-800 bg-slate-800/40 p-4">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-slate-600 text-xs font-mono">#{String(i + 1).padStart(2, '0')}</span>
                <h4 className="text-sm font-semibold text-slate-100">{p.title}</h4>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${PROJ_DIFF_STYLES[p.difficulty]}`}>
                  {p.difficulty}
                </span>
                <span className="text-[10px] text-slate-500 bg-slate-700 px-2 py-0.5 rounded-full whitespace-nowrap">
                  {p.estimatedTime}
                </span>
              </div>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed mb-3">{p.description}</p>
            <div className="flex items-start gap-4 flex-wrap">
              {p.skills?.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Skills</div>
                  <div className="flex flex-wrap gap-1">
                    {p.skills.map(s => (
                      <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">{s}</span>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-500 mb-1">What you'll demonstrate</div>
                <p className="text-xs text-emerald-300/80">{p.outcomes}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TopicBlock({ topic, index }: { topic: PrepTopic; index: number }) {
  const [expanded, setExpanded] = useState(topic.priority === 'high');
  const [expandedQ, setExpandedQ] = useState<number | null>(null);

  return (
    <div className={`rounded-xl border overflow-hidden ${
      topic.priority === 'high'   ? 'border-red-900/40 bg-red-950/5' :
      topic.priority === 'medium' ? 'border-amber-900/30 bg-amber-950/5' :
                                    'border-slate-800 bg-slate-900'
    }`}>
      <button type="button" onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-800/30 transition-colors">
        <span className="text-slate-500 text-xs font-mono w-4 shrink-0">{String(index + 1).padStart(2, '0')}</span>
        <div className={`w-2 h-2 rounded-full shrink-0 ${PRIORITY_DOT[topic.priority]}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm text-slate-100">{topic.name}</span>
            <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${
              topic.priority === 'high'   ? 'text-red-400 bg-red-900/30' :
              topic.priority === 'medium' ? 'text-amber-400 bg-amber-900/30' :
                                            'text-slate-500 bg-slate-800'
            }`}>{topic.priority}</span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5 truncate">{topic.description}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-slate-500">{topic.questions?.length ?? 0}q</span>
          <span className="text-slate-600 text-xs">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-800/60 divide-y divide-slate-800/40">
          {topic.questions?.map((q, qi) => (
            <div key={qi}>
              <button type="button" onClick={() => setExpandedQ(expandedQ === qi ? null : qi)}
                className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-slate-800/20 transition-colors">
                <span className="text-slate-600 text-[10px] font-mono w-4 shrink-0 mt-0.5">
                  {String(qi + 1).padStart(2, '0')}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${TYPE_COLORS[q.type] ?? TYPE_COLORS.technical}`}>
                      {q.type.replace('_', ' ')}
                    </span>
                    <span className={`text-[10px] font-medium ${DIFF_COLORS[q.difficulty]}`}>{q.difficulty}</span>
                  </div>
                  <p className="text-sm text-slate-200">{q.question}</p>
                </div>
                <span className="text-slate-600 text-xs shrink-0">{expandedQ === qi ? '▲' : '▼'}</span>
              </button>
              {expandedQ === qi && (
                <div className="px-4 pb-4 pl-11 space-y-2.5">
                  <div className="bg-blue-950/20 border border-blue-900/30 rounded-lg p-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-400 mb-1">Answer Framework</div>
                    <p className="text-xs text-slate-300">{q.framework}</p>
                  </div>
                  {q.keyPoints?.length > 0 && (
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Key Points</div>
                      <ul className="space-y-1">
                        {q.keyPoints.map((pt, pi) => (
                          <li key={pi} className="flex items-start gap-2 text-xs text-slate-400">
                            <span className="text-blue-500 shrink-0 mt-0.5">▸</span> {pt}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Plan tabs ─────────────────────────────────────────────────────────────────

type PlanTab = 'overview' | 'pipeline' | 'skills' | 'projects' | 'questions';

const PLAN_TABS: { id: PlanTab; label: string }[] = [
  { id: 'overview',  label: 'Overview' },
  { id: 'pipeline',  label: 'Work Pipeline' },
  { id: 'skills',    label: 'Skill Map' },
  { id: 'projects',  label: 'Projects' },
  { id: 'questions', label: 'Questions' },
];

function PlanView({
  plan, company, roleTitle, jobDescription, onDownload,
}: {
  plan: PrepPlan; company: string; roleTitle: string;
  jobDescription: string; onDownload: () => void;
}) {
  const [activeTab, setActiveTab] = useState<PlanTab>('overview');
  const [filterPriority, setFilterPriority] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const filteredTopics = plan.topics?.filter(t => filterPriority === 'all' || t.priority === filterPriority) ?? [];

  return (
    <div className="space-y-4">
      {/* Tabs + download */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-0.5 bg-slate-800 rounded-lg p-1">
          {PLAN_TABS.map(t => (
            <button key={t.id} type="button" onClick={() => setActiveTab(t.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === t.id ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={onDownload}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200
                     rounded-lg text-xs transition-colors">
          ↓ Download .md
        </button>
      </div>

      {activeTab === 'overview'  && <PlanOverview plan={plan} company={company} roleTitle={roleTitle} />}
      {activeTab === 'pipeline'  && <WorkflowPipelineView pipeline={plan.workflowPipeline} />}
      {activeTab === 'skills'    && <SkillMapView skills={plan.skillMap} />}
      {activeTab === 'projects'  && <MiniProjectsView projects={plan.miniProjects} />}
      {activeTab === 'questions' && (
        <div className="space-y-3">
          <div className="flex gap-1.5 flex-wrap">
            {(['all', 'high', 'medium', 'low'] as const).map(p => (
              <button key={p} type="button" onClick={() => setFilterPriority(p)}
                className={`px-3 py-1 rounded-lg text-xs capitalize transition-colors ${
                  filterPriority === p ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}>
                {p === 'all' ? `All (${plan.topics?.length ?? 0})` : `${p} (${plan.topics?.filter(t => t.priority === p).length ?? 0})`}
              </button>
            ))}
          </div>
          {filteredTopics.map((topic, i) => (
            <TopicBlock key={i} topic={topic} index={plan.topics?.indexOf(topic) ?? i} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function InterviewPrep() {
  const { activeProvider, providers, addToast, userBio } = useAppStore();
  const { active: activeJob, setActive: setActiveJob } = useJobContext();
  const [applications, setApplications] = useState<Application[]>([]);
  const [savedPreps, setSavedPreps] = useState<SavedPrep[]>([]);
  const [tab, setTab] = useState<'plan' | 'answer'>('plan');

  const [selectedApp, setSelectedApp] = useState('');
  const [company, setCompany] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [roleTitle, setRoleTitle] = useState('');
  const [recentJDs, setRecentJDs] = useState<RecentJD[]>([]);
  const [showRecent, setShowRecent] = useState(false);
  const [plan, setPlan] = useState<PrepPlan | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genPhase, setGenPhase] = useState<{ a: 'idle'|'running'|'done'|'error'; b: 'idle'|'running'|'done'|'error' }>({ a: 'idle', b: 'idle' });

  const [qaQuestions, setQaQuestions] = useState('');
  const [qaJobDesc, setQaJobDesc] = useState('');
  const [qaAnswers, setQaAnswers] = useState<QAAnswer[]>([]);
  const [qaGenerating, setQaGenerating] = useState(false);
  const [qaStream, setQaStream] = useState('');
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  // Auto-fill from active job on mount — only if all fields are empty
  useEffect(() => {
    if (activeJob && !company && !roleTitle && !jobDescription) {
      setCompany(activeJob.company);
      setRoleTitle(activeJob.roleTitle);
      setJobDescription(activeJob.jobDescription);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount-only

  useEffect(() => {
    setApplications(getApplications());
    setRecentJDs(getRecentJDs());
    const raw = getInterviewPreps();
    const parsed: SavedPrep[] = raw.flatMap(p => {
      try {
        const data = JSON.parse(p.questions);
        if (Array.isArray(data)) return [];
        return [{
          id: p.id,
          application_id: p.application_id ?? undefined,
          plan: data as PrepPlan,
          roleTitle: (data as { roleTitle?: string }).roleTitle ?? '',
          company: (data as { company?: string }).company ?? '',
          jobDescription: (data as { jobDescription?: string }).jobDescription ?? '',
          created_at: p.created_at,
        }];
      } catch { return []; }
    });
    setSavedPreps(parsed);
  }, []);

  const handleAppSelect = (appId: string) => {
    setSelectedApp(appId);
    const app = applications.find(a => a.id === appId);
    if (app) {
      setJobDescription(app.jd_text);
      setRoleTitle(app.role);
      setCompany(app.company);
    }
  };

  const handleGenerate = async () => {
    if (!jobDescription.trim() && !roleTitle.trim()) {
      addToast('error', 'Enter a role title or job description');
      return;
    }
    const apiKey = keyStore.get(activeProvider);
    if (!apiKey) { addToast('error', `No API key for ${activeProvider}`); return; }

    setGenerating(true);
    setPlan(null);
    setGenPhase({ a: 'running', b: 'running' });

    const settings = { provider: activeProvider, apiKey, model: providers[activeProvider].model };
    const context  = buildRoleContext(company, roleTitle, jobDescription);

    type StructureResult = Omit<PrepPlan, 'topics'>;
    type QuestionsResult = { topics: PrepTopic[] };

    // Run both calls in parallel — each is ~3-4KB, well within 8192 token limit
    const [structRes, questRes] = await Promise.allSettled([
      callGeneric({ systemPrompt: STRUCTURE_SYSTEM_PROMPT, userPrompt: context }, settings)
        .then(r => { setGenPhase(p => ({ ...p, a: 'done' })); return r; })
        .catch(e => { setGenPhase(p => ({ ...p, a: 'error' })); throw e; }),
      callGeneric({ systemPrompt: QUESTIONS_SYSTEM_PROMPT, userPrompt: context }, settings)
        .then(r => { setGenPhase(p => ({ ...p, b: 'done' })); return r; })
        .catch(e => { setGenPhase(p => ({ ...p, b: 'error' })); throw e; }),
    ]);

    try {
      if (structRes.status === 'rejected') throw new Error(`Structure: ${structRes.reason}`);
      if (questRes.status  === 'rejected') throw new Error(`Questions: ${questRes.reason}`);

      const structure = extractJson<StructureResult>(structRes.value.text);
      const questions = extractJson<QuestionsResult>(questRes.value.text);

      const parsed: PrepPlan = {
        overview:         structure.overview         ?? '',
        sectorInsights:   structure.sectorInsights   ?? '',
        estimatedProcess: structure.estimatedProcess ?? '',
        workflowPipeline: structure.workflowPipeline ?? { title: '', description: '', stages: [] },
        skillMap:         structure.skillMap         ?? [],
        miniProjects:     structure.miniProjects      ?? [],
        topics:           questions.topics            ?? [],
      };

      setPlan(parsed);

      const savePayload = { ...parsed, roleTitle, company, jobDescription };
      const prep = createInterviewPrep({
        application_id: selectedApp || undefined,
        questions: JSON.stringify(savePayload),
      });
      setSavedPreps(prev => [{
        id: prep.id, application_id: prep.application_id ?? undefined,
        plan: parsed, roleTitle, company, jobDescription, created_at: prep.created_at,
      }, ...prev]);

      const total = parsed.topics.reduce((s, t) => s + (t.questions?.length ?? 0), 0);
      addToast('success', `Prep plan ready — ${parsed.topics.length} topics · ${total} questions`);
    } catch (e) {
      addToast('error', e instanceof Error ? e.message : 'Generation failed — try again');
    } finally {
      setGenerating(false);
      setGenPhase({ a: 'idle', b: 'idle' });
    }
  };

  const handleDownload = () => {
    if (!plan) return;
    const md = planToMarkdown(plan, company, roleTitle, jobDescription);
    const parts = [slugify(company), slugify(roleTitle)].filter(Boolean);
    const filename = parts.length ? `${parts.join('-')}-prep-plan.md` : 'prep-plan.md';
    downloadMarkdown(md, filename);
    addToast('success', `Downloaded ${filename}`);
  };

  const handleAnswerQuestions = async () => {
    const qs = qaQuestions.split('\n').map(s => s.trim()).filter(Boolean);
    if (qs.length === 0) { addToast('error', 'Paste at least one question'); return; }
    if (!userBio.trim()) addToast('warning', 'Add your story in Settings for personalized answers');
    const apiKey = keyStore.get(activeProvider);
    if (!apiKey) { addToast('error', `No API key for ${activeProvider}`); return; }

    setQaGenerating(true); setQaStream(''); setQaAnswers([]);
    let acc = '';

    try {
      await streamGeneric(
        { systemPrompt: QA_SYSTEM_PROMPT, userPrompt: buildQAPrompt(qs, userBio, undefined, qaJobDesc) },
        { provider: activeProvider, apiKey, model: providers[activeProvider].model },
        (chunk) => { acc += chunk; setQaStream(acc); }
      );
      const cleaned = acc.replace(/^[^{]*/, '').replace(/[^}]*$/, '');
      const parsed = JSON.parse(cleaned) as { answers: QAAnswer[] };
      setQaAnswers(parsed.answers ?? []);
      addToast('success', `${parsed.answers?.length ?? 0} answers generated`);
    } catch {
      addToast('error', 'Failed to parse answers — try again');
    } finally {
      setQaGenerating(false); setQaStream('');
    }
  };

  const copyAnswer = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1500);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-100">Interview Prep</h2>
        <div className="flex gap-1 bg-slate-800 rounded-lg p-1">
          <button type="button" onClick={() => setTab('plan')}
            className={`px-4 py-1.5 rounded-md text-sm transition-colors ${tab === 'plan' ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}>
            Prep Plan
          </button>
          <button type="button" onClick={() => setTab('answer')}
            className={`px-4 py-1.5 rounded-md text-sm transition-colors ${tab === 'answer' ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}>
            Answer Questions
          </button>
        </div>
      </div>

      {/* ── Prep Plan ─────────────────────────────────────────────────────────── */}
      {tab === 'plan' && (
        <div className="grid grid-cols-3 gap-6">
          {/* Input panel */}
          <div className="space-y-4">
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 space-y-4">
              <div>
                <h3 className="text-sm font-medium text-slate-300">Build Prep Plan</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Generates workflow pipeline, skill map, practice projects, and interview questions from the JD.
                </p>
              </div>

              {applications.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">
                    From Application
                  </label>
                  <select value={selectedApp} onChange={e => handleAppSelect(e.target.value)}
                    title="Select an application"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500">
                    <option value="">-- Pick an application --</option>
                    {applications.map(a => (
                      <option key={a.id} value={a.id}>{a.company} — {a.role}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Job context bar */}
              <JobContextBar
                company={company}
                roleTitle={roleTitle}
                jobDescription={jobDescription}
                onApply={(c, r, jd) => { setCompany(c); setRoleTitle(r); setJobDescription(jd); }}
                onPin={() => setActiveJob({ company, roleTitle, jobDescription })}
              />

              {/* Recent JD quick-fill */}
              {recentJDs.length > 0 && (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowRecent(v => !v)}
                    className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors font-medium"
                  >
                    <span className={`transition-transform duration-150 ${showRecent ? 'rotate-90' : ''}`}>▶</span>
                    Load from recent ({recentJDs.length})
                  </button>
                  {showRecent && (
                    <div className="mt-2 bg-slate-800/60 border border-slate-700 rounded-lg overflow-hidden">
                      {recentJDs.map(jd => (
                        <button
                          key={jd.id}
                          type="button"
                          onClick={() => {
                            setCompany(jd.company);
                            setRoleTitle(jd.roleTitle);
                            setJobDescription(jd.jobDescription);
                            setShowRecent(false);
                          }}
                          className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-slate-700 transition-colors text-left border-b border-slate-700/50 last:border-0"
                        >
                          <div>
                            <span className="text-xs text-slate-200 font-medium">
                              {[jd.company, jd.roleTitle].filter(Boolean).join(' — ') || 'Untitled'}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-600 shrink-0 ml-3">
                            {formatDistanceToNow(new Date(jd.savedAt), { addSuffix: true })}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Company</label>
                <input value={company} onChange={e => setCompany(e.target.value)} placeholder="Google, Mayo Clinic, Goldman Sachs…"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500" />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Role Title</label>
                <input value={roleTitle} onChange={e => setRoleTitle(e.target.value)} placeholder="Healthcare Data Analyst, FP&A Analyst…"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500" />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Job Description</label>
                <textarea value={jobDescription} onChange={e => setJobDescription(e.target.value)} rows={7}
                  placeholder="Paste full JD — team context, tech stack, sector keywords improve pipeline accuracy…"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 resize-none" />
              </div>

              <button type="button" onClick={handleGenerate} disabled={generating}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2">
                {generating
                  ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Building Plan…</>
                  : <><SparkleIcon size={14} /> Build Prep Plan</>}
              </button>
            </div>

            {savedPreps.length > 0 && (
              <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
                <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">Saved Plans</h4>
                <div className="space-y-2">
                  {savedPreps.map(p => (
                    <button key={p.id} type="button"
                      onClick={() => { setPlan(p.plan); setRoleTitle(p.roleTitle); setCompany(p.company); setJobDescription(p.jobDescription); }}
                      className="w-full text-left px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors">
                      <div className="text-xs text-slate-300 font-medium truncate">
                        {[p.company, p.roleTitle].filter(Boolean).join(' — ') || 'Prep plan'}
                      </div>
                      <div className="text-[10px] text-slate-600">
                        {p.plan.topics?.length ?? 0} topics ·{' '}
                        {formatDistanceToNow(new Date(p.created_at), { addSuffix: true })}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Results panel */}
          <div className="col-span-2 space-y-4">
            {generating && (
              <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Generating in parallel…
                </div>
                {[
                  { key: 'a' as const, label: 'Workflow pipeline · skill map · projects' },
                  { key: 'b' as const, label: 'Interview topics · questions' },
                ].map(({ key, label }) => {
                  const phase = genPhase[key];
                  return (
                    <div key={key} className="flex items-center gap-3">
                      {phase === 'running' && (
                        <span className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" />
                      )}
                      {phase === 'done' && (
                        <span className="w-3.5 h-3.5 rounded-full bg-green-500 flex items-center justify-center shrink-0 text-[8px] text-white">✓</span>
                      )}
                      {phase === 'error' && (
                        <span className="w-3.5 h-3.5 rounded-full bg-red-500 shrink-0" />
                      )}
                      {phase === 'idle' && (
                        <span className="w-3.5 h-3.5 rounded-full border border-slate-600 shrink-0" />
                      )}
                      <span className={`text-xs ${
                        phase === 'done'    ? 'text-green-400' :
                        phase === 'running' ? 'text-blue-300' :
                        phase === 'error'   ? 'text-red-400' :
                                             'text-slate-500'
                      }`}>{label}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {plan && !generating && (
              <PlanView plan={plan} company={company} roleTitle={roleTitle}
                jobDescription={jobDescription} onDownload={handleDownload} />
            )}

            {!generating && !plan && (
              <div className="bg-slate-900 rounded-xl border border-slate-800 p-12 text-center">
                <BriefcaseIcon size={32} className="text-slate-700 mx-auto mb-3" />
                <p className="text-slate-400 text-sm font-medium">No prep plan yet</p>
                <p className="text-slate-500 text-xs mt-1.5 max-w-xs mx-auto leading-relaxed">
                  Add company + role + JD and click "Build Prep Plan" to get a workflow pipeline,
                  skill map, practice projects, and prioritized interview questions.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Answer Questions ──────────────────────────────────────────────────── */}
      {tab === 'answer' && (
        <div className="grid grid-cols-3 gap-6">
          <div className="space-y-4">
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 space-y-4">
              <div>
                <h3 className="text-sm font-medium text-slate-300">Answer Questions</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Paste application questions (one per line). Answers use your story — no buzzwords.
                </p>
              </div>
              {!userBio.trim() && (
                <div className="bg-amber-950/30 border border-amber-800/40 rounded-lg px-3 py-2">
                  <p className="text-xs text-amber-400">
                    Add your story in <strong>Settings → Your Story</strong> for personalized answers.
                  </p>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">
                  Questions (one per line)
                </label>
                <textarea value={qaQuestions} onChange={e => setQaQuestions(e.target.value)} rows={6}
                  placeholder={`Tell me about yourself.\nWhy do you want to work here?\nDescribe a challenging project you led.`}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 resize-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">
                  Job Description (optional)
                </label>
                <textarea value={qaJobDesc} onChange={e => setQaJobDesc(e.target.value)} rows={4}
                  placeholder="Paste JD for more targeted answers..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 resize-none" />
              </div>
              <button type="button" onClick={handleAnswerQuestions} disabled={qaGenerating}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2">
                {qaGenerating
                  ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Answering…</>
                  : <><SparkleIcon size={14} /> Generate Answers</>}
              </button>
            </div>
          </div>

          <div className="col-span-2 space-y-4">
            {qaStream && qaGenerating && (
              <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                <div className="text-xs text-slate-500 mb-2">Writing answers…</div>
                <div className="text-xs font-mono text-slate-400 max-h-32 overflow-y-auto">{qaStream}</div>
              </div>
            )}
            {qaAnswers.length > 0 && (
              <div className="space-y-4">
                {qaAnswers.map((qa, idx) => (
                  <div key={idx} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                    <div className="px-4 pt-4 pb-2 border-b border-slate-800 flex items-start justify-between gap-3">
                      <p className="text-xs font-medium text-blue-400">{qa.question}</p>
                      <button type="button" onClick={() => copyAnswer(qa.answer, idx)}
                        className="shrink-0 px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-[10px] text-slate-300 transition-colors">
                        {copiedIdx === idx ? '✓ Copied' : 'Copy'}
                      </button>
                    </div>
                    <div className="px-4 py-3">
                      <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{qa.answer}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!qaGenerating && qaAnswers.length === 0 && (
              <div className="bg-slate-900 rounded-xl border border-slate-800 p-12 text-center">
                <MessageIcon size={32} className="text-slate-700 mx-auto mb-3" />
                <p className="text-slate-400 text-sm">Paste application questions to get humanized answers</p>
                <p className="text-slate-600 text-xs mt-1">Uses your story — no buzzwords, no generic responses</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
