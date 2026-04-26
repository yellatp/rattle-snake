/**
 * Shared context bar rendered at the top of Resume, Cover Letter, and Interview Prep.
 *
 * - Shows the active job target (company · role) with a live dot
 * - "Apply" button fills the parent form from the active job
 * - "Pin" button saves the current form values as the active job
 * - "Edit" opens the modal to change the active job
 */
import { useJobContext } from '../store/jobContext';
import { PinIcon } from './ui/Icons';

interface Props {
  /** Current values in the parent form */
  company: string;
  roleTitle: string;
  jobDescription: string;
  /** Callbacks to fill the parent form — location is the stored location from the active job */
  onApply: (company: string, roleTitle: string, location: string, jobDescription: string) => void;
  /** Save the current form values as the active job */
  onPin: () => void;
}

export default function JobContextBar({ company, roleTitle, jobDescription, onApply, onPin }: Props) {
  const { active, openModal } = useJobContext();

  const isApplied =
    active &&
    active.company === company &&
    active.roleTitle === roleTitle &&
    active.jobDescription === jobDescription;

  const hasFormContent = company.trim() || roleTitle.trim() || jobDescription.trim();

  return (
    <div className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-xs transition-colors ${
      active
        ? 'bg-blue-950/20 border-blue-900/30'
        : 'bg-slate-900/60 border-slate-800'
    }`}>
      {/* Status dot */}
      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${active ? 'bg-blue-400' : 'bg-slate-700'}`} />

      {/* Label */}
      <div className="flex-1 min-w-0">
        {active ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-slate-300 font-medium truncate">
              {[active.company, active.roleTitle].filter(Boolean).join(' · ') || 'Job target set'}
            </span>
            {active.location && (
              <span className="text-[10px] text-slate-500 font-mono truncate">{active.location}</span>
            )}
          </div>
        ) : (
          <span className="text-slate-600">Paste a job here — all tools auto-fill from it</span>
        )}
      </div>

      {/* Apply — pull active job into this form */}
      {active && !isApplied && (
        <button
          type="button"
          onClick={() => onApply(active.company, active.roleTitle, active.location ?? '', active.jobDescription)}
          className="flex items-center gap-1 px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600/40
                     border border-blue-700/30 rounded-lg text-blue-400 hover:text-blue-300
                     transition-colors font-medium shrink-0"
          title="Fill this form from the active job target"
        >
          ↓ Apply
        </button>
      )}

      {/* Already applied indicator */}
      {isApplied && (
        <span className="text-[10px] text-blue-500 font-mono shrink-0">✓ applied</span>
      )}

      {/* Pin — push current form into the store */}
      {hasFormContent && !isApplied && (
        <button
          type="button"
          onClick={onPin}
          className="px-2.5 py-1 text-slate-600 hover:text-slate-300 border border-slate-800
                     hover:border-slate-600 rounded-lg transition-colors shrink-0"
          title="Save current form as active job target"
        >
          <PinIcon size={11} className="inline mr-1" />Pin
        </button>
      )}

      {/* Edit / Set */}
      <button
        type="button"
        onClick={openModal}
        className="px-2.5 py-1 text-slate-600 hover:text-slate-300 border border-slate-800
                   hover:border-slate-600 rounded-lg transition-colors shrink-0"
      >
        {active ? 'Edit' : '+ Set target'}
      </button>
    </div>
  );
}
