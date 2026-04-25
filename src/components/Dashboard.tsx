import { useState, useEffect, useRef } from 'react';
import { getApplications, getResumeVersions, getCoverLetters } from '../lib/db/queries';
import { STATUS_LABELS } from '../lib/db/schema';
import type { Application, ApplicationStatus } from '../lib/db/schema';
import { useAppStore, keyStore } from '../store/app';
import { useJobContext } from '../store/jobContext';
import { formatDistanceToNow } from 'date-fns';
import {
  SparkleIcon, ApplicationsIcon, CoverLetterIcon, SettingsIcon,
  WarningIcon, ClipboardIcon, MessageIcon, BriefcaseIcon, GenerateIcon,
} from './ui/Icons';

const STATUS_COLORS: Record<ApplicationStatus, string> = {
  wishlist:     'bg-slate-800 text-slate-400',
  applied:      'bg-blue-900/50 text-blue-400',
  phone_screen: 'bg-amber-900/50 text-amber-400',
  interview:    'bg-purple-900/50 text-purple-400',
  offer:        'bg-green-900/50 text-green-400',
  rejected:     'bg-red-900/50 text-red-400',
};

const STAT_ICONS = {
  applications:  ApplicationsIcon,
  resumes:       GenerateIcon,
  coverLetters:  CoverLetterIcon,
  provider:      SettingsIcon,
};

// ── Terminal typeout ─────────────────────────────────────────────────────────

