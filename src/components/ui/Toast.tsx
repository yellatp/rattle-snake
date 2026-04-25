import { useAppStore } from '../../store/app';
import { CheckIcon, CloseIcon, WarningIcon } from './Icons';

const ToastIcon = { success: CheckIcon, error: CloseIcon, warning: WarningIcon, info: CloseIcon };

const colors = {
  success: 'border-green-500/40 bg-green-950/80 text-green-300',
  error: 'border-red-500/40 bg-red-950/80 text-red-300',
  warning: 'border-amber-500/40 bg-amber-950/80 text-amber-300',
  info: 'border-blue-500/40 bg-blue-950/80 text-blue-300',
};

export default function Toast() {
  const { toasts, removeToast } = useAppStore();

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => {
        const Icon = ToastIcon[t.type];
        return (
          <div
            key={t.id}
            className={`toast-enter pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-xl shadow-2xl max-w-sm ${colors[t.type]}`}
          >
            <Icon size={14} className="shrink-0" />
            <span className="text-sm flex-1">{t.message}</span>
            <button
              type="button"
              onClick={() => removeToast(t.id)}
              title="Dismiss"
              className="text-current opacity-60 hover:opacity-100 ml-2"
            >
              <CloseIcon size={11} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
