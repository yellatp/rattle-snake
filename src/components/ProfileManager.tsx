import { useState } from 'react';
import { useProfileStore, hashPin, verifyPin, type UserProfile } from '../store/profiles';
import { useAppStore } from '../store/app';

type View = 'list' | 'edit' | 'create';

function Initials({ name }: { name: string }) {
  const parts = name.trim().split(/\s+/);
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
  return (
    <div className="w-9 h-9 rounded-lg bg-blue-600/30 border border-blue-500/30 flex items-center justify-center
                    text-xs font-bold text-blue-300 shrink-0">
      {initials || '?'}
    </div>
  );
}

function Field({
  label, value, onChange, placeholder, type = 'text',
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100
                   placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
      />
    </div>
  );
}

function ProfileForm({
  initial,
  onSave,
  onCancel,
  isNew = false,
}: {
  initial: Partial<UserProfile>;
  onSave: (data: Partial<UserProfile>) => void;
  onCancel: () => void;
  isNew?: boolean;
}) {
  const [form, setForm] = useState<Partial<UserProfile>>(initial);
  const [enablePin, setEnablePin] = useState(!!initial.isProtected);
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinError, setPinError] = useState('');

  const set = (key: keyof UserProfile, val: string | boolean) =>
    setForm(prev => ({ ...prev, [key]: val }));

  const handleSave = async () => {
    const updates: Partial<UserProfile> = { ...form };

    if (enablePin) {
      if (!pin) { setPinError('Enter a PIN'); return; }
      if (pin.length < 4) { setPinError('PIN must be at least 4 characters'); return; }
      if (isNew || pin) {
        if (pin !== pinConfirm) { setPinError('PINs do not match'); return; }
        updates.pinHash = await hashPin(pin);
      }
      updates.isProtected = true;
    } else {
      updates.isProtected = false;
      updates.pinHash = undefined;
    }

    setPinError('');
    onSave(updates);
  };

  return (
    <div className="space-y-5">
      <Field label="Profile Name" value={form.displayName ?? ''} onChange={v => set('displayName', v)}
        placeholder="e.g. Data Science, Work, Personal" />

      <div className="border-t border-slate-800 pt-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">Contact Info</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Full Name" value={form.fullName ?? ''} onChange={v => set('fullName', v)} placeholder="Jane Doe" />
          <Field label="Email" value={form.email ?? ''} onChange={v => set('email', v)} placeholder="jane@email.com" type="email" />
          <Field label="Phone" value={form.phone ?? ''} onChange={v => set('phone', v)} placeholder="+1 (555) 000-0000" />
          <Field label="Location" value={form.location ?? ''} onChange={v => set('location', v)} placeholder="Austin, TX" />
        </div>
      </div>

      <div className="border-t border-slate-800 pt-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">Professional Links</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="LinkedIn" value={form.linkedin ?? ''} onChange={v => set('linkedin', v)} placeholder="linkedin.com/in/..." />
          <Field label="GitHub" value={form.github ?? ''} onChange={v => set('github', v)} placeholder="github.com/..." />
          <Field label="Portfolio" value={form.portfolio ?? ''} onChange={v => set('portfolio', v)} placeholder="yoursite.dev" />
          <Field label="Current Title" value={form.currentTitle ?? ''} onChange={v => set('currentTitle', v)} placeholder="Data Scientist" />
        </div>
      </div>

      <div className="border-t border-slate-800 pt-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">Your Story</p>
        <textarea
          value={form.bio ?? ''}
          onChange={(e) => set('bio', e.target.value)}
          rows={6}
          placeholder="Career arc, motivations, key wins — used for cover letters and Q&A answers..."
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100
                     placeholder:text-slate-600 focus:outline-none focus:border-blue-500 resize-y font-mono leading-relaxed"
        />
      </div>

      {/* PIN protection */}
      <div className="border-t border-slate-800 pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-300">PIN Protection</p>
            <p className="text-xs text-slate-500">Require a PIN to switch to this profile</p>
          </div>
          <button
            type="button"
            onClick={() => { setEnablePin(p => !p); setPin(''); setPinConfirm(''); setPinError(''); }}
            className={`relative w-10 h-5 rounded-full transition-colors ${enablePin ? 'bg-blue-600' : 'bg-slate-700'}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${enablePin ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>
        {enablePin && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">PIN</label>
              <input type="password" value={pin} onChange={e => setPin(e.target.value)} placeholder="Min 4 chars"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100
                           placeholder:text-slate-600 focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Confirm PIN</label>
              <input type="password" value={pinConfirm} onChange={e => setPinConfirm(e.target.value)} placeholder="Repeat PIN"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100
                           placeholder:text-slate-600 focus:outline-none focus:border-blue-500" />
            </div>
            {pinError && <p className="col-span-2 text-xs text-red-400">{pinError}</p>}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button type="button" onClick={handleSave}
          className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors">
          {isNew ? 'Create Profile' : 'Save Changes'}
        </button>
        <button type="button" onClick={onCancel}
          className="px-4 py-2 text-slate-400 hover:text-slate-200 text-sm transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}

function PinModal({
  profileName,
  onUnlock,
  onCancel,
}: {
  profileName: string;
  onUnlock: (pin: string) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  const handleSubmit = async () => {
    setChecking(true);
    const ok = await onUnlock(pin);
    setChecking(false);
    if (!ok) { setError('Incorrect PIN'); setPin(''); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-80 space-y-4">
        <div>
          <h3 className="font-semibold text-slate-100">Enter PIN</h3>
          <p className="text-xs text-slate-400 mt-0.5">Profile: {profileName}</p>
        </div>
        <input
          type="password"
          value={pin}
          onChange={e => { setPin(e.target.value); setError(''); }}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          placeholder="Your PIN"
          autoFocus
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100
                     placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={handleSubmit} disabled={!pin || checking}
            className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-colors">
            {checking ? 'Checking…' : 'Unlock'}
          </button>
          <button type="button" onClick={onCancel}
            className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ProfileManager() {
  const { profiles, activeProfileId, createProfile, updateProfile, deleteProfile, setActiveProfile } = useProfileStore();
  const { setUserBio } = useAppStore();

  const [view, setView] = useState<View>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pinTarget, setPinTarget] = useState<UserProfile | null>(null);

  const activeProfile = profiles.find(p => p.id === activeProfileId) ?? null;
  const editingProfile = profiles.find(p => p.id === editingId) ?? null;

  const handleSwitch = async (profile: UserProfile) => {
    if (profile.isProtected && profile.pinHash) {
      setPinTarget(profile);
      return;
    }
    setActiveProfile(profile.id);
    setUserBio(profile.bio);
  };

  const handlePinUnlock = async (pin: string): Promise<boolean> => {
    if (!pinTarget?.pinHash) return false;
    const ok = await verifyPin(pin, pinTarget.pinHash);
    if (ok) {
      setActiveProfile(pinTarget.id);
      setUserBio(pinTarget.bio);
      setPinTarget(null);
    }
    return ok;
  };

  const handleCreateSave = (data: Partial<UserProfile>) => {
    const p = createProfile(data.displayName ?? 'New Profile');
    updateProfile(p.id, data);
    setView('list');
  };

  const handleEditSave = (data: Partial<UserProfile>) => {
    if (!editingId) return;
    updateProfile(editingId, data);
    if (editingId === activeProfileId && data.bio !== undefined) {
      setUserBio(data.bio);
    }
    setView('list');
    setEditingId(null);
  };

  const handleDelete = (id: string) => {
    if (!confirm('Delete this profile? This cannot be undone.')) return;
    deleteProfile(id);
    if (view === 'edit' && editingId === id) { setView('list'); setEditingId(null); }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Profiles</h1>
          <p className="text-sm text-slate-400 mt-1">
            Each profile stores your contact info and story. Active profile auto-fills resume templates.
          </p>
        </div>
        {view === 'list' && (
          <button type="button" onClick={() => setView('create')}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors">
            + New Profile
          </button>
        )}
      </div>

      {view === 'create' && (
        <div className="rounded-xl border border-blue-500/30 bg-blue-950/10 p-5">
          <h2 className="text-sm font-semibold text-slate-200 mb-5">Create Profile</h2>
          <ProfileForm
            initial={{ displayName: 'New Profile' }}
            onSave={handleCreateSave}
            onCancel={() => setView('list')}
            isNew
          />
        </div>
      )}

      {view === 'edit' && editingProfile && (
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-5">
          <h2 className="text-sm font-semibold text-slate-200 mb-5">Edit — {editingProfile.displayName}</h2>
          <ProfileForm
            initial={editingProfile}
            onSave={handleEditSave}
            onCancel={() => { setView('list'); setEditingId(null); }}
          />
        </div>
      )}

      {/* Profile list */}
      {view === 'list' && (
        <div className="space-y-3">
          {profiles.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center">
              <p className="text-slate-400 text-sm">No profiles yet.</p>
              <p className="text-slate-600 text-xs mt-1">Create one to auto-fill your contact info in resume templates.</p>
            </div>
          )}
          {profiles.map(profile => {
            const isActive = profile.id === activeProfileId;
            return (
              <div key={profile.id}
                className={`rounded-xl border p-4 transition-all ${
                  isActive ? 'border-blue-500/40 bg-blue-950/15' : 'border-slate-800 bg-slate-900'
                }`}>
                <div className="flex items-center gap-3">
                  <Initials name={profile.fullName || profile.displayName} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-slate-100 text-sm">{profile.displayName}</span>
                      {isActive && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-600/30 text-blue-400 border border-blue-500/30">
                          ACTIVE
                        </span>
                      )}
                      {profile.isProtected && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-700 text-slate-400">
                          🔒 PIN
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 truncate">
                      {[profile.fullName, profile.email, profile.currentTitle].filter(Boolean).join(' · ') || 'No details yet'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!isActive && (
                      <button type="button" onClick={() => handleSwitch(profile)}
                        className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs transition-colors">
                        Activate
                      </button>
                    )}
                    <button type="button" onClick={() => { setEditingId(profile.id); setView('edit'); }}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded-lg text-xs transition-colors">
                      Edit
                    </button>
                    <button type="button" onClick={() => handleDelete(profile.id)}
                      className="px-3 py-1.5 bg-red-900/20 hover:bg-red-900/40 text-red-500 rounded-lg text-xs transition-colors">
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Info card */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-xs text-slate-500 space-y-1">
        <p>
          <span className="text-slate-400 font-medium">How profiles work:</span> When a profile is active, its contact info (name, email, phone, links) is automatically injected into your resume templates before generation.
        </p>
        <p>PIN protection prevents casual switching — it is not encryption. Profile data is stored in your browser's localStorage.</p>
        {activeProfile && (
          <p className="text-blue-400 mt-2">
            Active: <span className="font-medium">{activeProfile.displayName}</span>
            {activeProfile.fullName && ` — ${activeProfile.fullName}`}
          </p>
        )}
      </div>

      {/* PIN modal */}
      {pinTarget && (
        <PinModal
          profileName={pinTarget.displayName}
          onUnlock={handlePinUnlock}
          onCancel={() => setPinTarget(null)}
        />
      )}
    </div>
  );
}