function useTypeout(lines: string[], speed = 28): string[] {
  const [displayed, setDisplayed] = useState<string[]>([]);
  const [lineIdx, setLineIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (lineIdx >= lines.length) return;
    const line = lines[lineIdx];
    if (charIdx <= line.length) {
      timerRef.current = setTimeout(() => {
        setDisplayed(prev => {
          const next = [...prev];
          next[lineIdx] = line.slice(0, charIdx);
          return next;
        });
        setCharIdx(c => c + 1);
      }, speed);
    } else {
      timerRef.current = setTimeout(() => {
        setLineIdx(i => i + 1);
        setCharIdx(0);
      }, 420);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [lineIdx, charIdx, lines, speed]);

  return displayed;
}

function TerminalHero({ company }: { company?: string }) {
  const lines = [
    '> Initializing Rattle Snake...',
    `> Context Loaded: ${company ? company : '[No active job — set a target]'}`,
    '> Status: Ready to Strike.',
  ];
  const displayed = useTypeout(lines);

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl px-5 py-4 font-mono">
      <div className="flex items-center gap-1.5 mb-3">
        <div className="w-2.5 h-2.5 rounded-full bg-red-600/60" />
        <div className="w-2.5 h-2.5 rounded-full bg-amber-500/60" />
        <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
        <span className="text-[10px] text-slate-700 ml-2 uppercase tracking-widest">career-intelligence-assistant</span>
      </div>
      {lines.map((_, i) => (
        <div key={i} className={`text-sm leading-relaxed ${
          i === 0 ? 'text-slate-500' :
          i === 1 ? 'text-blue-400' :
                    'text-green-400 font-semibold'
        }`}>
          {displayed[i] ?? ''}
          {displayed[i] !== undefined && displayed[i].length < lines[i].length && (
            <span className="animate-pulse">|</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { activeProvider, providers } = useAppStore();
  const { active: activeJob } = useJobContext();
  const [applications, setApplications] = useState<Application[]>([]);
  const [versionCount, setVersionCount] = useState(0);
  const [clCount, setClCount] = useState(0);

  useEffect(() => {
    setApplications(getApplications());
    setVersionCount(getResumeVersions().length);
    setClCount(getCoverLetters().length);
  }, []);

  const hasKey = !!keyStore.get(activeProvider);
  const recentApps = [...applications]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  const statusCounts = applications.reduce((acc, app) => {
    acc[app.status] = (acc[app.status] ?? 0) + 1;
    return acc;
  }, {} as Record<ApplicationStatus, number>);

  const stats = [
    { label: 'Applications',   value: applications.length, Icon: STAT_ICONS.applications,  href: '/applications',   color: 'text-blue-400'   },
    { label: 'Resume Versions', value: versionCount,        Icon: STAT_ICONS.resumes,        href: '/generate',       color: 'text-purple-400' },
    { label: 'Cover Letters',   value: clCount,             Icon: STAT_ICONS.coverLetters,   href: '/generate?tab=cover-letter', color: 'text-green-400' },
    { label: 'Active Provider', value: activeProvider,      Icon: STAT_ICONS.provider,       href: '/settings',       color: 'text-amber-400'  },
  ];

  const quickActions = [
    { href: '/generate',        label: 'Generate Resume',    desc: 'AI-tailor a resume for a specific role', Icon: SparkleIcon   },
    { href: '/applications',    label: 'Track Applications', desc: 'Manage your job search pipeline',         Icon: BriefcaseIcon },
    { href: '/interview-prep',  label: 'Interview Prep',     desc: 'Generate role-specific prep plans',       Icon: MessageIcon   },
  ];

  return (
    <div className="space-y-8">
      {/* Terminal hero */}
      <TerminalHero company={activeJob?.company} />

      {/* API key warning */}
      {!hasKey && (
        <div className="bg-amber-950/30 border border-amber-800/40 rounded-xl p-4 flex items-center gap-3">
          <WarningIcon size={15} className="text-amber-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-300">No API key configured</p>
            <p className="text-xs text-amber-500 mt-0.5">
              Add your API key in{' '}
              <a href="/settings" className="underline hover:text-amber-300">Settings</a>{' '}
              to start generating AI-powered resumes.
            </p>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4">
        {stats.map(({ label, value, Icon, href, color }) => (
          <a
            key={label}
            href={href}
            className="bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-slate-600 transition-all group"
          >
            <div className="flex items-center justify-between mb-3">
              <Icon size={15} className={color} />
              <span className="text-slate-700 group-hover:text-slate-500 text-xs transition-colors">→</span>
            </div>
            <div className="text-2xl font-bold text-slate-100 tabular-nums">
              {typeof value === 'number' ? value : '—'}
            </div>
            <div className="text-xs text-slate-500 mt-1">{label}</div>
            {typeof value === 'string' && (
              <div className={`text-xs font-medium mt-1 capitalize ${color}`}>{value}</div>
            )}
          </a>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Application funnel */}
        <div className="col-span-2 bg-slate-900 rounded-xl border border-slate-800 p-5">
          <h3 className="font-semibold text-slate-100 mb-4">Application Pipeline</h3>
          {applications.length === 0 ? (
            <div className="text-center py-8">
              <ClipboardIcon size={24} className="text-slate-700 mx-auto mb-3" />
              <p className="text-sm text-slate-500">No applications yet.</p>
              <a href="/applications" className="text-xs text-blue-400 hover:text-blue-300 mt-1 inline-block">
                Add your first application →
              </a>
            </div>
          ) : (
            <div className="space-y-2">
              {(Object.entries(STATUS_LABELS) as [ApplicationStatus, string][]).map(([status, label]) => {
                const count = statusCounts[status] ?? 0;
                const pct = applications.length > 0 ? (count / applications.length) * 100 : 0;
                return (
                  <div key={status} className="flex items-center gap-3">
                    <span className="text-xs text-slate-500 w-24 shrink-0">{label}</span>
                    <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                      {/* Dynamic width requires inline style — Tailwind cannot generate arbitrary % classes */}
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${STATUS_COLORS[status].split(' ')[0]}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className={`text-xs font-medium w-6 text-right ${STATUS_COLORS[status].split(' ')[1]}`}>
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent activity */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
          <h3 className="font-semibold text-slate-100 mb-4">Recent Applications</h3>
          {recentApps.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm text-slate-600">None yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentApps.map(app => (
                <a
                  key={app.id}
                  href="/applications"
                  className="block hover:bg-slate-800 rounded-lg p-2 -mx-2 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-200 truncate">{app.company}</div>
                      <div className="text-xs text-slate-500 truncate">{app.role}</div>
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ml-2 shrink-0 ${STATUS_COLORS[app.status]}`}>
                      {STATUS_LABELS[app.status]}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-700 mt-1">
                    {formatDistanceToNow(new Date(app.created_at), { addSuffix: true })}
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div>
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Quick Actions</h3>
        <div className="grid grid-cols-3 gap-3">
          {quickActions.map(({ href, label, desc, Icon }) => (
            <a
              key={href}
              href={href}
              className="bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-blue-500/40
                         hover:bg-blue-950/10 transition-all group"
            >
              <Icon size={18} className="text-slate-600 group-hover:text-blue-400 transition-colors mb-3" />
              <div className="font-medium text-slate-200 text-sm group-hover:text-white transition-colors">
                {label}
              </div>
              <div className="text-xs text-slate-500 mt-1">{desc}</div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
