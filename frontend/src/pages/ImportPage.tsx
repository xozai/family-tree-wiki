import { useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';

type Step = 'select' | 'preview' | 'importing' | 'done' | 'error';

interface PreviewData {
  preview: {
    individualsCount: number;
    familiesCount: number;
    dateRange: { earliest: number; latest: number } | null;
    sampleNames: string[];
  };
  warnings: string[];
}

interface ImportResult {
  imported: { members: number; relationships: number };
  skipped: { duplicates: number; unparseable: number };
  warnings: string[];
}

export default function ImportPage() {
  const [step, setStep] = useState<Step>('select');
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── File selection ──────────────────────────────────────────────────────────
  const handleFile = (f: File) => {
    if (!f.name.toLowerCase().endsWith('.ged')) {
      setErrorMsg('Please select a .ged GEDCOM file.');
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setErrorMsg('File must be 10 MB or smaller.');
      return;
    }
    setErrorMsg('');
    setFile(f);
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }, []);

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => setIsDragging(false);

  // ── Preview ─────────────────────────────────────────────────────────────────
  const handlePreview = async () => {
    if (!file) return;
    setStep('preview');
    setPreviewData(null);
    setErrorMsg('');

    try {
      const form = new FormData();
      form.append('file', file);
      const { data } = await api.post<PreviewData>('/import/gedcom/preview', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setPreviewData(data);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to preview file.';
      setErrorMsg(msg);
      setStep('error');
    }
  };

  // ── Confirm import ──────────────────────────────────────────────────────────
  const handleConfirm = async () => {
    if (!file) return;
    setStep('importing');
    setErrorMsg('');

    try {
      const form = new FormData();
      form.append('file', file);
      const { data } = await api.post<ImportResult>('/import/gedcom', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(data);
      setStep('done');
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Import failed.';
      setErrorMsg(msg);
      setStep('error');
    }
  };

  const reset = () => {
    setStep('select');
    setFile(null);
    setPreviewData(null);
    setResult(null);
    setErrorMsg('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-serif font-semibold text-stone-800">Import GEDCOM File</h1>
        <p className="text-stone-500 text-sm mt-1">
          Import family data from a standard GEDCOM (.ged) file — versions 5.5 and 5.5.1 supported.
        </p>
      </div>

      {/* ── Step indicator ── */}
      <div className="flex items-center gap-2 mb-8 text-xs text-stone-400">
        {(['select', 'preview', 'done'] as const).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            {i > 0 && <div className="w-8 h-px bg-stone-200" />}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium ${
                step === s || (step === 'importing' && s === 'preview') || (step === 'error' && s === 'select')
                  ? 'bg-amber-100 text-amber-800'
                  : step === 'done' || (s === 'select' && step !== 'select')
                  ? 'bg-green-100 text-green-700'
                  : 'bg-stone-100 text-stone-400'
              }`}
            >
              <span>{i + 1}</span>
              <span className="capitalize">{s === 'done' ? 'Complete' : s}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── SELECT step ── */}
      {step === 'select' && (
        <div>
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
              isDragging
                ? 'border-amber-400 bg-amber-50'
                : file
                ? 'border-green-400 bg-green-50'
                : 'border-stone-300 bg-stone-50 hover:border-amber-300 hover:bg-amber-50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".ged"
              className="hidden"
              onChange={onInputChange}
            />
            {file ? (
              <div>
                <div className="text-4xl mb-3">📂</div>
                <p className="font-medium text-stone-700">{file.name}</p>
                <p className="text-stone-400 text-sm mt-1">{formatSize(file.size)}</p>
                <p className="text-green-600 text-sm mt-2">File ready — click to change</p>
              </div>
            ) : (
              <div>
                <div className="text-4xl mb-3">📁</div>
                <p className="font-medium text-stone-600">Drop your .ged file here</p>
                <p className="text-stone-400 text-sm mt-1">or click to browse</p>
                <p className="text-stone-300 text-xs mt-3">Maximum file size: 10 MB</p>
              </div>
            )}
          </div>

          {errorMsg && (
            <p className="mt-3 text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-2">
              {errorMsg}
            </p>
          )}

          <div className="mt-6 flex justify-end">
            <button
              disabled={!file}
              onClick={handlePreview}
              className="bg-amber-700 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg font-medium transition-colors"
            >
              Preview Import →
            </button>
          </div>
        </div>
      )}

      {/* ── PREVIEW step ── */}
      {(step === 'preview' || step === 'importing') && (
        <div>
          {!previewData ? (
            <div className="text-center py-16 text-stone-400">
              <div className="text-3xl mb-3 animate-pulse">⏳</div>
              <p>Analysing file…</p>
            </div>
          ) : (
            <div>
              <h2 className="font-semibold text-stone-700 mb-4">Ready to import</h2>

              {/* Summary cards */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
                  <div className="text-3xl font-bold text-blue-700">
                    {previewData.preview.individualsCount}
                  </div>
                  <div className="text-blue-600 text-sm mt-1">Individuals</div>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-center">
                  <div className="text-3xl font-bold text-purple-700">
                    {previewData.preview.familiesCount}
                  </div>
                  <div className="text-purple-600 text-sm mt-1">Family Units</div>
                </div>
              </div>

              {/* Details table */}
              <div className="bg-white border border-stone-200 rounded-xl overflow-hidden mb-6">
                <table className="w-full text-sm">
                  <tbody>
                    {previewData.preview.dateRange && (
                      <tr className="border-b border-stone-100">
                        <td className="px-4 py-3 text-stone-500">Date range</td>
                        <td className="px-4 py-3 font-medium text-stone-700">
                          {previewData.preview.dateRange.earliest} –{' '}
                          {previewData.preview.dateRange.latest}
                        </td>
                      </tr>
                    )}
                    {previewData.preview.sampleNames.length > 0 && (
                      <tr className="border-b border-stone-100">
                        <td className="px-4 py-3 text-stone-500 align-top">Sample names</td>
                        <td className="px-4 py-3 text-stone-700">
                          {previewData.preview.sampleNames.join(', ')}
                          {previewData.preview.individualsCount > 5 && (
                            <span className="text-stone-400">
                              {' '}
                              +{previewData.preview.individualsCount - 5} more
                            </span>
                          )}
                        </td>
                      </tr>
                    )}
                    <tr>
                      <td className="px-4 py-3 text-stone-500">Source file</td>
                      <td className="px-4 py-3 text-stone-700">{file?.name}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Warnings */}
              {previewData.warnings.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6">
                  <p className="text-yellow-800 font-medium text-sm mb-2">
                    ⚠️ {previewData.warnings.length} warning
                    {previewData.warnings.length !== 1 ? 's' : ''} detected
                  </p>
                  <ul className="text-yellow-700 text-xs space-y-1 list-disc list-inside">
                    {previewData.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {step === 'importing' ? (
                <div className="text-center py-8 text-stone-500">
                  <div className="text-3xl mb-3 animate-spin">⚙️</div>
                  <p className="font-medium">Importing…</p>
                  <p className="text-sm text-stone-400 mt-1">This may take a moment for large files.</p>
                </div>
              ) : (
                <div className="flex justify-between items-center">
                  <button onClick={reset} className="text-stone-500 hover:text-stone-700 text-sm">
                    ← Choose different file
                  </button>
                  <button
                    onClick={handleConfirm}
                    className="bg-green-700 hover:bg-green-600 text-white px-6 py-2 rounded-lg font-medium transition-colors"
                  >
                    Confirm Import
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── DONE step ── */}
      {step === 'done' && result && (
        <div>
          <div className="bg-green-50 border border-green-200 rounded-xl p-6 mb-6 text-center">
            <div className="text-4xl mb-2">✅</div>
            <h2 className="text-xl font-semibold text-green-800">Import Complete</h2>
          </div>

          {/* Result cards */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-green-700">{result.imported.members}</div>
              <div className="text-green-600 text-sm mt-1">Members imported</div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-blue-700">{result.imported.relationships}</div>
              <div className="text-blue-600 text-sm mt-1">Relationships linked</div>
            </div>
          </div>

          {(result.skipped.duplicates > 0 || result.skipped.unparseable > 0) && (
            <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 mb-6">
              <p className="text-stone-600 font-medium text-sm mb-2">Skipped</p>
              <div className="flex gap-6 text-sm">
                {result.skipped.duplicates > 0 && (
                  <span className="text-stone-500">
                    <strong className="text-stone-700">{result.skipped.duplicates}</strong> duplicates
                  </span>
                )}
                {result.skipped.unparseable > 0 && (
                  <span className="text-stone-500">
                    <strong className="text-stone-700">{result.skipped.unparseable}</strong> unparseable
                  </span>
                )}
              </div>
            </div>
          )}

          {result.warnings.length > 0 && (
            <details className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6">
              <summary className="text-yellow-800 font-medium text-sm cursor-pointer">
                ⚠️ {result.warnings.length} warning{result.warnings.length !== 1 ? 's' : ''}
              </summary>
              <ul className="mt-2 text-yellow-700 text-xs space-y-1 list-disc list-inside">
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </details>
          )}

          <div className="flex gap-3">
            <Link
              to="/members"
              className="bg-amber-700 hover:bg-amber-600 text-white px-5 py-2 rounded-lg font-medium transition-colors text-sm"
            >
              Browse imported profiles →
            </Link>
            <button onClick={reset} className="text-stone-500 hover:text-stone-700 text-sm px-4">
              Import another file
            </button>
          </div>
        </div>
      )}

      {/* ── ERROR step ── */}
      {step === 'error' && (
        <div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 mb-6">
            <div className="text-3xl mb-2">❌</div>
            <h2 className="font-semibold text-red-800 mb-1">Import failed</h2>
            <p className="text-red-600 text-sm">{errorMsg}</p>
          </div>
          <button onClick={reset} className="text-stone-500 hover:text-stone-700 text-sm">
            ← Try again
          </button>
        </div>
      )}
    </div>
  );
}
