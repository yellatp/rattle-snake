import { useEffect, useMemo, useState } from "react";
import ErrorBoundary from "./ErrorBoundary";
import type {
  ProfileCreateInput,
  ProfileUpdateInput,
  UserProfile,
} from "@rattlesnake/shared";
import {
  createProfile,
  deleteProfile,
  importResume,
  listProfiles,
  setMasterProfile,
  setProfilePin,
  updateProfile,
} from "../lib/api";

type ExperienceEditor = {
  title: string;
  company: string;
  location: string;
  dates: string;
  bullets: string[];
};

type Editor = {
  name: string;
  email: string;
  firstName: string;
  middleName: string;
  lastName: string;
  headline: string;
  summary: string;
  phone: string;
  location: string;
  linkedin: string;
  github: string;
  portfolio: string;
  workAuthorization: string;
  totalWorkExperience: string;
  employmentPreference: string;
  experience: ExperienceEditor[];
  education: Array<{ degree: string; institution: string; location: string; dates: string }>;
  skills: Array<{ name: string; items: string }>;
  certifications: string;
  languages: string;
  publications: string;
  volunteer: string;
  projects: Array<{ name: string; description: string; link: string }>;
};

function editorFromProfile(p: UserProfile): Editor {
  return {
    name: p.name ?? "",
    email: p.email ?? "",
    firstName: p.personalInfo?.firstName ?? "",
    middleName: p.personalInfo?.middleName ?? "",
    lastName: p.personalInfo?.lastName ?? "",
    headline: p.personalInfo?.headline ?? "",
    summary: p.summary ?? "",
    phone: p.personalInfo?.phone ?? "",
    location: p.personalInfo?.location ?? "",
    linkedin: p.personalInfo?.linkedin ?? "",
    github: p.personalInfo?.github ?? "",
    portfolio: p.personalInfo?.portfolio ?? "",
    workAuthorization: p.workAuthorization ?? "",
    totalWorkExperience: p.totalWorkExperience ?? "",
    employmentPreference: p.employmentPreference ?? "",
    experience: (p.experience ?? []).map((e) => ({
      title: e.title ?? "",
      company: e.company ?? "",
      location: e.location ?? "",
      dates: e.dates ?? "",
      bullets: e.bullets ? [...e.bullets] : [],
    })),
    education: (p.education ?? []).map((e) => ({
      degree: e.degree ?? "",
      institution: e.institution ?? "",
      location: e.location ?? "",
      dates: e.dates ?? "",
    })),
    skills: (p.skills ?? []).map((s) => ({
      name: s.name ?? "",
      items: (s.items ?? []).map((i) => i.name).join(", "),
    })),
    certifications: (p.certifications ?? []).join(", "),
    languages: (p.languages ?? []).join(", "),
    publications: (p.publications ?? []).join(", "),
    volunteer: (p.volunteer ?? []).join(", "),
    projects: (p.projects ?? []).map((pr) => ({
      name: pr.name ?? "",
      description: pr.description ?? "",
      link: pr.link ?? "",
    })),
  };
}

