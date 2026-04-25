import { useState, useRef, useCallback } from 'react';
import { saveUserTemplate, parseDocxText, type UserTemplate } from '../lib/userTemplates';
import { useAppStore } from '../store/app';
import { UploadIcon, DocIcon, CheckIcon, CloseIcon, TrashIcon } from './ui/Icons';

interface Props {
  onUploaded?: (template: UserTemplate) => void;
}

type UploadState = 'idle' | 'parsing' | 'preview' | 'saved' | 'error';

export default function UserTemplateUploader({ onUploaded }: Props) {
  const { addToast } = useAppStore();
  const [state, setState] = useState<UploadState>('idle');
  const [dragOver, setDragOver] = useState(false);
  const [roleName, setRoleName] = useState('');
  const [parsed, setParsed] = useState<UserTemplate | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const ROLE_SUGGESTIONS = [
    'Data Scientist', 'ML Engineer', 'AI Engineer', 'Data Analyst',
    'Business Analyst', 'Product Analyst', 'Product Manager', 'Software Engineer',
    'DevOps Engineer', 'Research Scientist',
  ];

  const processFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.docx')) {
      setErrorMsg('Only .docx files are supported');
      setState('error');
      return;
    }

    if (!roleName.trim()) {
      addToast('error', 'Enter a role name before uploading');
      return;
    }

    setState('parsing');

    try {
      const mammoth = await import('mammoth');
      const buffer = await file.arrayBuffer();
      const result = await mammoth.default.extractRawText({ arrayBuffer: buffer });
      const rawText = result.value;

      if (!rawText || rawText.length < 100) {
        throw new Error('Could not extract text from this file. Try a different DOCX.');
      }

      const template = parseDocxText(rawText, roleName.trim());
      template.fileName = file.name;

      setParsed(template);
      setState('preview');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Failed to parse DOCX');
      setState('error');
    }
  }, [roleName, addToast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleSave = () => {
    if (!parsed) return;
    saveUserTemplate(parsed);
    setState('saved');
    onUploaded?.(parsed);
    addToast('success', `"${parsed.role}" template saved`);
  };

  const handleReset = () => {
    setState('idle');
    setParsed(null);
    setErrorMsg('');
    setRoleName('');
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="space-y-4">
      {/* Role name input — required before upload */}
      <div>
        <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
          Target Role for This Template
        </label>
        <input
          type="text"
          value={roleName}
          onChange={e => setRoleName(e.target.value)}
          placeholder="e.g. Senior Data Scientist"
          list="role-suggestions"
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100
                     placeholder:text-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1
                     focus:ring-blue-500 transition-colors"
        />
        <datalist id="role-suggestions">
          {ROLE_SUGGESTIONS.map(r => <option key={r} value={r} />)}
        </datalist>
        <p className="text-xs text-slate-600 mt-1.5">
          Name the role this resume is tailored for. Used to route AI prompts.
        </p>
      </div>

      {/* Upload zone */}
      {(state === 'idle' || state === 'error') && (
        <div
          onDrop={handleDrop}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => roleName.trim() && fileRef.current?.click()}
          className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
            dragOver
              ? 'border-blue-500 bg-blue-950/20'
              : !roleName.trim()
              ? 'border-slate-800 bg-slate-900/50 cursor-not-allowed opacity-50'
              : 'border-slate-700 bg-slate-900 hover:border-blue-500/50 hover:bg-blue-950/10'
          }`}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".docx"
            onChange={handleFileInput}
            className="hidden"
          />
          <div className="flex flex-col items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${dragOver ? 'bg-blue-600' : 'bg-slate-800'}`}>
              <UploadIcon size={20} className={dragOver ? 'text-white' : 'text-slate-400'} />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-300">
                {dragOver ? 'Drop your DOCX here' : 'Drag and drop your DOCX resume'}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                or click to browse — .docx only, parsed entirely in your browser
              </p>
            </div>
          </div>

          {state === 'error' && (
            <div className="mt-3 text-xs text-red-400 bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2">
              {errorMsg}
            </div>
          )}
        </div>
      )}

      {/* Parsing state */}
      {state === 'parsing' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex items-center gap-4">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin shrink-0" />
          <div>
            <p className="text-sm font-medium text-slate-200">Parsing your DOCX...</p>
            <p className="text-xs text-slate-500 mt-0.5">Running in your browser. Nothing is sent to any server.</p>
          </div>
        </div>
      )}

      {/* Preview state */}
      {state === 'preview' && parsed && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-green-900/40 rounded-xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-green-900/40 rounded-lg flex items-center justify-center">
                  <DocIcon size={16} className="text-green-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-100">{parsed.fileName}</p>
                  <p className="text-xs text-slate-500">Parsed as: {parsed.role}</p>
                </div>
              </div>
              <button onClick={handleReset} className="text-slate-600 hover:text-slate-300 transition-colors">
                <CloseIcon size={14} />
              </button>
            </div>
          </div>

          {/* Preview summary */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 text-sm">
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { label: 'Experience entries', value: parsed.sections.experience.length },
                { label: 'Skill categories', value: parsed.sections.skills.categories.length },
                { label: 'Education', value: parsed.sections.education.length },
              ].map(s => (
                <div key={s.label} className="bg-slate-800 rounded-lg p-3">
                  <div className="text-xl font-bold text-blue-400">{s.value}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>

            {parsed.contact?.name && (
              <div className="text-xs text-slate-400 bg-slate-800 rounded-lg p-3">
                <span className="text-slate-500">Contact detected: </span>
                {[parsed.contact.name, parsed.contact.email, parsed.contact.location]
                  .filter(Boolean).join(' | ')}
              </div>
            )}

            {parsed.sections.summary.content && (
              <div>
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Summary preview</div>
                <p className="text-xs text-slate-400 line-clamp-3">{parsed.sections.summary.content}</p>
              </div>
            )}

            {parsed.sections.experience.length > 0 && (
              <div>
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-1.5">Experience detected</div>
                {parsed.sections.experience.slice(0, 3).map(exp => (
                  <div key={exp.id} className="text-xs text-slate-400 mb-1">
                    <span className="text-slate-300">{exp.title}</span> at {exp.company}
                    <span className="text-slate-600 ml-2">({exp.bullets.length} bullets)</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleSave}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-500
                         text-white rounded-xl text-sm font-medium transition-colors"
            >
              <CheckIcon size={14} />
              Save Template
            </button>
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700
                         text-slate-300 rounded-xl text-sm transition-colors"
            >
              <TrashIcon size={14} />
              Discard
            </button>
          </div>
        </div>
      )}

      {/* Saved confirmation */}
      {state === 'saved' && (
        <div className="bg-green-950/20 border border-green-900/40 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckIcon size={16} className="text-green-400" />
            <p className="text-sm text-green-300">Template saved and ready to use</p>
          </div>
          <button onClick={handleReset} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
            Upload another
          </button>
        </div>
      )}
    </div>
  );
}
