import { useState, useEffect } from 'react';
import {
  DndContext, closestCorners, PointerSensor, useSensor, useSensors,
  type DragEndEvent, DragOverlay, type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import {
  getApplications, createApplication, updateApplication, deleteApplication,
  getRecentResumeVersions, updateResumeVersion,
} from '../lib/db/queries';
import type { Application, ApplicationStatus, ResumeVersion } from '../lib/db/schema';
import { STATUS_LABELS } from '../lib/db/schema';
import { useAppStore } from '../store/app';
import { formatDistanceToNow } from 'date-fns';
import { LocationIcon, CloseIcon, GenerateIcon } from './ui/Icons';
import { extractResumeJson } from '../lib/export/extract-json';

// ── Column config ─────────────────────────────────────────────────────────────

// Wishlist kept for backward-compat reads, but not shown as a column
const TRACK_COLUMNS: ApplicationStatus[] = ['applied', 'phone_screen', 'interview'];
// 'offer' and 'rejected' share the Decision column

const COLUMN_LABELS: Record<string, string> = {
  recently_generated: 'Recently Generated',
  applied:            'Applied',
  phone_screen:       'Phone Screen',
  interview:          'Interview',
  decision:           'Decision',
};

const COLUMN_COLORS: Record<string, string> = {
  recently_generated: 'border-slate-700/60 bg-slate-900/40',
  applied:            'border-blue-800/40 bg-blue-950/10',
  phone_screen:       'border-amber-800/40 bg-amber-950/10',
  interview:          'border-purple-800/40 bg-purple-950/10',
  decision:           'border-green-800/40 bg-green-950/10',
};

const BADGE_COLORS: Record<ApplicationStatus, string> = {
  wishlist:     'bg-slate-800 text-slate-400',
  applied:      'bg-blue-900/60 text-blue-300',
  phone_screen: 'bg-amber-900/60 text-amber-300',
  interview:    'bg-purple-900/60 text-purple-300',
  offer:        'bg-green-900/60 text-green-300',
  rejected:     'bg-red-900/60 text-red-300',
};

// ── Recently Generated card ───────────────────────────────────────────────────

function parseTargetFromContent(content: string): { company: string; role: string } {
  try {
    const json = extractResumeJson(content);
    const data = JSON.parse(json) as { role?: string };
    return { company: '', role: data.role ?? '' };
  } catch {
    return { company: '', role: '' };
  }
}

interface RecentCardProps {
  version: ResumeVersion;
  onMarkApplied: (id: string) => void;
}

function RecentCard({ version, onMarkApplied }: RecentCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `rv_${version.id}` });
  const { role } = parseTargetFromContent(version.content);
  const displayRole = version.target_role ?? role ?? version.template_slug.replace(/_/g, ' ');
  const displayCompany = version.target_company;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`bg-slate-800 border border-slate-700 rounded-lg p-2.5 cursor-grab active:cursor-grabbing
                  hover:border-slate-500 transition-all text-xs ${isDragging ? 'opacity-40' : ''}`}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-start justify-between gap-1 mb-1">
        <div className="min-w-0">
          <div className="font-medium text-slate-200 truncate capitalize">{displayRole}</div>
          {displayCompany && <div className="text-slate-500 truncate">{displayCompany}</div>}
        </div>
        {version.ats_score > 0 && (
          <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold ${
            version.ats_score >= 75 ? 'bg-green-900/50 text-green-400' :
            version.ats_score >= 50 ? 'bg-amber-900/50 text-amber-400' : 'bg-red-900/50 text-red-400'
          }`}>
            {version.ats_score}%
          </span>
        )}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-slate-700">{formatDistanceToNow(new Date(version.created_at), { addSuffix: true })}</span>
        {!version.is_applied && (
          <button
            type="button"
            onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onMarkApplied(version.id); }}
            className="text-[9px] text-blue-500 hover:text-blue-300 transition-colors"
          >
            + Applied
          </button>
        )}
        {version.is_applied && <span className="text-[9px] text-green-500">Applied</span>}
      </div>
    </div>
  );
}

// ── Application card ──────────────────────────────────────────────────────────

interface AppCardProps {
  app: Application;
  onOpen: (app: Application) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, data: Partial<Application>) => void;
}

function AppCard({ app, onOpen, onDelete, onUpdate }: AppCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: app.id });

  const round = app.interview_round ?? 0;

  const handleRoundChange = (delta: number, e: React.MouseEvent | React.PointerEvent) => {
    e.stopPropagation();
    const next = Math.max(0, round + delta);
    onUpdate(app.id, { interview_round: next });
  };

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`bg-slate-900 border border-slate-800 rounded-lg p-2.5 cursor-grab active:cursor-grabbing
                  hover:border-slate-600 transition-all ${isDragging ? 'opacity-40' : ''}`}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-start justify-between gap-1 mb-1.5">
        <div className="flex-1 min-w-0">
          <div className="font-medium text-slate-100 text-xs truncate">{app.company}</div>
          <div className="text-[11px] text-slate-400 truncate">{app.role}</div>
        </div>
        <div className="flex gap-0.5 shrink-0">
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onOpen(app); }}
            onPointerDown={e => e.stopPropagation()}
            className="p-1 text-slate-600 hover:text-slate-300 transition-colors"
            title="Open details"
          >↗</button>
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onDelete(app.id); }}
            onPointerDown={e => e.stopPropagation()}
            className="p-1 text-slate-700 hover:text-red-400 transition-colors"
            title="Delete"
          ><CloseIcon size={10} /></button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] text-slate-600">
          {formatDistanceToNow(new Date(app.updated_at || app.created_at), { addSuffix: true })}
        </span>
        {app.status === 'interview' && (
          <div className="flex items-center gap-1" onPointerDown={e => e.stopPropagation()}>
            <button type="button" onClick={e => handleRoundChange(-1, e)}
              className="w-4 h-4 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 text-[10px] flex items-center justify-center leading-none transition-colors">
              −
            </button>
            <span className="text-[9px] px-1 bg-purple-900/40 text-purple-400 rounded font-medium min-w-[20px] text-center">
              R{round}
            </span>
            <button type="button" onClick={e => handleRoundChange(1, e)}
              className="w-4 h-4 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 text-[10px] flex items-center justify-center leading-none transition-colors">
              +
            </button>
          </div>
        )}
        {(app.status === 'offer' || app.status === 'rejected') && (
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${BADGE_COLORS[app.status]}`}>
            {STATUS_LABELS[app.status as ApplicationStatus]}
          </span>
        )}
      </div>

      {app.salary_min && (
        <div className="text-[10px] text-green-400 mt-1">
          ${(app.salary_min / 1000).toFixed(0)}k{app.salary_max ? `-${(app.salary_max / 1000).toFixed(0)}k` : '+'}
        </div>
      )}
      {app.location && (
        <div className="text-[10px] text-slate-600 mt-0.5 flex items-center gap-1">
          <LocationIcon size={9} />{app.location}
        </div>
      )}
    </div>
  );
}

