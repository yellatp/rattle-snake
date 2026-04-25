import { useState, useEffect } from 'react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  getApplications, createApplication, updateApplication, deleteApplication,
  type Application, type ApplicationStatus,
} from '../lib/db/queries';
import { STATUS_LABELS } from '../lib/db/schema';
import { useAppStore } from '../store/app';
import { formatDistanceToNow } from 'date-fns';
import { LocationIcon, CloseIcon } from './ui/Icons';

const STATUS_COLORS: Record<ApplicationStatus, string> = {
  wishlist:     'border-slate-700 bg-slate-900',
  applied:      'border-blue-800/50 bg-blue-950/20',
  phone_screen: 'border-amber-800/50 bg-amber-950/20',
  interview:    'border-purple-800/50 bg-purple-950/20',
  offer:        'border-green-800/50 bg-green-950/20',
  rejected:     'border-red-800/50 bg-red-950/20',
};

const STATUS_BADGE: Record<ApplicationStatus, string> = {
  wishlist:     'bg-slate-800 text-slate-400',
  applied:      'bg-blue-900/50 text-blue-400',
  phone_screen: 'bg-amber-900/50 text-amber-400',
  interview:    'bg-purple-900/50 text-purple-400',
  offer:        'bg-green-900/50 text-green-400',
  rejected:     'bg-red-900/50 text-red-400',
};

interface ApplicationCardProps {
  app: Application;
  onOpen: (app: Application) => void;
  onDelete: (id: string) => void;
}

function ApplicationCard({ app, onOpen, onDelete }: ApplicationCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: app.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`bg-slate-900 border border-slate-800 rounded-lg p-3 cursor-grab active:cursor-grabbing
                  hover:border-slate-600 transition-all ${isDragging ? 'opacity-50 scale-105 rotate-1' : ''}`}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <div className="font-medium text-slate-100 text-sm truncate">{app.company}</div>
          <div className="text-xs text-slate-400 truncate">{app.role}</div>
        </div>
        <div className="flex gap-1 ml-2 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onOpen(app); }}
            onPointerDown={e => e.stopPropagation()}
            className="p-1 text-slate-600 hover:text-slate-300 transition-colors text-xs"
          >
            ↗
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(app.id); }}
            onPointerDown={e => e.stopPropagation()}
            className="p-1 text-slate-700 hover:text-red-400 transition-colors text-xs"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[10px] text-slate-600">
          {formatDistanceToNow(new Date(app.created_at), { addSuffix: true })}
        </span>
        {app.salary_min && (
          <span className="text-[10px] text-green-400">
            ${(app.salary_min / 1000).toFixed(0)}k{app.salary_max ? `–${(app.salary_max / 1000).toFixed(0)}k` : '+'}
          </span>
        )}
      </div>

      {app.location && (
        <div className="text-[10px] text-slate-600 mt-1 flex items-center gap-1"><LocationIcon size={10} />{app.location}</div>
      )}
    </div>
  );
}

interface AddCardFormProps {
  status: ApplicationStatus;
  onAdd: (data: Pick<Application, 'company' | 'role' | 'status'>) => void;
  onCancel: () => void;
}

function AddCardForm({ status, onAdd, onCancel }: AddCardFormProps) {
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 space-y-2">
      <input
        autoFocus
        value={company} onChange={e => setCompany(e.target.value)}
        placeholder="Company name"
        className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-xs text-slate-100
                   placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
      />
      <input
        value={role} onChange={e => setRole(e.target.value)}
        placeholder="Job title"
        className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-xs text-slate-100
                   placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
      />
      <div className="flex gap-2">
        <button
          onClick={() => { if (company && role) onAdd({ company, role, status }); }}
          className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs transition-colors"
        >
          Add
        </button>
        <button onClick={onCancel} className="py-1.5 px-3 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded text-xs">
          Cancel
        </button>
      </div>
    </div>
  );
}

interface DetailPanelProps {
  app: Application;
  onClose: () => void;
  onUpdate: (id: string, data: Partial<Application>) => void;
}

