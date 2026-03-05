'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

type CaseTypeOption = { value: string; label: string };

type OrdersResult = {
  caseInfo: {
    caseType: string;
    caseNo: string;
    caseYear: string;
    status?: string;
    petitionerVsRespondent?: string;
  };
  details: {
    header?: string;
    keyValues: Array<{ key: string; value: string }>;
    listingHistory: Array<Record<string, string>>;
    iaDetails: Array<Record<string, string>>;
  };
  pdf: { filename: string; base64: string };
  excel: { filename: string; base64: string };
  orderJudgments?: Array<{
    srNo: number;
    date: string;
    viewUrl: string;
    judgmentId: string;
  }>;
};

function downloadBase64(filename: string, base64: string, mime: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function OrdersPage() {
  const searchParams = useSearchParams();
  const city = searchParams.get('city') === 'allahabad' ? 'allahabad' : 'lucknow';
  const cityLabel =
    city === 'allahabad' ? 'Case Status Allahabad' : 'Case Status Lucknow Bench';
  const [types, setTypes] = useState<CaseTypeOption[]>([]);
  const [typesLoading, setTypesLoading] = useState(true);
  const [typesError, setTypesError] = useState<string | null>(null);

  const [caseType, setCaseType] = useState('');
  const [caseNo, setCaseNo] = useState('');
  const [caseYear, setCaseYear] = useState(new Date().getFullYear().toString());

  const [loading, setLoading] = useState(false);
  const [judgmentLoadingId, setJudgmentLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OrdersResult | null>(null);
  const [showSearchForm, setShowSearchForm] = useState(false);

  useEffect(() => {
    if (searchParams.get('mode') === 'quick') {
      setShowSearchForm(true);
    }
  }, [searchParams]);

  useEffect(() => {
    (async () => {
      try {
        setTypesLoading(true);
        setTypesError(null);
        setCaseType('');
        setResult(null);
        const res = await fetch(`/api/orders/case-types?city=${city}`);
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Failed to load case types');
        setTypes(data.types || []);
      } catch (e) {
        setTypesError(e instanceof Error ? e.message : 'Failed to load case types');
      } finally {
        setTypesLoading(false);
      }
    })();
  }, [city]);

  const typeLabel = useMemo(
    () => types.find((t) => t.value === caseType)?.label || caseType,
    [types, caseType]
  );

  const runFetch = async () => {
    try {
      setLoading(true);
      setError(null);
      setResult(null);
      const res = await fetch('/api/orders/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseType, caseNo, caseYear, city }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to fetch orders');
      setResult(data.result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch orders');
    } finally {
      setLoading(false);
    }
  };

  const downloadJudgment = async (viewUrl: string, date: string, judgmentId: string) => {
    try {
      setJudgmentLoadingId(judgmentId);
      setError(null);
      const res = await fetch('/api/orders/judgment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ viewUrl, date }),
      });
      const data = await res.json();
      if (!data.success || !data.result) {
        throw new Error(data.error || 'Failed to download order/judgment');
      }

      downloadBase64(data.result.filename, data.result.base64, data.result.mimeType || 'application/pdf');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to download order/judgment');
    } finally {
      setJudgmentLoadingId(null);
    }
  };

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-7xl px-3 sm:px-6 py-6 sm:py-10">
        {/* Back link */}
        <div className="mb-4 sm:mb-6">
          <div className="flex items-center gap-4 mb-3 sm:mb-4">
            <Link
              href="/"
              className="text-cyan-400 hover:text-cyan-300 text-sm font-medium flex items-center gap-1.5 group"
            >
              <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Court View
            </Link>
          </div>
          <div className="glass-card-lg p-5 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
              <div>
                <p className="text-[11px] sm:text-xs tracking-[0.25em] uppercase text-amber-400/80 font-medium mb-2">
                  Orders
                </p>
                <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-100">
                  Case Orders & Judgments
                </h1>
                <p className="mt-1 text-xs sm:text-sm text-slate-400">
                  Fetch case details from the High Court site and download as PDF + Excel.
                </p>
                <p className="mt-1 text-xs sm:text-sm text-cyan-400/80 font-medium">
                  Source: {cityLabel}
                </p>
              </div>
              <button
                onClick={() => setShowSearchForm((v) => !v)}
                className="self-start inline-flex items-center gap-2 rounded-xl bg-sky-500/15 border border-sky-400/25 px-4 sm:px-5 py-2 sm:py-2.5 text-sm font-semibold text-sky-300 hover:bg-sky-500/25 hover:border-sky-400/40"
              >
                <span className="hidden sm:inline">Quick Search</span>
                <span className="sm:hidden">Search</span>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Quick Search */}
        {showSearchForm && (
          <div className="glass-card p-4 sm:p-5 mb-5 sm:mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base sm:text-lg font-bold text-slate-100">Search Orders</h2>
              <button
                onClick={() => setShowSearchForm(false)}
                className="rounded-lg bg-slate-700/40 border border-slate-600/20 px-3 py-1.5 text-xs sm:text-sm font-medium text-slate-300 hover:bg-slate-700/60"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <div>
                <label className="block text-xs sm:text-sm font-medium text-slate-400 mb-1.5">
                  Case Type
                </label>
                <select
                  value={caseType}
                  onChange={(e) => setCaseType(e.target.value)}
                  disabled={typesLoading}
                  className="w-full rounded-lg border border-slate-600/25 bg-slate-900/60 px-3 py-2.5 text-sm text-slate-100 focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/15 focus:outline-none disabled:opacity-50"
                >
                  <option value="">{typesLoading ? 'Loading...' : 'Select case type'}</option>
                  {types.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                {typesError && <div className="mt-1.5 text-xs text-red-400">{typesError}</div>}
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-slate-400 mb-1.5">
                  Case No.
                </label>
                <input
                  value={caseNo}
                  onChange={(e) => setCaseNo(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="Enter case number"
                  className="w-full rounded-lg border border-slate-600/25 bg-slate-900/60 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/15 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-slate-400 mb-1.5">
                  Case Year
                </label>
                <input
                  value={caseYear}
                  onChange={(e) => setCaseYear(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
                  placeholder="e.g. 2025"
                  className="w-full rounded-lg border border-slate-600/25 bg-slate-900/60 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/15 focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-4 flex flex-col sm:flex-row gap-2 sm:gap-3 sm:items-center sm:justify-between">
              <div className="text-xs text-slate-500 mb-2 sm:mb-0">
                Quickly search case details. Captcha is handled automatically. Results are not saved.
              </div>
              <button
                onClick={runFetch}
                disabled={loading || !caseType || !caseNo || caseYear.length !== 4}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-500/15 border border-sky-400/25 px-5 py-2.5 text-sm font-semibold text-sky-300 hover:bg-sky-500/25 disabled:opacity-40 w-full sm:w-auto"
              >
                {loading && <span className="w-4 h-4 border-2 border-sky-300/30 border-t-sky-300 rounded-full animate-spin"></span>}
                {loading ? 'Searching...' : 'Search'}
              </button>
            </div>
            {error && <div className="mt-3 text-sm text-red-400">{error}</div>}
          </div>
        )}

        {/* Regular Form */}
        {!showSearchForm && (
          <div className="glass-card p-4 sm:p-5 mb-5 sm:mb-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <div>
                <label className="block text-xs sm:text-sm font-medium text-slate-400 mb-1.5">
                  Case Type
                </label>
                <select
                  value={caseType}
                  onChange={(e) => setCaseType(e.target.value)}
                  disabled={typesLoading}
                  className="w-full rounded-lg border border-slate-600/25 bg-slate-900/60 px-3 py-2.5 text-sm text-slate-100 focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/15 focus:outline-none disabled:opacity-50"
                >
                  <option value="">{typesLoading ? 'Loading...' : 'Select case type'}</option>
                  {types.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                {typesError && <div className="mt-1.5 text-xs text-red-400">{typesError}</div>}
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-slate-400 mb-1.5">
                  Case No.
                </label>
                <input
                  value={caseNo}
                  onChange={(e) => setCaseNo(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="Enter case number"
                  className="w-full rounded-lg border border-slate-600/25 bg-slate-900/60 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/15 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-slate-400 mb-1.5">
                  Case Year
                </label>
                <input
                  value={caseYear}
                  onChange={(e) => setCaseYear(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
                  placeholder="e.g. 2025"
                  className="w-full rounded-lg border border-slate-600/25 bg-slate-900/60 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/15 focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-4 flex flex-col sm:flex-row gap-2 sm:gap-3 sm:items-center sm:justify-between">
              <div className="text-xs text-slate-500">
                Captcha is handled automatically.
              </div>
              <button
                onClick={runFetch}
                disabled={loading || !caseType || !caseNo || caseYear.length !== 4}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500/15 border border-amber-400/25 px-5 py-2.5 text-sm font-semibold text-amber-300 hover:bg-amber-500/25 disabled:opacity-40"
              >
                {loading && <span className="w-4 h-4 border-2 border-amber-300/30 border-t-amber-300 rounded-full animate-spin"></span>}
                {loading ? 'Fetching...' : 'Fetch Orders'}
              </button>
            </div>
            {error && <div className="mt-3 text-sm text-red-400">{error}</div>}
          </div>
        )}

        {result && (
          <div className="glass-card p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg sm:text-xl font-bold text-slate-100">
                  {result.details.header || `${typeLabel} / ${result.caseInfo.caseNo}/${result.caseInfo.caseYear}`}
                </h2>
                <div className="mt-1.5 flex items-center gap-2 text-sm text-slate-300">
                  <span className="font-medium text-slate-400">Status:</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-cyan-500/15 text-cyan-300 border border-cyan-400/20">
                    {result.caseInfo.status || '—'}
                  </span>
                </div>
                {result.caseInfo.petitionerVsRespondent && (
                  <div className="mt-1.5 text-sm text-slate-400 break-words">
                    {result.caseInfo.petitionerVsRespondent}
                  </div>
                )}
              </div>
              <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0 w-full sm:w-auto">
                <button
                  onClick={() => downloadBase64(result.pdf.filename, result.pdf.base64, 'application/pdf')}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-500/15 border border-sky-400/25 px-4 py-2 text-xs sm:text-sm font-semibold text-sky-300 hover:bg-sky-500/25 w-full sm:w-auto"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  Download PDF
                </button>
                <button
                  onClick={() =>
                    downloadBase64(
                      result.excel.filename,
                      result.excel.base64,
                      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                    )
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500/15 border border-emerald-400/25 px-4 py-2 text-xs sm:text-sm font-semibold text-emerald-300 hover:bg-emerald-500/25 w-full sm:w-auto"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  Download Excel
                </button>
              </div>
            </div>

            <div className="mt-5">
              <h3 className="text-sm sm:text-base font-semibold text-slate-200 mb-3">Key details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
                {result.details.keyValues.slice(0, 40).map((kv, idx) => (
                  <div
                    key={`${kv.key}-${idx}`}
                    className="rounded-lg border border-slate-700/40 bg-slate-800/30 px-3 py-2.5"
                  >
                    <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-0.5">{kv.key}</div>
                    <div className="text-xs sm:text-sm text-slate-200 break-words">{kv.value}</div>
                  </div>
                ))}
              </div>
              {result.details.keyValues.length > 40 && (
                <div className="mt-3 text-xs text-slate-500 px-1">
                  Showing first 40 fields. Download Excel for the full structured output.
                </div>
              )}
            </div>

            {result.orderJudgments && result.orderJudgments.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm sm:text-base font-semibold text-slate-200 mb-3">
                  Order/Judgment Documents
                </h3>
                <div className="space-y-2.5">
                  {result.orderJudgments.map((entry) => (
                    <div
                      key={`${entry.judgmentId}-${entry.srNo}`}
                      className="rounded-lg border border-slate-700/40 bg-slate-800/30 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                    >
                      <div className="text-xs sm:text-sm text-slate-300">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-indigo-500/15 text-indigo-300 text-xs font-bold mr-2 border border-indigo-400/20">
                          {entry.srNo}
                        </span>
                        {entry.date || 'Date unavailable'}
                      </div>
                      <button
                        onClick={() => downloadJudgment(entry.viewUrl, entry.date, entry.judgmentId)}
                        disabled={judgmentLoadingId === entry.judgmentId}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-500/15 border border-indigo-400/25 px-4 py-2 text-xs sm:text-sm font-semibold text-indigo-300 hover:bg-indigo-500/25 disabled:opacity-40 w-full sm:w-auto"
                      >
                        {judgmentLoadingId === entry.judgmentId ? 'Downloading...' : 'Download Order/Judgment'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
