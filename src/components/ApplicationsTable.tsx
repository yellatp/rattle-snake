import { useState, useEffect } from 'react';
import { getApplications, deleteApplication, updateApplication } from '../lib/db/queries';
import type { Application, ApplicationStatus } from '../lib/db/schema';
import { STATUS_LABELS } from '../lib/db/schema';
import { formatDistanceToNow } from 'date-fns';
import { CloseIcon } from './ui/Icons';

const STATUS_OPTIONS: ApplicationStatus[] = ['applied', 'phone_screen', 'interview', 'offer', 'rejected'];

const STATUS_BADGE: Record<ApplicationStatus, string> = {
  wishlist:     'bg-slate-800 text-slate-400',
  applied:      'bg-blue-900/60 text-blue-300',
  phone_screen: 'bg-amber-900/60 text-amber-300',
  interview:    'bg-purple-900/60 text-purple-300',
  offer:        'bg-green-900/60 text-green-300',
  rejected:     'bg-red-900/60 text-red-300',
};

type SortKey = 'company' | 'role' | 'status' | 'interview_round' | 'updated_at' | 'created_at';

export default function ApplicationsTable() {
  const [apps, setApps] = useState<Application[]>([]);
  const [filterStatus, setFilterStatus] = useState<ApplicationStatus | 'all'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('updated_at');
  const [sortAsc, setSortAsc] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setApps(getApplications().filter(a => a.status !== 'wishlist'));
  }, []);

  const handleDelete = (id: string) => {
    deleteApplication(id);
    setApps(prev => prev.filter(a => a.id !== id));
  };

  const handleStatusChange = (id: string, status: ApplicationStatus) => {
    const updated = updateApplication(id, { status });
    if (updated) setApps(prev => prev.map(a => a.id === id ? updated : a));
  };

  const handleRoundChange = (id: string, delta: number) => {
    const app = apps.find(a => a.id === id);
    if (!app) return;
    const next = Math.max(0, (app.interview_round ?? 0) + delta);
    const updated = updateApplication(id, { interview_round: next });
    if (updated) setApps(prev => prev.map(a => a.id === id ? updated : a));
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(v => !v);
    else { setSortKey(key); setSortAsc(true); }
  };

  const filtered = apps
    .filter(a => filterStatus === 'all' || a.status === filterStatus)
    .filter(a =>
      !search ||
      a.company.toLowerCase().includes(search.toLowerCase()) ||
      a.role.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      let av: string | number = 0;
      let bv: string | number = 0;
      if (sortKey === 'company') { av = a.company; bv = b.company; }
      else if (sortKey === 'role') { av = a.role; bv = b.role; }
      else if (sortKey === 'status') { av = a.status; bv = b.status; }
      else if (sortKey === 'interview_round') { av = a.interview_round ?? 0; bv = b.interview_round ?? 0; }
      else if (sortKey === 'updated_at') { av = a.updated_at || a.created_at; bv = b.updated_at || b.created_at; }
      else if (sortKey === 'created_at') { av = a.created_at; bv = b.created_at; }
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortAsc ? cmp : -cmp;
    });

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <span className="text-slate-700 ml-1">↕</span>;
    return <span className="text-blue-400 ml-1">{sortAsc ? '↑' : '↓'}</span>;
  };

  const thClass = 'px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-widest text-slate-500 cursor-pointer hover:text-slate-300 transition-colors select-none whitespace-nowrap';
  const tdClass = 'px-3 py-2 text-xs text-slate-300 border-t border-slate-800';

  const exportCSV = () => {
    const headers = ['Company', 'Role', 'Status', 'Interview Round', 'Location', 'Salary Min', 'Salary Max', 'Applied', 'Last Updated', 'Notes'];
    const rows = filtered.map(a => [
      a.company, a.role, STATUS_LABELS[a.status as ApplicationStatus] ?? a.status,
      a.interview_round ?? '', a.location, a.salary_min ?? '', a.salary_max ?? '',
      new Date(a.created_at).toLocaleDateString(),
      new Date(a.updated_at || a.created_at).toLocaleDateString(),
      a.notes,
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const el = document.createElement('a'); el.href = url; el.download = 'applications.csv'; el.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search company or role..."
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-100
                     placeholder:text-slate-600 focus:outline-none focus:border-blue-500 w-64"
        />
        <select
          value={filterStatus}
          aria-label="Filter by status"
          onChange={e => setFilterStatus(e.target.value as ApplicationStatus | 'all')}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-100
                     focus:outline-none focus:border-blue-500"
        >
          <option value="all">All Statuses</option>
          {STATUS_OPTIONS.map(s => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
        <span className="text-xs text-slate-500 ml-auto">{filtered.length} of {apps.length} applications</span>
        <button type="button" onClick={exportCSV}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors">
          ↓ Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full min-w-[800px]">
          <thead className="bg-slate-900">
            <tr>
              <th className={thClass} onClick={() => handleSort('company')}>Company <SortIcon k="company" /></th>
              <th className={thClass} onClick={() => handleSort('role')}>Role <SortIcon k="role" /></th>
              <th className={thClass} onClick={() => handleSort('status')}>Status <SortIcon k="status" /></th>
              <th className={thClass} onClick={() => handleSort('interview_round')}>Round <SortIcon k="interview_round" /></th>
              <th className={thClass}>Location</th>
              <th className={thClass}>Salary</th>
              <th className={thClass} onClick={() => handleSort('updated_at')}>Updated <SortIcon k="updated_at" /></th>
              <th className={thClass} onClick={() => handleSort('created_at')}>Applied <SortIcon k="created_at" /></th>
              <th className={`${thClass} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-12 text-center text-sm text-slate-600">
                  {search || filterStatus !== 'all' ? 'No applications match your filters.' : 'No applications yet. Start tracking from the dashboard.'}
                </td>
              </tr>
            )}
            {filtered.map(app => (
              <tr key={app.id} className="hover:bg-slate-800/30 transition-colors group">
                <td className={`${tdClass} font-medium text-slate-100`}>{app.company}</td>
                <td className={`${tdClass} max-w-[200px]`}>
                  <div className="truncate">{app.role}</div>
                </td>
                <td className={tdClass}>
                  <select
                    value={app.status}
                    aria-label={`Status for ${app.company}`}
                    onChange={e => handleStatusChange(app.id, e.target.value as ApplicationStatus)}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold cursor-pointer focus:outline-none ${STATUS_BADGE[app.status as ApplicationStatus] ?? ''}`}
                  >
                    {STATUS_OPTIONS.map(s => (
                      <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                </td>
                <td className={tdClass}>
                  {app.status === 'interview' ? (
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => handleRoundChange(app.id, -1)}
                        className="w-4 h-4 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 text-[10px] flex items-center justify-center">−</button>
                      <span className="text-[10px] text-purple-400 font-medium min-w-[16px] text-center">
                        {app.interview_round ?? 0}
                      </span>
                      <button type="button" onClick={() => handleRoundChange(app.id, 1)}
                        className="w-4 h-4 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 text-[10px] flex items-center justify-center">+</button>
                    </div>
                  ) : (
                    <span className="text-slate-700">—</span>
                  )}
                </td>
                <td className={`${tdClass} text-slate-500`}>{app.location || '—'}</td>
                <td className={`${tdClass} text-green-400 whitespace-nowrap`}>
                  {app.salary_min
                    ? `$${(app.salary_min / 1000).toFixed(0)}k${app.salary_max ? `-${(app.salary_max / 1000).toFixed(0)}k` : '+'}`
                    : <span className="text-slate-700">—</span>
                  }
                </td>
                <td className={`${tdClass} text-slate-500 whitespace-nowrap`}>
                  {formatDistanceToNow(new Date(app.updated_at || app.created_at), { addSuffix: true })}
                </td>
                <td className={`${tdClass} text-slate-500 whitespace-nowrap`}>
                  {new Date(app.created_at).toLocaleDateString()}
                </td>
                <td className={`${tdClass} text-right`}>
                  <button
                    type="button"
                    onClick={() => handleDelete(app.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-600 hover:text-red-400 transition-all"
                    title="Delete"
                  >
                    <CloseIcon size={12} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {apps.length === 0 && (
        <div className="text-center py-16 text-slate-600 text-sm">
          <p className="text-4xl mb-4">📋</p>
          <p>No applications tracked yet.</p>
          <a href="/" className="mt-2 inline-block text-blue-500 hover:text-blue-400 transition-colors">
            Go to dashboard →
          </a>
        </div>
      )}
    </div>
  );
}
