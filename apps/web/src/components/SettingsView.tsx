import { useEffect, useState } from "react";
import ErrorBoundary from "./ErrorBoundary";
import type { FormEvent } from "react";
import type {
  LlmConnection,
  SavedJd,
  SavedResume,
} from "@rattlesnake/shared";
import {
  createConnection,
  createJd,
  createResume,
  deleteConnection,
  deleteJd,
  deleteResume,
  getProfile,
  listConnections,
  listJds,
  listResumes,
  saveProfile,
  updateConnection,
  updateJd,
  updateResume,
} from "../lib/api";
import { PROVIDERS } from "../lib/providers";

function SettingsViewInner() {
  const [profileName, setProfileName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profileUpdatedAt, setProfileUpdatedAt] = useState("");
  const [resumes, setResumes] = useState<SavedResume[]>([]);
  const [jds, setJds] = useState<SavedJd[]>([]);
  const [connections, setConnections] = useState<LlmConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  async function refresh() {
    const [p, r, j, c] = await Promise.all([
      getProfile(),
      listResumes(),
      listJds(),
      listConnections(),
    ]);
    setProfileName(p.name);
    setProfileEmail(p.email);
    setProfileUpdatedAt(p.updatedAt);
    setResumes(r);
    setJds(j);
    setConnections(c);
  }

  useEffect(() => {
    let alive = true;
    refresh()
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  function flash(msg: string) {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 4000);
  }

  async function handleSaveProfile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSavingProfile(true);
    try {
      const saved = await saveProfile({ name: profileName, email: profileEmail });
      setProfileUpdatedAt(saved.updatedAt);
      flash("Profile saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingProfile(false);
    }
  }

  if (loading) {
    return <p className="hint">Loading settings...</p>;
  }

  return (
    <div className="settings-grid">
      <h2 className="section-title">General Settings</h2>

      <SavedItems
        label="Saved job descriptions"
        addLabel="Add job description"
        items={jds}
        minChars={80}
        placeholder="Paste the full job description..."
        onSave={(id, title, content) =>
          id ? updateJd(id, { title, content }) : createJd({ title, content })
        }
        onChanged={refresh}
        onDelete={deleteJd}
      />

      <h2 className="section-title">LLM API</h2>

      <ConnectionList
        connections={connections}
        onChanged={refresh}
        onDelete={deleteConnection}
      />

      <h2 className="section-title">Resume</h2>

      <section className="panel settings-section">
        <h2>Profile</h2>
        <form className="editor-form" onSubmit={handleSaveProfile}>
          <div className="grid-2">
            <div className="form-row">
              <label htmlFor="profile-name">Your name</label>
              <input
                id="profile-name"
                type="text"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder="Jane Doe"
              />
            </div>
            <div className="form-row">
              <label htmlFor="profile-email">Email</label>
              <input
                id="profile-email"
                type="text"
                value={profileEmail}
                onChange={(e) => setProfileEmail(e.target.value)}
                placeholder="jane@example.com"
              />
            </div>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn" disabled={savingProfile}>
              {savingProfile ? "Saving..." : "Save profile"}
            </button>
            {profileUpdatedAt && (
              <span className="hint">
                Last saved: {new Date(profileUpdatedAt).toLocaleString()}
              </span>
            )}
          </div>
        </form>
      </section>

      <SavedItems
        label="Saved resumes"
        addLabel="Add resume"
        items={resumes}
        minChars={50}
        placeholder="Paste the full resume (text or markdown)..."
        onSave={(id, title, content) =>
          id ? updateResume(id, { title, content }) : createResume({ title, content })
        }
        onChanged={refresh}
        onDelete={deleteResume}
      />

      <h2 className="section-title">Cover Letter</h2>

      <section className="panel settings-section">
        <p className="empty-note">No cover letter settings yet.</p>
      </section>

      <h2 className="section-title">Cold Reach</h2>

      <section className="panel settings-section">
        <p className="empty-note">No cold reach settings yet.</p>
      </section>

      {error && <div className="error-banner">{error}</div>}
      {notice && (
        <p className="hint" style={{ color: "var(--accent-2)" }}>
          {notice}
        </p>
      )}
    </div>
  );
}

interface SavedItemsProps {
  label: string;
  addLabel: string;
  items: Array<{ id: string; title: string; content: string; updatedAt: string }>;
  minChars: number;
  placeholder: string;
  onSave: (id: string | null, title: string, content: string) => Promise<unknown>;
  onChanged: () => Promise<void> | void;
  onDelete: (id: string) => Promise<void>;
}

function SavedItems(props: SavedItemsProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingNew, setEditingNew] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit(id: string | null) {
    setEditingId(id);
    setEditingNew(id === null);
    const item = props.items.find((i) => i.id === id);
    setTitle(item?.title ?? "");
    setContent(item?.content ?? "");
    setError(null);
  }

  function cancel() {
    setEditingId(null);
    setEditingNew(false);
    setTitle("");
    setContent("");
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (title.trim().length === 0) {
      setError("Title is required.");
      return;
    }
    if (content.trim().length < props.minChars) {
      setError(
        `Content is too short, at least ${props.minChars} characters.`,
      );
      return;
    }
    setSaving(true);
    try {
      await props.onSave(editingId, title.trim(), content);
      await props.onChanged();
      cancel();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item: { id: string; title: string }) {
    if (!window.confirm(`Delete "${item.title}"? This cannot be undone.`)) return;
    setError(null);
    try {
      await props.onDelete(item.id);
      await props.onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const ready = title.trim().length > 0 && content.trim().length >= props.minChars;

  return (
    <section className="panel settings-section">
      <h2>
        {props.label}
        <span className="tag">{props.items.length}</span>
      </h2>

      {props.items.length === 0 && !editingNew && (
        <p className="empty-note">Nothing saved yet.</p>
      )}

      {(editingNew || editingId !== null) && (
        <form className="editor-form" onSubmit={submit}>
          <div className="form-row">
            <label htmlFor={`${props.label}-title`}>Title</label>
            <input
              id={`${props.label}-title`}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Rohan Mehta, Backend (2026)"
            />
          </div>
          <div className="form-row">
            <label htmlFor={`${props.label}-content`}>Content</label>
            <textarea
              id={`${props.label}-content`}
              rows={7}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={props.placeholder}
            />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn" disabled={saving || !ready}>
              {saving ? "Saving..." : editingNew ? "Add" : "Save changes"}
            </button>
            <button type="button" className="btn secondary" onClick={cancel}>
              Cancel
            </button>
          </div>
          {error && <div className="error-banner">{error}</div>}
        </form>
      )}

      {props.items.map((item) => (
        <div className="saved-item" key={item.id}>
          <div className="saved-item-body">
            <div className="saved-item-title">{item.title}</div>
            <div className="saved-item-meta">
              Updated {new Date(item.updatedAt).toLocaleString()} ·{" "}
              {item.content.length.toLocaleString()} chars
            </div>
          </div>
          <div className="saved-item-actions">
            <button
              type="button"
              className="btn secondary small"
              onClick={() => startEdit(item.id)}
            >
              Edit
            </button>
            <button
              type="button"
              className="btn secondary small"
              onClick={() => void handleDelete(item)}
            >
              Delete
            </button>
          </div>
        </div>
      ))}

      {!editingNew && editingId === null && (
        <button type="button" className="btn secondary" onClick={() => startEdit(null)}>
          {props.addLabel}
        </button>
      )}
    </section>
  );
}

interface ConnectionListProps {
  connections: LlmConnection[];
  onChanged: () => Promise<void> | void;
  onDelete: (id: string) => Promise<void>;
}

function ConnectionList(props: ConnectionListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingNew, setEditingNew] = useState(false);
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("openai");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [temperature, setTemperature] = useState("0.3");
  const [apiKey, setApiKey] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit(conn: LlmConnection | null) {
    setEditingId(conn?.id ?? null);
    setEditingNew(conn === null);
    setName(conn?.name ?? "");
    setProvider(conn?.provider ?? "openai");
    setBaseUrl(conn?.baseUrl ?? "");
    setModel(conn?.model ?? "");
    setTemperature(String(conn?.temperature ?? 0.3));
    setApiKey("");
    setIsDefault(conn?.isDefault ?? false);
    setError(null);
  }

  function handleProviderChange(value: string) {
    const preset = PROVIDERS.find((p) => p.value === value);
    setProvider(value);
    setBaseUrl((prev) => prev || preset?.baseUrl || "");
    setModel((prev) => prev || preset?.model || "");
  }

  function cancel() {
    setEditingId(null);
    setEditingNew(false);
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (name.trim().length === 0) {
      setError("Name is required.");
      return;
    }
    const payload = {
      name: name.trim(),
      provider,
      baseUrl: baseUrl.trim() || null,
      model: model.trim() || null,
      temperature:
        temperature !== "" ? Number.parseFloat(temperature) : null,
      apiKey: apiKey.trim() || undefined,
      isDefault,
    };
    setSaving(true);
    try {
      if (editingId) {
        await updateConnection(editingId, payload);
      } else {
        await createConnection(payload);
      }
      await props.onChanged();
      cancel();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(conn: LlmConnection) {
    if (!window.confirm(`Delete connection "${conn.name}"? This cannot be undone.`)) return;
    setError(null);
    try {
      await props.onDelete(conn.id);
      await props.onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const ready = name.trim().length > 0 && model.trim().length > 0;

  return (
    <section className="panel settings-section">
      <h2>
        LLM API connections
        <span className="tag">{props.connections.length}</span>
      </h2>
      <p className="hint">
        Leave the key blank when editing to keep the existing one.
      </p>

      {props.connections.length === 0 && !editingNew && (
        <p className="empty-note">No connections saved yet.</p>
      )}

      {(editingNew || editingId !== null) && (
        <form className="editor-form" onSubmit={submit}>
          <div className="grid-2">
            <div className="form-row">
              <label htmlFor="conn-name">Name</label>
              <input
                id="conn-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. My OpenAI key"
              />
            </div>
            <div className="form-row">
              <label htmlFor="conn-provider">Provider</label>
              <select
                id="conn-provider"
                value={provider}
                onChange={(e) => handleProviderChange(e.target.value)}
              >
                {PROVIDERS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid-2">
            <div className="form-row">
              <label htmlFor="conn-baseUrl">Base URL</label>
              <input
                id="conn-baseUrl"
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="OpenAI-compatible endpoint (preset default is prefilled)"
              />
            </div>
            <div className="form-row">
              <label htmlFor="conn-model">Model</label>
              <input
                id="conn-model"
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="Required"
              />
            </div>
          </div>
          <div className="grid-2">
            <div className="form-row">
              <label htmlFor="conn-apiKey">
                API key <span className="hint">(blank keeps existing)</span>
              </label>
              <input
                id="conn-apiKey"
                type="password"
                autoComplete="new-password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
              />
            </div>
            <div className="form-row">
              <label htmlFor="conn-temperature">
                Temperature <span className="hint">(0-2, default 0.3)</span>
              </label>
              <input
                id="conn-temperature"
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
              />
            </div>
          </div>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
            />
            Use as the default LLM connection for new evaluations
          </label>
          <div className="form-actions">
            <button type="submit" className="btn" disabled={saving || !ready}>
              {saving ? "Saving..." : editingNew ? "Add connection" : "Save changes"}
            </button>
            <button type="button" className="btn secondary" onClick={cancel}>
              Cancel
            </button>
          </div>
          {error && <div className="error-banner">{error}</div>}
        </form>
      )}

      {props.connections.map((conn) => (
        <div className="saved-item" key={conn.id}>
          <div className="saved-item-body">
            <div className="saved-item-title">
              {conn.name}
              {conn.isDefault && <span className="tag default-badge">default</span>}
            </div>
            <div className="saved-item-meta">
              {conn.provider}
              {conn.model ? ` · ${conn.model}` : ""}
              {conn.baseUrl ? ` · ${conn.baseUrl}` : ""}
            </div>
            <div className="conn-key">
              {conn.hasKey
                ? `key ${conn.keyPreview}`
                : "no key (local provider)"}
            </div>
          </div>
          <div className="saved-item-actions">
            <button
              type="button"
              className="btn secondary small"
              onClick={() => startEdit(conn)}
            >
              Edit
            </button>
            <button
              type="button"
              className="btn secondary small"
              onClick={() => void handleDelete(conn)}
            >
              Delete
            </button>
          </div>
        </div>
      ))}

      {!editingNew && editingId === null && (
        <button type="button" className="btn secondary" onClick={() => startEdit(null)}>
          Add connection
        </button>
      )}
    </section>
  );
}

export default function SettingsView() {
  return (
    <ErrorBoundary>
      <SettingsViewInner />
    </ErrorBoundary>
  );
}
