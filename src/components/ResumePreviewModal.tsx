import { useState, useEffect, useRef } from 'react';
import type { PageFormat } from '../lib/export/index';

interface Props {
  content: string;
  role: string;
  company: string;
  excludedSections?: string[];
  initialFormat?: PageFormat;
  onClose: () => void;
}

export default function ResumePreviewModal({
  content, role, company, excludedSections, initialFormat = 'letter', onClose,
}: Props) {
  const [pageFormat, setPageFormat] = useState<PageFormat>(initialFormat);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const prevUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    (async () => {
      try {
        const { buildPdf } = await import('../lib/export/to-pdf');
        const blob = await buildPdf(content, role, company, { excludedSections, pageFormat });
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
        prevUrlRef.current = url;
        setBlobUrl(url);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Preview failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [content, role, company, excludedSections, pageFormat]);

  // cleanup on unmount
  useEffect(() => {
    return () => { if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current); };
  }, []);

  const handleDownload = async () => {
    if (!blobUrl) return;
    setDownloading(true);
    try {
      const { exportToPdf } = await import('../lib/export/index');
      await exportToPdf(content, role, company, { excludedSections, pageFormat });
    } finally {
      setDownloading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label="Resume preview"
    >
      <div className="flex flex-col w-full max-w-4xl h-[90vh] bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-4 px-5 py-3 border-b border-slate-800 shrink-0">
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-slate-100">Resume Preview</h2>
            <p className="text-xs text-slate-500 mt-0.5">{role}{company ? ` — ${company}` : ''}</p>
          </div>

          {/* Page format selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Page</span>
            <div className="flex rounded-lg border border-slate-700 overflow-hidden text-xs">
              {(['letter', 'a4'] as PageFormat[]).map(fmt => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setPageFormat(fmt)}
                  className={`px-3 py-1.5 transition-colors ${
                    pageFormat === fmt
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {fmt === 'letter' ? 'Letter' : 'A4'}
                </button>
              ))}
            </div>
          </div>

          {/* Download button */}
          <button
            type="button"
            onClick={handleDownload}
            disabled={loading || downloading || !!error}
            className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40
                       text-white rounded-lg text-xs font-medium transition-colors"
          >
            {downloading
              ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
            }
            Download PDF
          </button>

          {/* Close */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700
                       text-slate-400 hover:text-slate-100 transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Preview body */}
        <div className="flex-1 overflow-hidden bg-slate-950 flex items-center justify-center">
          {loading && (
            <div className="flex flex-col items-center gap-3 text-slate-400">
              <span className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">Rendering preview…</span>
            </div>
          )}
          {error && !loading && (
            <p className="text-sm text-red-400">{error}</p>
          )}
          {blobUrl && !loading && !error && (
            <iframe
              src={blobUrl}
              title="Resume PDF preview"
              className="w-full h-full border-0"
              style={{ background: 'white' }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