function DetailPanel({ app, onClose, onUpdate }: DetailPanelProps) {
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

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div>
            <h3 className="font-semibold text-slate-100">{app.company}</h3>
            <p className="text-sm text-slate-400">{app.role}</p>
          </div>
          <button type="button" onClick={onClose} title="Close" className="text-slate-500 hover:text-slate-300"><CloseIcon size={14} /></button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Status</label>
            <select
              value={app.status}
              onChange={e => onUpdate(app.id, { status: e.target.value as ApplicationStatus })}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 w-full
                         focus:outline-none focus:border-blue-500"
            >
              {(Object.entries(STATUS_LABELS) as [ApplicationStatus, string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
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

          {/* Salary range bar */}
          {salaryMin && salaryMax && Number(salaryMin) > 0 && Number(salaryMax) > Number(salaryMin) && (
            <SalaryBar min={Number(salaryMin)} max={Number(salaryMax)} />
          )}

          <div>
            <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Notes</label>
            <textarea
              value={notes} onChange={e => setNotes(e.target.value)}
              rows={4} placeholder="Interview notes, recruiter contacts, next steps..."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100
                         placeholder:text-slate-600 focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          <div className="text-xs text-slate-600">
            Applied {formatDistanceToNow(new Date(app.created_at), { addSuffix: true })}
            {app.jd_url && (
              <a href={app.jd_url} target="_blank" rel="noopener noreferrer"
                 className="ml-3 text-blue-500 hover:text-blue-400">
                View Job Posting ↗
              </a>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-800">
          <button onClick={onClose} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm">
            Cancel
          </button>
          <button onClick={handleSave} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm">
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

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

export default function JobTracker() {
  const { addToast } = useAppStore();
  const [applications, setApplications] = useState<Application[]>([]);
  const [addingTo, setAddingTo] = useState<ApplicationStatus | null>(null);
  const [detailApp, setDetailApp] = useState<Application | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const COLUMNS: ApplicationStatus[] = ['wishlist', 'applied', 'phone_screen', 'interview', 'offer', 'rejected'];

  useEffect(() => {
    setApplications(getApplications());
  }, []);

  const handleAdd = (data: Pick<Application, 'company' | 'role' | 'status'>) => {
    const newApp = createApplication({
      ...data,
      jd_text: '', jd_url: '', location: '', notes: '',
    });
    setApplications(prev => [...prev, newApp]);
    setAddingTo(null);
    addToast('success', `Added ${data.company} to ${STATUS_LABELS[data.status]}`);
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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const overId = String(over.id);
    const newStatus = COLUMNS.includes(overId as ApplicationStatus)
      ? (overId as ApplicationStatus)
      : applications.find(a => a.id === overId)?.status;

    if (newStatus) {
      handleUpdate(String(active.id), { status: newStatus });
    }
  };

  const exportCSV = () => {
    const headers = ['Company', 'Role', 'Status', 'Location', 'Salary Min', 'Salary Max', 'Date Applied', 'Notes'];
    const rows = applications.map(a => [
      a.company, a.role, STATUS_LABELS[a.status], a.location,
      a.salary_min ?? '', a.salary_max ?? '',
      new Date(a.created_at).toLocaleDateString(), a.notes,
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'applications.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Job Applications</h2>
          <p className="text-sm text-slate-500">{applications.length} application{applications.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={exportCSV} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors">
          ↓ Export CSV
        </button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4">
          {COLUMNS.map(status => {
            const colApps = applications.filter(a => a.status === status);
            return (
              <div
                key={status}
                id={status}
                className={`shrink-0 w-56 rounded-xl border p-3 space-y-2 min-h-[200px] ${STATUS_COLORS[status]}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-300">{STATUS_LABELS[status]}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_BADGE[status]}`}>
                      {colApps.length}
                    </span>
                  </div>
                  <button
                    onClick={() => setAddingTo(status)}
                    className="text-slate-600 hover:text-slate-300 text-sm transition-colors"
                    title="Add application"
                  >
                    +
                  </button>
                </div>

                <SortableContext items={colApps.map(a => a.id)} strategy={verticalListSortingStrategy}>
                  {colApps.map(app => (
                    <ApplicationCard key={app.id} app={app} onOpen={setDetailApp} onDelete={handleDelete} />
                  ))}
                </SortableContext>

                {addingTo === status && (
                  <AddCardForm status={status} onAdd={handleAdd} onCancel={() => setAddingTo(null)} />
                )}

                {colApps.length === 0 && addingTo !== status && (
                  <button
                    onClick={() => setAddingTo(status)}
                    className="w-full py-6 border border-dashed border-slate-700 rounded-lg text-xs text-slate-600
                               hover:text-slate-400 hover:border-slate-500 transition-colors text-center"
                  >
                    + Add application
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </DndContext>

      {detailApp && (
        <DetailPanel
          app={detailApp}
          onClose={() => setDetailApp(null)}
          onUpdate={handleUpdate}
        />
      )}
    </div>
  );
}