function splitComma(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function toUpdateInput(e: Editor): ProfileUpdateInput {
  return {
    ...(e.name ? { name: e.name } : {}),
    ...(e.email ? { email: e.email } : {}),
    personalInfo: {
      ...(e.firstName ? { firstName: e.firstName } : {}),
      ...(e.middleName ? { middleName: e.middleName } : {}),
      ...(e.lastName ? { lastName: e.lastName } : {}),
      headline: e.headline || undefined,
      phone: e.phone || undefined,
      location: e.location || undefined,
      linkedin: e.linkedin || undefined,
      github: e.github || undefined,
      portfolio: e.portfolio || undefined,
    },
    summary: e.summary || undefined,
    workAuthorization: e.workAuthorization || undefined,
    totalWorkExperience: e.totalWorkExperience || undefined,
    employmentPreference: e.employmentPreference || undefined,
    experience: e.experience
      .filter((x) => x.title || x.company)
      .map((x) => ({
        title: x.title || undefined,
        company: x.company || undefined,
        location: x.location || undefined,
        dates: x.dates || undefined,
        bullets: x.bullets.map((b) => b.trim()).filter(Boolean),
      })),
    education: e.education
      .filter((x) => x.degree || x.institution)
      .map((x) => ({
        degree: x.degree || undefined,
        institution: x.institution || undefined,
        location: x.location || undefined,
        dates: x.dates || undefined,
      })),
    skills: e.skills
      .filter((s) => s.name)
      .map((s) => ({ name: s.name, items: splitComma(s.items).map((n) => ({ name: n })) })),
    certifications: splitComma(e.certifications),
    languages: splitComma(e.languages),
    publications: splitComma(e.publications),
    volunteer: splitComma(e.volunteer),
    projects: e.projects.filter((p) => p.name).map((p) => ({ ...p })),
  };
}

/** Live read-only rendering of the draft like a standard resume. */
function ResumePreview(props: { draft: Editor }) {
  const d = props.draft;
  const name = [d.firstName, d.middleName, d.lastName].filter(Boolean).join(" ") || d.name;
  const contact = [d.email, d.phone, d.location, d.linkedin, d.github, d.portfolio]
    .filter(Boolean)
    .join("  |  ");
  const cta = [d.workAuthorization, d.employmentPreference, d.totalWorkExperience]
    .filter(Boolean)
    .join("  |  ");
  const shownRoles = d.experience.filter((x) => x.title || x.company);
  const shownSkills = d.skills.filter((s) => s.name || s.items);
  const shownProjects = d.projects.filter((p) => p.name);
  const shownEducation = d.education.filter((x) => x.degree || x.institution);

  return (
    <div className="resume-md resume-preview">
      <h1>{name || "Candidate name"}</h1>
      {d.headline && <p className="resume-contact">{d.headline}</p>}
      {contact && <p className="resume-contact">{contact}</p>}
      {cta && <p className="resume-contact">{cta}</p>}

      {(d.summary || d.headline) && (
        <>
          <h2>Profile Summary</h2>
          <p>{d.summary || d.headline}</p>
        </>
      )}

      {shownRoles.length > 0 && (
        <>
          <h2>Work Experience</h2>
          {shownRoles.map((exp, i) => (
            <div className="resume-entry" key={i}>
              <h3>
                {[exp.title, exp.company].filter(Boolean).join(", ")}
                {exp.dates && <span className="resume-dates"> | {exp.dates}</span>}
              </h3>
              {exp.location && <p className="resume-contact">{exp.location}</p>}
              {exp.bullets.length > 0 && (
                <ul>
                  {exp.bullets.filter(Boolean).map((b, j) => (
                    <li key={j}>{b}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </>
      )}

      {shownSkills.length > 0 && (
        <>
          <h2>Technical Skills</h2>
          <ul>
            {shownSkills.map((s, i) => (
              <li key={i}>
                {s.name ? `${s.name}: ` : ""}
                {s.items}
              </li>
            ))}
          </ul>
        </>
      )}

      {shownProjects.length > 0 && (
        <>
          <h2>Projects & Research</h2>
          {shownProjects.map((p, i) => (
            <div className="resume-entry" key={i}>
              <h3>
                {p.name}
                {p.link && <span className="resume-dates"> | {p.link}</span>}
              </h3>
              {p.description && <p>{p.description}</p>}
            </div>
          ))}
        </>
      )}

      {shownEducation.length > 0 && (
        <>
          <h2>Education</h2>
          {shownEducation.map((ed, i) => (
            <div className="resume-entry" key={i}>
              <h3>{[ed.degree, ed.institution].filter(Boolean).join(", ")}</h3>
              <p className="resume-contact">
                {[ed.location, ed.dates].filter(Boolean).join(" | ")}
              </p>
            </div>
          ))}
        </>
      )}

      {d.certifications.trim() !== "" && (
        <>
          <h2>Certifications</h2>
          <p>{d.certifications}</p>
        </>
      )}

      {d.languages.trim() !== "" && (
        <>
          <h2>Languages</h2>
          <p>{d.languages}</p>
        </>
      )}
    </div>
  );
}

function ProfileEditor(props: {
  profile: UserProfile;
  onSave: (input: ProfileUpdateInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Editor>(() => editorFromProfile(props.profile));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const set = (patch: Partial<Editor>) => setDraft((d) => ({ ...d, ...patch }));

  /**
   * Fill the editor from LLM-extracted profile JSON. Only fields the LLM found
   * are applied; personal info is copied verbatim and stays editable.
   */
  function applyImport(result: ProfileUpdateInput) {
    const patch: Partial<Editor> = {};
    const pi = result.personalInfo ?? {};
    if (result.name) patch.name = result.name;
    if (result.email) patch.email = result.email;
    if (pi.headline) patch.headline = pi.headline;
    if (pi.firstName) patch.firstName = pi.firstName;
    if (pi.middleName) patch.middleName = pi.middleName;
    if (pi.lastName) patch.lastName = pi.lastName;
    if (pi.phone) patch.phone = pi.phone;
    if (pi.location) patch.location = pi.location;
    if (pi.linkedin) patch.linkedin = pi.linkedin;
    if (pi.github) patch.github = pi.github;
    if (pi.portfolio) patch.portfolio = pi.portfolio;
    if (result.summary) patch.summary = result.summary;
    if (result.workAuthorization) patch.workAuthorization = result.workAuthorization;
    if (result.totalWorkExperience) patch.totalWorkExperience = result.totalWorkExperience;
    if (result.employmentPreference) patch.employmentPreference = result.employmentPreference;
    if (result.experience?.length) {
      patch.experience = result.experience.map((x) => ({
        title: x.title ?? "",
        company: x.company ?? "",
        location: x.location ?? "",
        dates: x.dates ?? "",
        bullets: x.bullets ? [...x.bullets] : [],
      }));
    }
    if (result.education?.length) {
      patch.education = result.education.map((x) => ({
        degree: x.degree ?? "",
        institution: x.institution ?? "",
        location: x.location ?? "",
        dates: x.dates ?? "",
      }));
    }
    if (result.skills?.length) {
      patch.skills = result.skills.map((s) => ({
        name: s.name ?? "",
        items: (s.items ?? []).map((i) => i.name).join(", "),
      }));
    }
    if (result.certifications?.length) patch.certifications = result.certifications.join(", ");
    if (result.languages?.length) patch.languages = result.languages.join(", ");
    if (result.publications?.length) patch.publications = result.publications.join(", ");
    if (result.volunteer?.length) patch.volunteer = result.volunteer.join(", ");
    if (result.projects?.length) {
      patch.projects = result.projects.map((p) => ({
        name: p.name ?? "",
        description: p.description ?? "",
        link: p.link ?? "",
      }));
    }
    set(patch);
  }

  async function doImport() {
    setImporting(true);
    setError(null);
    setImportMsg(null);
    try {
      const result = await importResume(importText.trim());
      applyImport(result);
      setImportMsg(
        Object.keys(result).length > 0
          ? "Resume converted to JSON. Review the fields, then save the profile."
          : "No structured fields were recognized in that resume.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  }

  const patchList = <K extends keyof Editor>(
    key: K,
    index: number,
    field: string,
    value: string,
  ) => {
    const list = draft[key];
    if (!Array.isArray(list)) return;
    const next = list.map((row: unknown, i: number) =>
      i === index ? { ...(row as Record<string, string>), [field]: value } : row,
    );
    set({ [key]: next } as Partial<Editor>);
  };

  const addList = <K extends keyof Editor>(key: K, empty: unknown) =>
    set({ [key]: [...(draft[key] as unknown[]), empty] } as Partial<Editor>);

  const removeList = (key: keyof Editor, index: number) =>
    set({
      [key]: (draft[key] as unknown[]).filter((_: unknown, i: number) => i !== index),
    } as Partial<Editor>);

  const patchBullet = (expIndex: number, bulletIndex: number, value: string) =>
    setDraft((d) => ({
      ...d,
      experience: d.experience.map((exp, i) =>
        i === expIndex
          ? { ...exp, bullets: exp.bullets.map((b, j) => (j === bulletIndex ? value : b)) }
          : exp,
      ),
    }));

  const addBullet = (expIndex: number) =>
    setDraft((d) => ({
      ...d,
      experience: d.experience.map((exp, i) =>
        i === expIndex ? { ...exp, bullets: [...exp.bullets, ""] } : exp,
      ),
    }));

  const removeBullet = (expIndex: number, bulletIndex: number) =>
    setDraft((d) => ({
      ...d,
      experience: d.experience.map((exp, i) =>
        i === expIndex
          ? { ...exp, bullets: exp.bullets.filter((_: string, j: number) => j !== bulletIndex) }
          : exp,
      ),
    }));

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await props.onSave(toUpdateInput(draft));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="profile-editor panel">
      {error && <div className="error-banner">{error}</div>}

      <div className="resume-import-box">
        <h4 className="editor-heading">Import from a resume</h4>
        <p className="hint">
          Paste the candidate's full resume. The LLM converts it to structured JSON
          and fills the editor below; the raw text is never saved.
        </p>
        <textarea
          rows={7}
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder="Paste the candidate's resume..."
        />
        <div className="btn-row">
          <button
            type="button"
            className="btn"
            onClick={() => void doImport()}
            disabled={importing || importText.trim().length < 50}
          >
            {importing ? "Converting..." : "Convert to JSON"}
          </button>
          <button type="button" className="btn subtle" onClick={() => setImportText("")}>
            Clear
          </button>
        </div>
        {importMsg && <p className="hint">{importMsg}</p>}
      </div>

      <div className="btn-row">
        <button
          type="button"
          className="btn subtle"
          onClick={() => setShowPreview((v) => !v)}
        >
          {showPreview ? "Hide resume preview" : "Show resume preview"}
        </button>
      </div>
      {showPreview && <ResumePreview draft={draft} />}

      <div className="profile-section">
        <h4 className="editor-heading">Profile details</h4>
        <div className="form-grid">
          <label>
            Name
            <input value={draft.name} onChange={(e) => set({ name: e.target.value })} />
          </label>
          <label>
            Email
            <input value={draft.email} onChange={(e) => set({ email: e.target.value })} />
          </label>
          <label>
            First name
            <input
              value={draft.firstName}
              onChange={(e) => set({ firstName: e.target.value })}
            />
          </label>
          <label>
            Middle name
            <input
              value={draft.middleName}
              onChange={(e) => set({ middleName: e.target.value })}
            />
          </label>
          <label>
            Last name
            <input value={draft.lastName} onChange={(e) => set({ lastName: e.target.value })} />
          </label>
          <label>
            Phone
            <input value={draft.phone} onChange={(e) => set({ phone: e.target.value })} />
          </label>
          <label>
            Location
            <input value={draft.location} onChange={(e) => set({ location: e.target.value })} />
          </label>
          <label>
            LinkedIn
            <input value={draft.linkedin} onChange={(e) => set({ linkedin: e.target.value })} />
          </label>
          <label>
            GitHub
            <input value={draft.github} onChange={(e) => set({ github: e.target.value })} />
          </label>
          <label>
            Portfolio
            <input value={draft.portfolio} onChange={(e) => set({ portfolio: e.target.value })} />
          </label>
        </div>
      </div>

      <div className="profile-section">
        <h4 className="editor-heading">Call to action</h4>
        <p className="hint">
          The pitch recruiters see first, plus your availability and work setup.
        </p>
        <div className="form-grid">
          <label>
            Headline
            <input value={draft.headline} onChange={(e) => set({ headline: e.target.value })} />
          </label>
          <label>
            Employment preference
            <input
              value={draft.employmentPreference}
              onChange={(e) => set({ employmentPreference: e.target.value })}
            />
          </label>
          <label>
            Work authorization
            <input
              value={draft.workAuthorization}
              onChange={(e) => set({ workAuthorization: e.target.value })}
            />
          </label>
          <label>
            Total experience (e.g. "7 years")
            <input
              value={draft.totalWorkExperience}
              onChange={(e) => set({ totalWorkExperience: e.target.value })}
            />
          </label>
        </div>
      </div>

      <div className="profile-section">
        <h4 className="editor-heading">Profile summary</h4>
        <label>
          Summary
          <textarea
            rows={3}
            value={draft.summary}
            onChange={(e) => set({ summary: e.target.value })}
            placeholder="2-3 sentence professional summary. Used as the resume summary."
          />
        </label>
      </div>

      <div className="profile-section">
        <h4 className="editor-heading">Work experience</h4>
        {draft.experience.length === 0 && (
          <p className="hint">No experience entries yet. Add one below.</p>
        )}
        {draft.experience.map((exp, i) => (
          <div className="editor-row" key={i}>
            <div className="form-grid">
              <label>
                Title
                <input
                  value={exp.title}
                  onChange={(e) => patchList("experience", i, "title", e.target.value)}
                />
              </label>
              <label>
                Company
                <input
                  value={exp.company}
                  onChange={(e) => patchList("experience", i, "company", e.target.value)}
                />
              </label>
              <label>
                Location
                <input
                  value={exp.location}
                  onChange={(e) => patchList("experience", i, "location", e.target.value)}
                />
              </label>
              <label>
                Dates
                <input
                  value={exp.dates}
                  onChange={(e) => patchList("experience", i, "dates", e.target.value)}
                />
              </label>
            </div>
            <div className="bullet-list">
              {exp.bullets.length === 0 && (
                <p className="hint">No bullet points yet.</p>
              )}
              {exp.bullets.map((b, j) => (
                <div className="bullet-row" key={j}>
                  <input
                    value={b ?? ""}
                    onChange={(e) => patchBullet(i, j, e.target.value)}
                    placeholder={`Achievement ${j + 1}`}
                  />
                  <button
                    type="button"
                    className="btn subtle small"
                    onClick={() => removeBullet(i, j)}
                    disabled={exp.bullets.length === 1}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <div className="btn-row">
              <button type="button" className="btn subtle small" onClick={() => addBullet(i)}>
                Add bullet
              </button>
              <button
                type="button"
                className="btn subtle small"
                onClick={() => removeList("experience", i)}
                disabled={draft.experience.length === 1}
              >
                Remove experience
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          className="btn subtle"
          onClick={() =>
            addList("experience", { title: "", company: "", location: "", dates: "", bullets: [""] })
          }
        >
          Add experience
        </button>
      </div>

      <div className="profile-section">
        <h4 className="editor-heading">Technical skills</h4>
        {draft.skills.map((skill, i) => (
          <div className="editor-row" key={i}>
            <div className="form-grid">
              <label>
                Category
                <input
                  value={skill.name}
                  onChange={(e) => patchList("skills", i, "name", e.target.value)}
                />
              </label>
              <label>
                Items (comma separated)
                <input
                  value={skill.items}
                  onChange={(e) => patchList("skills", i, "items", e.target.value)}
                />
              </label>
            </div>
            <button
              type="button"
              className="btn subtle small"
              onClick={() => removeList("skills", i)}
              disabled={draft.skills.length === 1}
            >
              Remove category
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn subtle"
          onClick={() => addList("skills", { name: "", items: "" })}
        >
          Add category
        </button>
      </div>

      <div className="profile-section">
        <h4 className="editor-heading">Projects & research</h4>
        {draft.projects.map((proj, i) => (
          <div className="editor-row" key={i}>
            <div className="form-grid">
              <label>
                Name
                <input
                  value={proj.name}
                  onChange={(e) => patchList("projects", i, "name", e.target.value)}
                />
              </label>
              <label>
                Link
                <input
                  value={proj.link}
                  onChange={(e) => patchList("projects", i, "link", e.target.value)}
                />
              </label>
              <label>
                Description
                <input
                  value={proj.description}
                  onChange={(e) => patchList("projects", i, "description", e.target.value)}
                />
              </label>
            </div>
            <button
              type="button"
              className="btn subtle small"
              onClick={() => removeList("projects", i)}
              disabled={draft.projects.length === 1}
            >
              Remove project
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn subtle"
          onClick={() => addList("projects", { name: "", description: "", link: "" })}
        >
          Add project
        </button>
      </div>

      <div className="profile-section">
        <h4 className="editor-heading">Education</h4>
        {draft.education.map((ed, i) => (
          <div className="editor-row" key={i}>
            <div className="form-grid">
              <label>
                Degree
                <input
                  value={ed.degree}
                  onChange={(e) => patchList("education", i, "degree", e.target.value)}
                />
              </label>
              <label>
                Institution
                <input
                  value={ed.institution}
                  onChange={(e) => patchList("education", i, "institution", e.target.value)}
                />
              </label>
              <label>
                Location
                <input
                  value={ed.location}
                  onChange={(e) => patchList("education", i, "location", e.target.value)}
                />
              </label>
              <label>
                Dates
                <input
                  value={ed.dates}
                  onChange={(e) => patchList("education", i, "dates", e.target.value)}
                />
              </label>
            </div>
            <button
              type="button"
              className="btn subtle small"
              onClick={() => removeList("education", i)}
              disabled={draft.education.length === 1}
            >
              Remove education
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn subtle"
          onClick={() =>
            addList("education", { degree: "", institution: "", location: "", dates: "" })
          }
        >
          Add education
        </button>
      </div>

      <div className="profile-section">
        <h4 className="editor-heading">Certifications & additional</h4>
        <div className="form-grid">
          <label>
            Certifications (comma separated)
            <input
              value={draft.certifications}
              onChange={(e) => set({ certifications: e.target.value })}
            />
          </label>
          <label>
            Languages (comma separated)
            <input value={draft.languages} onChange={(e) => set({ languages: e.target.value })} />
          </label>
          <label>
            Publications (comma separated)
            <input
              value={draft.publications}
              onChange={(e) => set({ publications: e.target.value })}
            />
          </label>
          <label>
            Volunteering (comma separated)
            <input value={draft.volunteer} onChange={(e) => set({ volunteer: e.target.value })} />
          </label>
        </div>
      </div>

      <div className="btn-row">
        <button className="btn primary" onClick={save} disabled={busy}>
          {busy ? "Saving..." : "Save profile"}
        </button>
        <button className="btn" onClick={props.onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function ProfilesViewInner() {
  const [profiles, setProfiles] = useState<UserProfile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pinFor, setPinFor] = useState<string | null>(null);
  const [pinDraft, setPinDraft] = useState("");
  const [masterPinFor, setMasterPinFor] = useState<string | null>(null);
  const [masterPinDraft, setMasterPinDraft] = useState("");
  const [newDraft, setNewDraft] = useState({ name: "", email: "" });
  const [newPin, setNewPin] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const items = await listProfiles();
    setProfiles(items);
  };

  useEffect(() => {
    listProfiles()
      .then(setProfiles)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const master = useMemo(() => profiles?.find((p) => p.isMaster), [profiles]);

  async function createNew() {
    if (!newDraft.name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const input: ProfileCreateInput = { name: newDraft.name.trim(), email: newDraft.email.trim() };
      if (newPin.trim()) input.pin = newPin.trim();
      await createProfile(input);
      setNewDraft({ name: "", email: "" });
      setNewPin("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveEditor(id: string, input: ProfileUpdateInput) {
    await updateProfile(id, input);
    setEditingId(null);
    await refresh();
  }

  async function promote(id: string, pin?: string) {
    setBusy(true);
    setError(null);
    try {
      await setMasterProfile(id, pin ? { pin } : undefined);
      setMasterPinFor(null);
      setMasterPinDraft("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function savePin(id: string) {
    setBusy(true);
    setError(null);
    try {
      await setProfilePin(id, { pin: pinDraft });
      setPinFor(null);
      setPinDraft("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    try {
      await deleteProfile(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (error) return <div className="error-banner">{error}</div>;
  if (!profiles) return <p className="hint">Loading profiles...</p>;

  return (
    <div className="profiles-view">
      <div className="panel">
        <h3 className="panel-title">Add a profile</h3>
        <p className="hint">
          The first profile becomes the master, used as the default candidate for new
          evaluations. A PIN on a profile is a lightweight lock for set-as-master actions.
        </p>
        <div className="profile-add-row">
          <label>
            Name
            <input
              value={newDraft.name}
              onChange={(e) => setNewDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="e.g. Pavan Yellathakota"
            />
          </label>
          <label>
            Email
            <input
              value={newDraft.email}
              onChange={(e) => setNewDraft((d) => ({ ...d, email: e.target.value }))}
              placeholder="you@example.com"
            />
          </label>
          <label>
            Optional PIN
            <input
              type="password"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
              placeholder="optional"
            />
          </label>
          <button className="btn primary" onClick={createNew} disabled={busy || !newDraft.name.trim()}>
            {busy ? "Creating..." : "Create profile"}
          </button>
        </div>
      </div>

      <h3 className="section-title">Profiles ({profiles.length})</h3>
      {profiles.length === 0 && (
        <p className="hint">No profiles yet. Create one above to get started.</p>
      )}

      <div className="profile-list">
        {profiles.map((p) => (
          <div className="panel profile-card" key={p.id}>
            <div className="profile-card-head">
              <div>
                <strong>{p.name || "Unnamed profile"}</strong>{" "}
                {p.isMaster && <span className="tag accent">master</span>}
                {p.hasPin && <span className="tag">PIN locked</span>}
              </div>
              <span className="hint">{new Date(p.updatedAt).toLocaleString()}</span>
            </div>
            <p className="hint profile-email">{p.email || "no email"}</p>
            <p className="profile-facts">
              {p.personalInfo?.headline && <span>{p.personalInfo.headline}</span>}
              {p.summary && <span>{p.summary}</span>}
              {p.totalWorkExperience && <span>{p.totalWorkExperience}</span>}
              <span>{p.experience?.length ?? 0} roles</span>
              <span>
                {p.skills?.reduce((n, s) => n + (s.items?.length ?? 0), 0) ?? 0} skills
              </span>
              {p.workAuthorization && <span>{p.workAuthorization}</span>}
            </p>

            <div className="btn-row">
              <button className="btn" onClick={() => setEditingId(p.id)}>
                Edit
              </button>
              {!p.isMaster &&
                (p.hasPin ? (
                  <button
                    className="btn"
                    onClick={() => {
                      setMasterPinFor(p.id);
                      setMasterPinDraft("");
                    }}
                    disabled={busy}
                  >
                    Set as master
                  </button>
                ) : (
                  <button className="btn" onClick={() => void promote(p.id)} disabled={busy}>
                    Set as master
                  </button>
                ))}
              <button className="btn" onClick={() => setPinFor(p.id)}>
                {p.hasPin ? "Change PIN" : "Add PIN"}
              </button>
              <button
                className="btn subtle"
                onClick={() => {
                  if (window.confirm(`Delete profile "${p.name}"?`)) void remove(p.id);
                }}
                disabled={busy}
              >
                Delete
              </button>
            </div>

            {pinFor === p.id && (
              <div className="pin-row">
                <input
                  type="password"
                  placeholder="New PIN"
                  value={pinDraft}
                  onChange={(e) => setPinDraft(e.target.value)}
                />
                <button className="btn primary" onClick={() => void savePin(p.id)} disabled={busy}>
                  Save PIN
                </button>
                <button className="btn" onClick={() => setPinFor(null)}>
                  Cancel
                </button>
              </div>
            )}

            {masterPinFor === p.id && (
              <div className="pin-row">
                <input
                  type="password"
                  placeholder="Enter PIN to unlock"
                  value={masterPinDraft}
                  onChange={(e) => setMasterPinDraft(e.target.value)}
                />
                <button
                  className="btn primary"
                  onClick={() => void promote(p.id, masterPinDraft.trim())}
                  disabled={busy || !masterPinDraft.trim()}
                >
                  Unlock and set as master
                </button>
                <button className="btn" onClick={() => setMasterPinFor(null)} disabled={busy}>
                  Cancel
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {editingId && profiles.find((p) => p.id === editingId) && (
        <ProfileEditor
          profile={profiles.find((p) => p.id === editingId)!}
          onSave={(input) => saveEditor(editingId, input)}
          onCancel={() => setEditingId(null)}
        />
      )}

      {master && (
        <p className="hint profile-note">
          Master profile <strong>{master.name}</strong> is the default candidate for new evaluations.
        </p>
      )}
    </div>
  );
}

export default function ProfilesView() {
  return (
    <ErrorBoundary>
      <ProfilesViewInner />
    </ErrorBoundary>
  );
}
