import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AIProvider = 'anthropic' | 'openai' | 'xai' | 'deepseek' | 'gemini' | 'kimi' | 'qwen';

export interface ProviderConfig {
  apiKey: string;
  model: string;
  enabled: boolean;
}

export interface ProviderConfigs {
  anthropic: ProviderConfig;
  openai:    ProviderConfig;
  xai:       ProviderConfig;
  deepseek:  ProviderConfig;
  gemini:    ProviderConfig;
  kimi:      ProviderConfig;
  qwen:      ProviderConfig;
}

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
}

interface AppState {
  activeProvider: AIProvider;
  setActiveProvider: (p: AIProvider) => void;

  providers: ProviderConfigs;
  setProviderConfig: (provider: AIProvider, config: Partial<ProviderConfig>) => void;

  toasts: Toast[];
  addToast: (type: Toast['type'], message: string) => void;
  removeToast: (id: string) => void;

  currentTemplateSlug: string | null;
  setCurrentTemplateSlug: (slug: string | null) => void;

  theme: 'dark' | 'light';
  setTheme: (t: 'dark' | 'light') => void;

  userBio: string;
  setUserBio: (bio: string) => void;
}

export const DEFAULT_PROVIDERS: ProviderConfigs = {
  anthropic: { apiKey: '', model: 'claude-sonnet-4-6',       enabled: false },
  openai:    { apiKey: '', model: 'gpt-4o',                  enabled: false },
  xai:       { apiKey: '', model: 'grok-2-latest',           enabled: false },
  deepseek:  { apiKey: '', model: 'deepseek-chat',           enabled: false },
  gemini:    { apiKey: '', model: 'gemini-2.0-flash',        enabled: false },
  kimi:      { apiKey: '', model: 'moonshot-v1-32k',         enabled: false },
  qwen:      { apiKey: '', model: 'qwen-plus',               enabled: false },
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      activeProvider: 'anthropic',
      setActiveProvider: (p) => set({ activeProvider: p }),

      providers: DEFAULT_PROVIDERS,
      setProviderConfig: (provider, config) =>
        set((state) => ({
          providers: {
            ...state.providers,
            [provider]: { ...state.providers[provider], ...config },
          },
        })),

      toasts: [],
      addToast: (type, message) =>
        set((state) => {
          const id = crypto.randomUUID();
          setTimeout(() => { useAppStore.getState().removeToast(id); }, 4000);
          return { toasts: [...state.toasts, { id, type, message }] };
        }),
      removeToast: (id) =>
        set((state) => ({ toasts: state.toasts.filter(t => t.id !== id) })),

      currentTemplateSlug: null,
      setCurrentTemplateSlug: (slug) => set({ currentTemplateSlug: slug }),

      theme: 'dark',
      setTheme: (t) => set({ theme: t }),

      userBio: '',
      setUserBio: (bio) => set({ userBio: bio }),
    }),
    {
      name: 'resumeflow-app',
      partialize: (state) => ({
        activeProvider: state.activeProvider,
        providers: Object.fromEntries(
          Object.entries(state.providers).map(([k, v]) => [k, { ...v, apiKey: '' }])
        ),
        theme: state.theme,
        currentTemplateSlug: state.currentTemplateSlug,
        userBio: state.userBio,
      }),
      // Deep-merge providers so newly-added providers (kimi, qwen, etc.) are never
      // missing when old localStorage data predates their addition.
      merge: (persisted, current) => {
        const ps = persisted as Partial<typeof current>;
        return {
          ...current,
          ...ps,
          providers: { ...current.providers, ...(ps.providers ?? {}) },
        };
      },
    }
  )
);

export const keyStore = {
  get(provider: AIProvider): string {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem(`rf_key_${provider}`) ?? '';
  },
  set(provider: AIProvider, key: string): void {
    if (typeof window === 'undefined') return;
    if (key) {
      localStorage.setItem(`rf_key_${provider}`, key);
    } else {
      localStorage.removeItem(`rf_key_${provider}`);
    }
  },
  remove(provider: AIProvider): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(`rf_key_${provider}`);
  },
};
