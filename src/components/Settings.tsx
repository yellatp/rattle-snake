import { useState, useEffect, useRef } from 'react';
import { useAppStore, keyStore, DEFAULT_PROVIDERS, type AIProvider } from '../store/app';
import { useProfileStore } from '../store/profiles';
import { UserIcon, EyeIcon, EyeOffIcon, CloseIcon } from './ui/Icons';

interface ProviderDef {
  id: AIProvider;
  name: string;
  logo: string;
  models: string[];
  docsUrl: string;
  placeholder: string;
}

const PROVIDERS: ProviderDef[] = [
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    logo: '◆',
    models: ['claude-sonnet-4-6', 'claude-opus-4-7', 'claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-opus-4-5'],
    docsUrl: 'https://console.anthropic.com/account/keys',
    placeholder: 'sk-ant-...',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    logo: '◉',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1', 'o1-mini'],
    docsUrl: 'https://platform.openai.com/api-keys',
    placeholder: 'sk-...',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    logo: '✦',
    models: ['gemini-2.0-flash', 'gemini-2.5-pro', 'gemini-1.5-flash', 'gemini-1.5-pro'],
    docsUrl: 'https://aistudio.google.com/app/apikey',
    placeholder: 'AIza...',
  },
  {
    id: 'xai',
    name: 'xAI (Grok)',
    logo: '✕',
    models: ['grok-2-latest', 'grok-2-mini', 'grok-beta'],
    docsUrl: 'https://console.x.ai/',
    placeholder: 'xai-...',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    logo: '⟡',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    docsUrl: 'https://platform.deepseek.com/api_keys',
    placeholder: 'sk-...',
  },
  {
    id: 'kimi',
    name: 'Moonshot KIMI',
    logo: '☽',
    models: ['moonshot-v1-128k', 'moonshot-v1-32k', 'moonshot-v1-8k'],
    docsUrl: 'https://platform.moonshot.cn/console/api-keys',
    placeholder: 'sk-...',
  },
  {
    id: 'qwen',
    name: 'Alibaba Qwen',
    logo: '⬡',
    models: ['qwen-plus', 'qwen-max', 'qwen-turbo', 'qwen2.5-72b-instruct', 'qwen2.5-14b-instruct'],
    docsUrl: 'https://dashscope.console.aliyun.com/apiKey',
    placeholder: 'sk-...',
  },
];

const ALL_PROVIDER_IDS = PROVIDERS.map(p => p.id);

type TestStatus = 'idle' | 'testing' | 'ok' | 'error';

