import { useState, useCallback } from 'react';
import { LockIcon, PlusIcon, CloseIcon } from './ui/Icons';

interface Contact {
  name?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
}

interface Experience {
  id: string;
  title: string;
  company: string;
  location: string;
  dates: string;
  bullets: string[];
  locked?: boolean;
}

interface Education {
  id: string;
  degree: string;
  institution: string;
  location: string;
  year: string;
  gpa?: string;
}

interface SkillCategory {
  name: string;
  items: string[];
}

interface ResumeData {
  role?: string;
  contact?: Contact;
  sections?: {
    summary?: { content?: string; editable?: boolean };
    skills?: { categories?: SkillCategory[]; editable?: boolean };
    experience?: Experience[];
    education?: Education[];
    certifications?: string[];
  };
}

interface Props {
  content: string;
  onChange: (content: string) => void;
  readOnly?: boolean;
}

export default function ResumeEditor({ content, onChange, readOnly = false }: Props) {
  const [data, setData] = useState<ResumeData>(() => {
    try { return JSON.parse(content) as ResumeData; } catch { return {}; }
  });

  const update = useCallback((updater: (prev: ResumeData) => ResumeData) => {
    setData(prev => {
      const next = updater(prev);
      onChange(JSON.stringify(next, null, 2));
      return next;
    });
  }, [onChange]);

  const updateSummary = (value: string) =>
    update(d => ({ ...d, sections: { ...d.sections, summary: { ...d.sections?.summary, content: value } } }));

  const updateBullet = (expId: string, idx: number, value: string) =>
    update(d => ({
      ...d,
      sections: {
        ...d.sections,
        experience: d.sections?.experience?.map(e =>
          e.id === expId ? { ...e, bullets: e.bullets.map((b, i) => i === idx ? value : b) } : e
        ),
      },
    }));

  const addBullet = (expId: string) =>
    update(d => ({
      ...d,
      sections: {
        ...d.sections,
        experience: d.sections?.experience?.map(e =>
          e.id === expId ? { ...e, bullets: [...e.bullets, ''] } : e
        ),
      },
    }));

  const removeBullet = (expId: string, idx: number) =>
    update(d => ({
      ...d,
      sections: {
        ...d.sections,
        experience: d.sections?.experience?.map(e =>
          e.id === expId ? { ...e, bullets: e.bullets.filter((_, i) => i !== idx) } : e
        ),
      },
    }));

  const contactParts = data.contact
    ? [
        data.contact.email,
        data.contact.phone,
        data.contact.location,
        data.contact.linkedin,
        data.contact.github,
        data.contact.portfolio,
      ].filter(Boolean)
    : [];

  const cls = readOnly ? 'pointer-events-none' : '';

  return (
    <div className={`bg-slate-900 rounded-xl border border-slate-800 p-6 space-y-6 ${cls}`}>
      {/* Contact header */}
      {(data.contact?.name || data.role) && (
        <div className="text-center pb-4 border-b border-slate-800">
          <h2 className="text-xl font-bold text-slate-100">{data.contact?.name ?? data.role}</h2>
          {data.role && data.contact?.name && (
            <p className="text-sm text-slate-400 mt-0.5">{data.role}</p>
          )}
          {contactParts.length > 0 && (
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              {contactParts.join(' · ')}
            </p>
          )}
        </div>
      )}

      {/* Summary */}
      {data.sections?.summary && (
        <section>
          <h3 className="text-xs font-semibold text-blue-400 uppercase tracking-widest mb-2">Professional Summary</h3>
          {readOnly ? (
            <p className="text-sm text-slate-300 leading-relaxed">{data.sections.summary.content}</p>
          ) : (
            <textarea
              value={data.sections.summary.content ?? ''}
              onChange={e => updateSummary(e.target.value)}
              rows={4}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200
                         focus:outline-none focus:border-blue-500 resize-none leading-relaxed"
            />
          )}
        </section>
      )}

      {/* Skills */}
      {data.sections?.skills?.categories && (
        <section>
          <h3 className="text-xs font-semibold text-blue-400 uppercase tracking-widest mb-3">Skills</h3>
          <div className="space-y-2">
            {data.sections.skills.categories.map((cat, ci) => (
              <div key={ci} className="flex items-start gap-3">
                <span className="text-xs font-semibold text-slate-400 w-28 shrink-0 pt-0.5">{cat.name}</span>
                <div className="flex flex-wrap gap-1.5">
                  {cat.items.map((item, ii) => (
                    <span key={ii} className="px-2 py-0.5 bg-slate-800 text-slate-300 rounded text-xs">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Experience */}
      {data.sections?.experience && (
        <section>
          <h3 className="text-xs font-semibold text-blue-400 uppercase tracking-widest mb-3">Experience</h3>
          <div className="space-y-5">
            {data.sections.experience.map(exp => (
              <div key={exp.id} className={`relative ${exp.locked ? 'opacity-70' : ''}`}>
                {exp.locked && (
                  <span className="absolute -top-1 right-0 flex items-center gap-1 text-[10px] text-amber-500">
                    <LockIcon size={9} />
                    locked
                  </span>
                )}
                <div className="flex items-baseline justify-between mb-1">
                  <div>
                    <span className="font-semibold text-slate-100 text-sm">{exp.title}</span>
                    <span className="text-slate-400 text-sm ml-2">· {exp.company}</span>
                  </div>
                  <span className="text-xs text-slate-500">{exp.dates}</span>
                </div>
                <div className="text-xs text-slate-500 mb-2">{exp.location}</div>
                <ul className="space-y-1">
                  {exp.bullets.map((bullet, bi) => (
                    <li key={bi} className="flex items-start gap-2">
                      <span className="text-blue-500 text-sm mt-0.5 shrink-0">·</span>
                      {readOnly || exp.locked ? (
                        <span className="text-sm text-slate-300">{bullet}</span>
                      ) : (
                        <div className="flex-1 flex items-start gap-1">
                          <textarea
                            value={bullet}
                            onChange={e => updateBullet(exp.id, bi, e.target.value)}
                            rows={2}
                            className="flex-1 bg-transparent border-b border-transparent hover:border-slate-700 focus:border-blue-500
                                       text-sm text-slate-300 focus:outline-none resize-none py-0.5"
                          />
                          <button
                            type="button"
                            title="Remove bullet"
                            onClick={() => removeBullet(exp.id, bi)}
                            className="text-slate-700 hover:text-red-400 mt-1 shrink-0 transition-colors"
                          >
                            <CloseIcon size={10} />
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
                {!readOnly && !exp.locked && (
                  <button
                    type="button"
                    onClick={() => addBullet(exp.id)}
                    className="mt-2 flex items-center gap-1 text-xs text-slate-600 hover:text-blue-400 transition-colors ml-4"
                  >
                    <PlusIcon size={10} />
                    Add bullet
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Education */}
      {data.sections?.education && (
        <section>
          <h3 className="text-xs font-semibold text-blue-400 uppercase tracking-widest mb-3">Education</h3>
          <div className="space-y-2">
            {data.sections.education.map(ed => (
              <div key={ed.id}>
                <div className="font-medium text-slate-200 text-sm">{ed.degree}</div>
                <div className="text-xs text-slate-400">
                  {ed.institution}{ed.location && `, ${ed.location}`}{ed.year && ` · ${ed.year}`}
                  {ed.gpa && ` · GPA: ${ed.gpa}`}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Certifications */}
      {data.sections?.certifications && data.sections.certifications.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-blue-400 uppercase tracking-widest mb-2">Certifications</h3>
          <ul className="space-y-1">
            {data.sections.certifications.map((cert, i) => (
              <li key={i} className="text-sm text-slate-300 flex items-center gap-2">
                <span className="text-blue-500">·</span> {cert}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