// ── Droppable column wrapper ──────────────────────────────────────────────────

function DroppableColumn({ id, children, className }: { id: string; children: React.ReactNode; className: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`${className} ${isOver ? 'ring-2 ring-blue-500/40 ring-inset' : ''} transition-all`}
    >
      {children}
    </div>
  );
}

// ── Add card form ─────────────────────────────────────────────────────────────

function AddCardForm({ status, onAdd, onCancel }: {
  status: ApplicationStatus;
  onAdd: (data: Pick<Application, 'company' | 'role' | 'status' | 'location'>) => void;
  onCancel: () => void;
}) {
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [location, setLocation] = useState('');

  const doAdd = () => { if (company && role) onAdd({ company, role, status, location }); };

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-2.5 space-y-2">
      <input autoFocus value={company} onChange={e => setCompany(e.target.value)}
        placeholder="Company" onKeyDown={e => e.key === 'Enter' && doAdd()}
        className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-xs text-slate-100
                   placeholder:text-slate-500 focus:outline-none focus:border-blue-500" />
      <input value={role} onChange={e => setRole(e.target.value)} placeholder="Job title"
        onKeyDown={e => e.key === 'Enter' && doAdd()}
        className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-xs text-slate-100
                   placeholder:text-slate-500 focus:outline-none focus:border-blue-500" />
      <input value={location} onChange={e => setLocation(e.target.value)} placeholder="Location (optional)"
        onKeyDown={e => e.key === 'Enter' && doAdd()}
        className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-xs text-slate-100
                   placeholder:text-slate-500 focus:outline-none focus:border-blue-500" />
      <div className="flex gap-2">
        <button type="button" onClick={doAdd}
          className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs transition-colors">
          Add
        </button>
        <button type="button" onClick={onCancel} className="py-1.5 px-3 bg-slate-700 text-slate-300 rounded text-xs">Cancel</button>
      </div>
    </div>
  );
}

// ── Detail panel ──────────────────────────────────────────────────────────────

