import { useAppStore, keyStore } from '../../store/app';
import { useProfileStore } from '../../store/profiles';
import {
  DashboardIcon, GenerateIcon, ApplicationsIcon,
  InterviewIcon, SettingsIcon, UserIcon,
} from './Icons';

interface NavItem {
  href: string;
  label: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  shortcut: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/',               label: 'Dashboard',      Icon: DashboardIcon,    shortcut: 'G D' },
  { href: '/generate',       label: 'Generate',       Icon: GenerateIcon,     shortcut: 'G G' },
  { href: '/applications',   label: 'Applications',   Icon: ApplicationsIcon, shortcut: 'G A' },
  { href: '/interview-prep', label: 'Interview Prep', Icon: InterviewIcon,    shortcut: 'G I' },
  { href: '/profile',        label: 'Profile',        Icon: UserIcon,         shortcut: 'G P' },
  { href: '/settings',       label: 'Settings',       Icon: SettingsIcon,     shortcut: 'G S' },
];

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Claude',
  openai:    'GPT',
  xai:       'Grok',
  deepseek:  'DeepSeek',
  gemini:    'Gemini',
  kimi:      'KIMI',
  qwen:      'Qwen',
};

interface SidebarProps {
  currentPath: string;
}

export default function Sidebar({ currentPath }: SidebarProps) {
  const { activeProvider, providers } = useAppStore();
  const { getActiveProfile } = useProfileStore();
  const hasKey = typeof window !== 'undefined' && !!keyStore.get(activeProvider);
  const activeProfile = getActiveProfile();

  const initials = activeProfile
    ? (() => {
        const parts = (activeProfile.fullName || activeProfile.displayName).trim().split(/\s+/);
        return parts.length >= 2
          ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
          : (activeProfile.fullName || activeProfile.displayName).slice(0, 2).toUpperCase();
      })()
    : null;

  return (
    <aside className="fixed left-0 top-0 h-screen w-56 bg-slate-950 border-r border-slate-800/60 flex flex-col z-40">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-slate-800/60">
        <div className="flex items-center gap-2.5">
          <img src="/rattle-snake.png" alt="Rattle-Snake" className="w-7 h-7 rounded-lg object-cover" />
          <div>
            <span className="font-semibold text-slate-100 text-sm tracking-tight">Rattle-Snake</span>
            <div className="text-[10px] text-slate-600 tracking-widest uppercase">Career Intelligence Assistant</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ href, label, Icon, shortcut }) => {
          const isActive = currentPath === href ||
            (href !== '/' && currentPath.startsWith(href));
          return (
            <a
              key={href}
              href={href}
              title={`${label} (${shortcut})`}
              className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 ${
                isActive
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/25'
                  : 'text-slate-500 hover:text-slate-100 hover:bg-slate-800/80'
              }`}
            >
              <Icon
                size={15}
                className={isActive ? 'text-blue-400' : 'text-slate-500 group-hover:text-slate-300'}
              />
              <span className="flex-1 font-medium">{label}</span>
              <kbd className="hidden group-hover:flex items-center text-[9px] text-slate-700 font-mono bg-slate-800 px-1.5 py-0.5 rounded">
                {shortcut}
              </kbd>
            </a>
          );
        })}
      </nav>

      {/* Active profile */}
      {activeProfile && (
        <div className="px-3 pt-2 border-t border-slate-800/60">
          <a href="/profile"
            className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-slate-800 transition-colors group">
            <div className="w-6 h-6 rounded-md bg-blue-600/30 border border-blue-500/30 flex items-center justify-center
                            text-[9px] font-bold text-blue-300 shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-slate-300 group-hover:text-slate-100 transition-colors truncate font-medium">
                {activeProfile.displayName}
              </div>
              {activeProfile.currentTitle && (
                <div className="text-[10px] text-slate-600 truncate">{activeProfile.currentTitle}</div>
              )}
            </div>
          </a>
        </div>
      )}

      {/* Active provider indicator */}
      <div className={`px-3 py-3 ${activeProfile ? '' : 'border-t border-slate-800/60'}`}>
        <a href="/settings"
          className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-slate-800 transition-colors group">
          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${hasKey ? 'bg-green-500' : 'bg-slate-600'}`} />
          <div className="flex-1 min-w-0">
            <div className="text-xs text-slate-400 group-hover:text-slate-200 transition-colors truncate">
              {hasKey ? PROVIDER_LABELS[activeProvider] ?? activeProvider : 'No API key'}
            </div>
            {hasKey && (
              <div className="text-[10px] text-slate-600 truncate">{providers[activeProvider].model}</div>
            )}
          </div>
        </a>
      </div>
    </aside>
  );
}