export default function Settings() {
  const { activeProvider, setActiveProvider, providers, setProviderConfig, addToast, userBio, setUserBio } = useAppStore();
  const { getActiveProfile, updateProfile, activeProfileId } = useProfileStore();

  const activeProfile = getActiveProfile();

  const [keys, setKeys] = useState<Record<AIProvider, string>>(() =>
    Object.fromEntries(ALL_PROVIDER_IDS.map(id => [id, keyStore.get(id)])) as Record<AIProvider, string>
  );
  const [bioValue, setBioValue] = useState(() => activeProfile?.bio ?? userBio);
  const bioSavedRef = useRef(false);

  const [selectedProvider, setSelectedProvider] = useState<AIProvider>('anthropic');
  const [showKey, setShowKey] = useState(false);
  const [testStatus, setTestStatus] = useState<Record<AIProvider, { status: TestStatus; message?: string }>>(
    Object.fromEntries(ALL_PROVIDER_IDS.map(id => [id, { status: 'idle' as TestStatus }])) as Record<AIProvider, { status: TestStatus; message?: string }>
  );

  useEffect(() => {
    setBioValue(activeProfile?.bio ?? userBio);
  }, [activeProfileId, activeProfile?.bio, userBio]);

  const handleSaveKey = (provider: AIProvider, key: string) => {
    keyStore.set(provider, key);
    setProviderConfig(provider, { apiKey: key, enabled: !!key });
    addToast('success', `${provider} API key saved`);
  };

  const handleRemoveKey = (provider: AIProvider) => {
    keyStore.remove(provider);
    setKeys(prev => ({ ...prev, [provider]: '' }));
    setProviderConfig(provider, { apiKey: '', enabled: false });
    addToast('info', `${provider} API key removed`);
  };

  const handleTest = async (provider: AIProvider) => {
    const key = keys[provider];
    if (!key) { addToast('error', 'Enter an API key first'); return; }

    setTestStatus(prev => ({ ...prev, [provider]: { status: 'testing' } }));

    try {
      let ok = false;
      let msg = '';
      const cfg = providers[provider] ?? DEFAULT_PROVIDERS[provider];

      if (provider === 'anthropic') {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({ model: cfg.model, max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] }),
        });
        ok = res.status === 200; msg = ok ? 'Connected' : `HTTP ${res.status}`;
      } else if (provider === 'gemini') {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent?key=${key}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: 'hi' }] }], generationConfig: { maxOutputTokens: 10 } }),
          }
        );
        ok = res.status === 200; msg = ok ? 'Connected' : `HTTP ${res.status}`;
      } else {
        const endpoints: Record<string, string> = {
          openai:   'https://api.openai.com/v1/chat/completions',
          xai:      'https://api.x.ai/v1/chat/completions',
          deepseek: 'https://api.deepseek.com/chat/completions',
          kimi:     'https://api.moonshot.cn/v1/chat/completions',
          qwen:     'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
        };
        const res = await fetch(endpoints[provider] ?? '', {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: cfg.model, max_tokens: 5, messages: [{ role: 'user', content: 'hi' }] }),
        });
        ok = res.status === 200; msg = ok ? 'Connected' : `HTTP ${res.status}`;
      }

      setTestStatus(prev => ({ ...prev, [provider]: { status: ok ? 'ok' : 'error', message: msg } }));
      if (ok) { handleSaveKey(provider, key); setActiveProvider(provider); }
    } catch (e) {
      setTestStatus(prev => ({
        ...prev,
        [provider]: { status: 'error', message: e instanceof Error ? e.message : 'Network error' },
      }));
    }
  };

  const handleSaveBio = () => {
    if (activeProfile && activeProfileId) {
      updateProfile(activeProfileId, { bio: bioValue });
    }
    setUserBio(bioValue);
    bioSavedRef.current = true;
    addToast('success', 'Your story saved');
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Settings</h1>
          <p className="text-sm text-slate-400 mt-1">
            API keys are stored in your browser only — never sent to any server.
          </p>
        </div>
        <a
          href="/profile"
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-sm text-slate-300 hover:text-slate-100 transition-all"
        >
          <UserIcon size={15} className="text-slate-400" />
          {activeProfile ? (
            <span>{activeProfile.displayName}</span>
          ) : (
            <span>Manage Profiles</span>
          )}
          <span className="text-slate-600">→</span>
        </a>
      </div>

      {/* Provider grid — compact tiles + detail panel */}
      <div className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">AI Providers — BYOK</h2>

        {/* 4-column tile grid */}
        <div className="grid grid-cols-4 gap-2">
          {PROVIDERS.map((prov) => {
            const cfg = providers[prov.id] ?? DEFAULT_PROVIDERS[prov.id];
            const isActive = activeProvider === prov.id;
            const isSelected = selectedProvider === prov.id;
            const hasKey = !!keys[prov.id];

            return (
              <button
                key={prov.id}
                type="button"
                onClick={() => setSelectedProvider(prov.id)}
                className={`rounded-lg border p-2.5 text-left transition-all ${
                  isSelected
                    ? 'border-blue-500/60 bg-blue-950/30'
                    : isActive
                    ? 'border-blue-800/40 bg-blue-950/10 hover:border-blue-600/40'
                    : 'border-slate-800 bg-slate-900 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="text-base leading-none">{prov.logo}</span>
                  <div className="flex gap-1">
                    {isActive && (
                      <span className="px-1 py-0.5 rounded text-[8px] font-bold bg-blue-600/40 text-blue-300">ACT</span>
                    )}
                    {cfg.enabled && !isActive && (
                      <span className="px-1 py-0.5 rounded text-[8px] font-bold bg-green-600/20 text-green-400">OK</span>
                    )}
                    {!cfg.enabled && hasKey && (
                      <span className="px-1 py-0.5 rounded text-[8px] font-bold bg-amber-600/20 text-amber-400">KEY</span>
                    )}
                  </div>
                </div>
                <div className="text-[11px] font-medium text-slate-300 leading-tight">{prov.name}</div>
              </button>
            );
          })}
        </div>

        {/* Detail panel for selected provider */}
        {(() => {
          const prov = PROVIDERS.find(p => p.id === selectedProvider)!;
          const cfg = providers[prov.id] ?? DEFAULT_PROVIDERS[prov.id];
          const key = keys[prov.id];
          const result = testStatus[prov.id];
          const isActive = activeProvider === prov.id;

          return (
            <div className={`rounded-xl border p-4 transition-all ${
              isActive ? 'border-blue-500/40 bg-blue-950/20' : 'border-slate-700 bg-slate-900'
            }`}>
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <span className="text-lg leading-none">{prov.logo}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-slate-100 text-sm">{prov.name}</h3>
                      {isActive && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-600/30 text-blue-400 border border-blue-500/30">ACTIVE</span>
                      )}
                      {cfg.enabled && !isActive && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-green-600/20 text-green-400">READY</span>
                      )}
                    </div>
                    {result.status === 'ok' && <div className="text-[10px] text-green-400 mt-0.5">✓ {result.message}</div>}
                    {result.status === 'error' && <div className="text-[10px] text-red-400 mt-0.5">✕ {result.message}</div>}
                  </div>
                </div>
                <a href={prov.docsUrl} target="_blank" rel="noopener noreferrer"
                   className="text-[10px] text-slate-500 hover:text-blue-400 transition-colors">
                  Get API key ↗
                </a>
              </div>

              {/* Key + model row */}
              <div className="grid grid-cols-5 gap-2 mb-3">
                <div className="col-span-3 relative">
                  <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">API Key</label>
                  <div className="relative">
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={key}
                      onChange={(e) => setKeys(prev => ({ ...prev, [prov.id]: e.target.value }))}
                      placeholder={prov.placeholder}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100
                                 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 pr-8"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(v => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                    >
                      {showKey ? <EyeOffIcon size={12} /> : <EyeIcon size={12} />}
                    </button>
                  </div>
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">Model</label>
                  <select
                    aria-label={`${prov.name} model`}
                    value={cfg.model}
                    onChange={(e) => setProviderConfig(prov.id, { model: e.target.value })}
                    className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-100
                               focus:outline-none focus:border-blue-500 w-full"
                  >
                    {prov.models.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => handleSaveKey(prov.id, key)}
                  className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs transition-colors">
                  Save Key
                </button>
                <button type="button" onClick={() => handleTest(prov.id)} disabled={!key || result.status === 'testing'}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-40
                             text-slate-200 rounded-lg text-xs transition-colors">
                  {result.status === 'testing' ? (
                    <><span className="w-2.5 h-2.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />Testing...</>
                  ) : 'Test'}
                </button>
                {cfg.enabled && (
                  <button type="button" onClick={() => setActiveProvider(prov.id)} disabled={isActive}
                    className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                      isActive ? 'bg-blue-600/30 text-blue-400 cursor-default' : 'bg-blue-600 hover:bg-blue-500 text-white'
                    }`}>
                    {isActive ? 'Active' : 'Set Active'}
                  </button>
                )}
                {key && (
                  <button type="button" onClick={() => handleRemoveKey(prov.id)} title="Remove key"
                    className="ml-auto px-2 py-1.5 bg-red-900/20 hover:bg-red-900/40 text-red-400 rounded-lg text-xs transition-colors flex items-center gap-1">
                    <CloseIcon size={10} /> Remove
                  </button>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Preferences */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <h3 className="font-medium text-slate-100 mb-4">Preferences</h3>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-slate-300">Theme</div>
            <div className="text-xs text-slate-500">Dark mode is enabled by default</div>
          </div>
          <button type="button" className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-300 transition-colors">
            Dark ◑
          </button>
        </div>
      </div>

      {/* Your Story */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-medium text-slate-100">Your Story</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Career arc, motivations, key wins — used for cover letters and Q&A answers.
              {activeProfile && (
                <span className="ml-1 text-blue-400">Synced to profile: {activeProfile.displayName}</span>
              )}
            </p>
          </div>
          <a href="/profile" className="shrink-0 text-xs text-slate-500 hover:text-blue-400 transition-colors">
            Edit profile →
          </a>
        </div>
        <textarea
          value={bioValue}
          onChange={(e) => { setBioValue(e.target.value); bioSavedRef.current = false; }}
          rows={10}
          placeholder={`Example:\nI'm a data scientist with 3 years of experience in retail and fintech...\n\nBiggest wins: built a search system that cut hallucinations by 38%, co-managed a fund that returned 51% by automating the research pipeline.\n\nLooking for a team where data work directly influences product decisions.`}
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100
                     placeholder:text-slate-600 focus:outline-none focus:border-blue-500 resize-y font-mono leading-relaxed"
        />
        <div className="flex items-center gap-3">
          <button type="button" onClick={handleSaveBio}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm transition-colors">
            Save Story
          </button>
          {bioValue.trim() && (
            <span className="text-xs text-slate-500">{bioValue.trim().split(/\s+/).length} words</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <img src="/rattle-snake.png" alt="Rattle-Snake" className="w-6 h-6 rounded object-cover opacity-50" />
        <p className="text-xs text-slate-600">
          Rattle-Snake v1.0 · Keys stored in browser localStorage · No server-side storage · 7 AI providers
        </p>
      </div>
    </div>
  );
}