function SalaryBar({ min, max }: { min: number; max: number }) {
  const mid = (min + max) / 2;
  return (
    <div className="bg-slate-800 rounded-lg p-3">
      <div className="text-xs text-slate-400 mb-2">Salary Range</div>
      <div className="relative h-2 bg-slate-700 rounded-full">
        <div className="absolute inset-y-0 left-[10%] right-[10%] bg-gradient-to-r from-green-700 to-green-500 rounded-full" />
        <div className="absolute top-1/2 left-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 bg-white rounded-full border-2 border-green-500" />
      </div>
      <div className="flex justify-between mt-1.5 text-xs text-slate-500">
        <span>${(min / 1000).toFixed(0)}k</span>
        <span className="text-green-400 font-medium">${(mid / 1000).toFixed(0)}k mid</span>
        <span>${(max / 1000).toFixed(0)}k</span>
      </div>
    </div>
  );
}

function DetailPanel({ app, onClose, onUpdate }: {
  app: Application;
  onClose: () => void;
  onUpdate: (id: string, data: Partial<Application>) => void;
}) {
  const [notes, setNotes] = useState(app.notes);
  const [salaryMin, setSalaryMin] = useState(String(app.salary_min ?? ''));
  const [salaryMax, setSalaryMax] = useState(String(app.salary_max ?? ''));

  const handleSave = () => {
    onUpdate(app.id, {
      notes,
      salary_min: salaryMin ? Number(salaryMin) : undefined,
      salary_max: salaryMax ? Number(salaryMax) : undefined,
    });
    onClose();
  };

  // Status options excluding wishlist; offer/rejected shown as Decision sub-choices
  const statusOptions: [ApplicationStatus, string][] = [
    ['applied',      'Applied'],
    ['phone_screen', 'Phone Screen'],
    ['interview',    'Interview'],
    ['offer',        'Decision — Offered'],
    ['rejected',     'Decision — Rejected'],
  ];

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div>
            <h3 className="font-semibold text-slate-100">{app.company}</h3>
            <p className="text-sm text-slate-400">{app.role}
              {app.status === 'interview' && (app.interview_round ?? 0) > 0 && (
                <span className="ml-2 text-xs text-purple-400">Round {app.interview_round}</span>
              )}
            </p>
          </div>
          <button type="button" onClick={onClose} title="Close" className="text-slate-500 hover:text-slate-300">
            <CloseIcon size={14} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Status</label>
            <select value={app.status} aria-label="Application status"
              onChange={e => onUpdate(app.id, { status: e.target.value as ApplicationStatus })}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 w-full
                         focus:outline-none focus:border-blue-500">
              {statusOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Salary Min ($)</label>
              <input type="number" value={salaryMin} onChange={e => setSalaryMin(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100
                           focus:outline-none focus:border-blue-500" placeholder="85000" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Salary Max ($)</label>
              <input type="number" value={salaryMax} onChange={e => setSalaryMax(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100
                           focus:outline-none focus:border-blue-500" placeholder="120000" />
            </div>
          </div>
          {salaryMin && salaryMax && Number(salaryMin) > 0 && Number(salaryMax) > Number(salaryMin) && (
            <SalaryBar min={Number(salaryMin)} max={Number(salaryMax)} />
          )}
          <div>
            <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4}
              placeholder="Interview notes, recruiter contacts, next steps..."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100
                         placeholder:text-slate-600 focus:outline-none focus:border-blue-500 resize-none" />
          </div>
          <div className="text-xs text-slate-600">
            Applied {formatDistanceToNow(new Date(app.created_at), { addSuffix: true })}
            {app.jd_url && (
              <a href={app.jd_url} target="_blank" rel="noopener noreferrer" className="ml-3 text-blue-500 hover:text-blue-400">
                View Job Posting ↗
              </a>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-800">
          <button type="button" onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm">Cancel</button>
          <button type="button" onClick={handleSave}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm">Save Changes</button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function JobTracker() {
  const { addToast } = useAppStore();
  const [applications, setApplications] = useState<Application[]>([]);
  const [recentVersions, setRecentVersions] = useState<ResumeVersion[]>([]);
  const [addingTo, setAddingTo] = useState<ApplicationStatus | null>(null);
  const [detailApp, setDetailApp] = useState<Application | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    setApplications(getApplications().filter(a => a.status !== 'wishlist'));
    setRecentVersions(getRecentResumeVersions(10));
  }, []);

  const handleAdd = (data: Pick<Application, 'company' | 'role' | 'status' | 'location'>) => {
    const newApp = createApplication({ ...data, jd_text: '', jd_url: '', notes: '' });
    setApplications(prev => [...prev, newApp]);
    setAddingTo(null);
    addToast('success', `Added ${data.company}`);
  };

  const handleUpdate = (id: string, data: Partial<Application>) => {
    const updated = updateApplication(id, data);
    if (updated) setApplications(prev => prev.map(a => a.id === id ? updated : a));
    if (detailApp?.id === id && updated) setDetailApp(updated);
  };

  const handleDelete = (id: string) => {
    deleteApplication(id);
    setApplications(prev => prev.filter(a => a.id !== id));
    addToast('info', 'Application removed');
  };

  const handleMarkApplied = (versionId: string) => {
    updateResumeVersion(versionId, { is_applied: true } as never);
    setRecentVersions(prev => prev.map(v => v.id === versionId ? { ...v, is_applied: true } : v));
    addToast('success', 'Marked as applied');
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const activeIdStr = String(active.id);
    const overIdStr   = String(over.id);

    // Dragging a recently-generated resume version card
    if (activeIdStr.startsWith('rv_')) {
      const versionId = activeIdStr.slice(3);
      const version   = recentVersions.find(v => v.id === versionId);
      if (!version) return;

      // Determine target status from drop zone
      const validStatuses: ApplicationStatus[] = ['applied', 'phone_screen', 'interview'];
      let targetStatus: ApplicationStatus = 'applied';

      if (overIdStr === 'decision') {
        targetStatus = 'offer';
      } else if (validStatuses.includes(overIdStr as ApplicationStatus)) {
        targetStatus = overIdStr as ApplicationStatus;
      } else {
        // Dropped over another card — use that card's status
        const app = applications.find(a => a.id === overIdStr);
        if (app) targetStatus = app.status === 'offer' || app.status === 'rejected' ? app.status : app.status;
        else return;
      }

      // Create a new application from the resume version
      const displayRole = version.target_role ?? version.template_slug.replace(/_/g, ' ');
      const displayCompany = version.target_company ?? '';
      const newApp = createApplication({
        company: displayCompany, role: displayRole,
        status: targetStatus, jd_text: '', jd_url: '', location: '', notes: '',
      });
      // Link the version to this new application
      updateResumeVersion(versionId, { application_id: newApp.id, is_applied: true } as never);
      setApplications(prev => [...prev, newApp]);
      setRecentVersions(prev => prev.map(v => v.id === versionId ? { ...v, is_applied: true, application_id: newApp.id } : v));
      addToast('success', `Created application for ${displayCompany || displayRole}`);
      return;
    }

    // Dragging an application card
    const ALL_DROP_ZONES = ['applied', 'phone_screen', 'interview', 'decision', 'recently_generated'];
    let newStatus: ApplicationStatus | undefined;

    if (ALL_DROP_ZONES.includes(overIdStr)) {
      newStatus = overIdStr === 'decision' ? 'offer' : overIdStr as ApplicationStatus;
    } else {
      newStatus = applications.find(a => a.id === overIdStr)?.status;
    }

    if (newStatus && newStatus !== applications.find(a => a.id === activeIdStr)?.status) {
      handleUpdate(activeIdStr, { status: newStatus });
    }
  };

  const exportCSV = () => {
    const headers = ['Company', 'Role', 'Status', 'Interview Round', 'Location', 'Salary Min', 'Salary Max', 'Date Applied', 'Notes'];
    const rows = applications.map(a => [
      a.company, a.role, STATUS_LABELS[a.status as ApplicationStatus] ?? a.status, a.interview_round ?? '',
      a.location, a.salary_min ?? '', a.salary_max ?? '',
      new Date(a.created_at).toLocaleDateString(), a.notes,
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'applications.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const TOP_N = 5;
  const ALL_COLUMNS = ['recently_generated', ...TRACK_COLUMNS, 'decision'];

  const byRecent = (a: Application, b: Application) =>
    new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime();

  const getColApps = (col: string): Application[] => {
    const raw = col === 'decision'
      ? applications.filter(a => a.status === 'offer' || a.status === 'rejected')
      : applications.filter(a => a.status === (col as ApplicationStatus));
    return [...raw].sort(byRecent);
  };

  const activeCard = activeId && !activeId.startsWith('rv_')
    ? applications.find(a => a.id === activeId)
    : null;
  const activeVersion = activeId?.startsWith('rv_')
    ? recentVersions.find(v => v.id === activeId.slice(3))
    : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Job Applications</h2>
          <p className="text-sm text-slate-500">{applications.length} application{applications.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/applications"
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors">
            View All ↗
          </a>
          <button type="button" onClick={exportCSV}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors">
            ↓ CSV
          </button>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCorners}
        onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4">
          {ALL_COLUMNS.map(col => {
            const colApps = getColApps(col);
            const isRecent = col === 'recently_generated';
            const count = isRecent ? recentVersions.length : colApps.length;
            const visibleApps = colApps.slice(0, TOP_N);
            const hiddenCount = colApps.length - visibleApps.length;

            return (
              <DroppableColumn
                key={col}
                id={col}
                className={`shrink-0 w-48 rounded-xl border p-3 space-y-2 min-h-[220px] ${COLUMN_COLORS[col]}`}
              >
                {/* Column header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    {isRecent && <GenerateIcon size={11} className="text-slate-500" />}
                    <span className="text-xs font-semibold text-slate-300">{COLUMN_LABELS[col]}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-slate-800 text-slate-500">
                      {count}
                    </span>
                  </div>
                  {!isRecent && (
                    <button type="button" onClick={() => setAddingTo(col as ApplicationStatus)}
                      className="text-slate-600 hover:text-slate-300 text-sm transition-colors" title="Add">+</button>
                  )}
                </div>

                {/* Recently Generated column */}
                {isRecent && (
                  <SortableContext
                    items={recentVersions.slice(0, TOP_N).map(v => `rv_${v.id}`)}
                    strategy={verticalListSortingStrategy}
                  >
                    {recentVersions.length === 0 ? (
                      <div className="text-center py-6 text-xs text-slate-700">
                        Generate a resume to see it here
                      </div>
                    ) : (
                      recentVersions.slice(0, TOP_N).map(v => (
                        <RecentCard key={v.id} version={v} onMarkApplied={handleMarkApplied} />
                      ))
                    )}
                    {recentVersions.length > TOP_N && (
                      <a href="/applications"
                        className="block w-full py-1.5 text-center text-[10px] text-slate-500 hover:text-slate-300 transition-colors">
                        +{recentVersions.length - TOP_N} more →
                      </a>
                    )}
                  </SortableContext>
                )}

                {/* Application columns */}
                {!isRecent && (
                  <SortableContext items={visibleApps.map(a => a.id)} strategy={verticalListSortingStrategy}>
                    {visibleApps.map(app => (
                      <AppCard key={app.id} app={app} onOpen={setDetailApp} onDelete={handleDelete} onUpdate={handleUpdate} />
                    ))}
                    {hiddenCount > 0 && (
                      <a href="/applications"
                        className="block w-full py-1.5 text-center text-[10px] text-slate-500 hover:text-slate-300 transition-colors">
                        +{hiddenCount} more →
                      </a>
                    )}
                  </SortableContext>
                )}

                {!isRecent && addingTo === col && (
                  <AddCardForm status={col as ApplicationStatus} onAdd={handleAdd} onCancel={() => setAddingTo(null)} />
                )}

                {!isRecent && colApps.length === 0 && addingTo !== col && (
                  <button type="button" onClick={() => setAddingTo(col as ApplicationStatus)}
                    className="w-full py-5 border border-dashed border-slate-700/60 rounded-lg text-[11px]
                               text-slate-700 hover:text-slate-400 hover:border-slate-500 transition-colors text-center">
                    {col === 'decision' ? 'Drag here when decided' : '+ Add'}
                  </button>
                )}
              </DroppableColumn>
            );
          })}
        </div>

        {/* Drag overlay for app cards */}
        <DragOverlay>
          {activeCard && (
            <div className="bg-slate-900 border border-blue-500/50 rounded-lg p-2.5 w-48 shadow-2xl opacity-90 text-xs">
              <div className="font-medium text-slate-100 truncate">{activeCard.company}</div>
              <div className="text-slate-400 truncate">{activeCard.role}</div>
            </div>
          )}
          {activeVersion && (
            <div className="bg-slate-800 border border-blue-500/50 rounded-lg p-2.5 w-48 shadow-2xl opacity-90 text-xs">
              <div className="font-medium text-slate-200 capitalize truncate">
                {activeVersion.target_role ?? activeVersion.template_slug.replace(/_/g, ' ')}
              </div>
              {activeVersion.ats_score > 0 && (
                <span className="text-green-400">{activeVersion.ats_score}% ATS</span>
              )}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {detailApp && (
        <DetailPanel app={detailApp} onClose={() => setDetailApp(null)} onUpdate={handleUpdate} />
      )}
    </div>
  );
}
