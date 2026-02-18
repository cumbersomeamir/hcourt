'use client';

import { useMemo, useState } from 'react';
import { Cinzel, Manrope } from 'next/font/google';

const cinzel = Cinzel({
  subsets: ['latin'],
  weight: ['600', '700'],
});

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
});

type DateOption = { value: string; label: string };
type CourtOption = { value: string; label: string };
type PdfLink = { label: string; url: string };

type CourtSearchResult = {
  listTypeLabel: string;
  listDate: string;
  courtNo: string;
  courtLabel: string;
  links: PdfLink[];
};

type CounselSearchResult = {
  listTypeLabel: string;
  listDate: string;
  counselName: string;
  totalRows: number;
  previewRows: Array<Record<string, string | number | null>>;
  excel: {
    filename: string;
    base64: string;
  };
};

type ApiSuccess<T> = {
  success: true;
  result: T;
};

type ApiFailure = {
  success: false;
  error?: string;
};

type BenchKey = 'allahabad' | 'lucknow';
type ActiveTile = 'allahabad' | 'lucknow' | 'mediation' | null;
type SearchType = 'court' | 'counsel';

const LIST_TYPE = 'Z';

const tiles: Array<{
  key: ActiveTile;
  label: string;
  caption: string;
}> = [
  {
    key: 'allahabad',
    label: 'Cause List Allahabad',
    caption: 'Simplified court/counsel search',
  },
  {
    key: 'lucknow',
    label: 'Cause List Lucknow Bench',
    caption: 'Simplified court/counsel search',
  },
  {
    key: 'mediation',
    label: 'Mediation Causelist',
    caption: 'Coming soon',
  },
];

function readApiError(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return 'Request failed';
  const maybeError = (payload as { error?: unknown }).error;
  if (typeof maybeError === 'string' && maybeError.trim()) return maybeError;
  return 'Request failed';
}

async function parseApiResult<T>(response: Response): Promise<T> {
  let payload: ApiSuccess<T> | ApiFailure | undefined;
  try {
    payload = (await response.json()) as ApiSuccess<T> | ApiFailure;
  } catch {
    throw new Error('Invalid API response');
  }

  if (!response.ok || !payload?.success) {
    throw new Error(readApiError(payload));
  }
  return payload.result;
}

function downloadBase64File(filename: string, mimeType: string, base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function CauseListPage() {
  const [activeTile, setActiveTile] = useState<ActiveTile>(null);
  const [searchType, setSearchType] = useState<SearchType>('court');
  const [dates, setDates] = useState<DateOption[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [loadingDates, setLoadingDates] = useState(false);

  const [courtOptions, setCourtOptions] = useState<CourtOption[]>([]);
  const [selectedCourtNo, setSelectedCourtNo] = useState('');
  const [loadingCourtOptions, setLoadingCourtOptions] = useState(false);

  const [loadingSearch, setLoadingSearch] = useState(false);
  const [courtResult, setCourtResult] = useState<CourtSearchResult | null>(null);
  const [selectedPdfUrl, setSelectedPdfUrl] = useState('');
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const [counselName, setCounselName] = useState('');
  const [counselResult, setCounselResult] = useState<CounselSearchResult | null>(null);

  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const previewColumns = useMemo(() => {
    if (!counselResult?.previewRows?.length) return [] as string[];
    return Object.keys(counselResult.previewRows[0]);
  }, [counselResult]);

  const activeBench: BenchKey | null =
    activeTile === 'allahabad' || activeTile === 'lucknow' ? activeTile : null;

  function benchLabel(bench: BenchKey): string {
    return bench === 'allahabad' ? 'Cause List Allahabad' : 'Cause List Lucknow Bench';
  }

  function resetResultState() {
    setCourtResult(null);
    setSelectedPdfUrl('');
    setCounselResult(null);
  }

  function resetBenchState() {
    setDates([]);
    setSelectedDate('');
    setCourtOptions([]);
    setSelectedCourtNo('');
    setCounselName('');
    resetResultState();
  }

  async function loadDates(bench: BenchKey) {
    setError('');
    setInfo('');
    setLoadingDates(true);
    try {
      const response = await fetch(`/api/cause-list/${bench}/dates?listType=${LIST_TYPE}`);
      const result = await parseApiResult<{
        listType: string;
        listTypeLabel: string;
        dates: DateOption[];
      }>(response);
      setDates(result.dates);
      setSelectedDate(result.dates[0]?.value || '');
      setInfo(`Loaded ${result.dates.length} listing dates.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load dates');
    } finally {
      setLoadingDates(false);
    }
  }

  async function activateBenchTile(bench: BenchKey) {
    setActiveTile(bench);
    setError('');
    setInfo('');
    resetBenchState();
    if (!loadingDates) {
      await loadDates(bench);
    }
  }

  async function handleNext() {
    setError('');
    setInfo('');
    resetResultState();

    if (!selectedDate) {
      setError('Please select listing date first.');
      return;
    }
    if (!activeBench) {
      setError('Please choose Allahabad or Lucknow tile first.');
      return;
    }

    if (searchType === 'court') {
      setLoadingCourtOptions(true);
      try {
        const response = await fetch(`/api/cause-list/${activeBench}/court-options`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            listType: LIST_TYPE,
            listDate: selectedDate,
          }),
        });
        const result = await parseApiResult<{
          listType: string;
          listDate: string;
          options: CourtOption[];
        }>(response);
        setCourtOptions(result.options);
        setSelectedCourtNo(result.options[0]?.value || '');
        setInfo('Court numbers loaded. Choose one and click Search.');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load court numbers');
      } finally {
        setLoadingCourtOptions(false);
      }
      return;
    }

    setCourtOptions([]);
    setSelectedCourtNo('');
    setInfo('Enter counsel name and click Search.');
  }

  async function handleCourtSearch() {
    setError('');
    setInfo('');
    setCourtResult(null);
    setCounselResult(null);

    if (!selectedDate || !selectedCourtNo) {
      setError('Please select listing date and court number.');
      return;
    }
    if (!activeBench) {
      setError('Please choose Allahabad or Lucknow tile first.');
      return;
    }

    setLoadingSearch(true);
    try {
      const response = await fetch(`/api/cause-list/${activeBench}/court-search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listType: LIST_TYPE,
          listDate: selectedDate,
          courtNo: selectedCourtNo,
        }),
      });
      const result = await parseApiResult<CourtSearchResult>(response);
      setCourtResult(result);
      const firstLink = result.links[0]?.url || '';
      setSelectedPdfUrl(firstLink);
      setInfo(result.links.length > 0 ? `Found ${result.links.length} list PDF link(s).` : 'No PDF links found for this selection.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Court search failed');
    } finally {
      setLoadingSearch(false);
    }
  }

  async function handleDownloadCourtPdf() {
    setError('');
    if (!selectedPdfUrl) {
      setError('Please select a list PDF first.');
      return;
    }
    if (!activeBench) {
      setError('Please choose Allahabad or Lucknow tile first.');
      return;
    }

    setDownloadingPdf(true);
    try {
      const response = await fetch(`/api/cause-list/${activeBench}/court-download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfUrl: selectedPdfUrl }),
      });
      const result = await parseApiResult<{
        filename: string;
        mimeType: string;
        base64: string;
      }>(response);
      downloadBase64File(result.filename, result.mimeType, result.base64);
      setInfo('PDF downloaded.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to download PDF');
    } finally {
      setDownloadingPdf(false);
    }
  }

  async function handleCounselSearch() {
    setError('');
    setInfo('');
    setCourtResult(null);
    setCounselResult(null);

    if (!selectedDate) {
      setError('Please select listing date.');
      return;
    }
    if (counselName.trim().length < 4) {
      setError('Counsel name must be at least 4 characters.');
      return;
    }
    if (!activeBench) {
      setError('Please choose Allahabad or Lucknow tile first.');
      return;
    }

    setLoadingSearch(true);
    try {
      const response = await fetch(`/api/cause-list/${activeBench}/counsel-search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listType: LIST_TYPE,
          listDate: selectedDate,
          counselName: counselName.trim(),
        }),
      });
      const result = await parseApiResult<CounselSearchResult>(response);
      setCounselResult(result);
      setInfo(`Found ${result.totalRows} row(s).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Counsel search failed');
    } finally {
      setLoadingSearch(false);
    }
  }

  function handleDownloadCounselExcel() {
    if (!counselResult?.excel?.base64) return;
    downloadBase64File(
      counselResult.excel.filename,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      counselResult.excel.base64
    );
  }

  return (
    <div
      className={`min-h-screen bg-slate-950 ${manrope.className}`}
      style={{
        backgroundImage:
          'radial-gradient(1200px 420px at 50% -40px, rgba(249,115,22,0.22), transparent 60%), linear-gradient(180deg, #020617 0%, #0b1a3b 58%, #12284a 100%)',
      }}
    >
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:pt-14">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-[0_24px_100px_rgba(0,0,0,0.45)] backdrop-blur-md sm:p-8">
          <div className="mx-auto max-w-4xl text-center">
            <p className="text-xs tracking-[0.28em] text-orange-300/80 sm:text-sm">
              CAUSE LIST PORTAL
            </p>
            <h1
              className={`mt-3 text-2xl font-semibold tracking-wide text-orange-400 sm:text-4xl ${cinzel.className}`}
            >
              HIGH COURT OF JUDICATURE AT ALLAHABAD
            </h1>
          </div>

          <div className="mx-auto mt-8 grid max-w-3xl grid-cols-1 gap-4 sm:mt-10">
            {tiles.map((tile) => (
              <button
                key={tile.label}
                type="button"
                onClick={async () => {
                  if (tile.key === 'allahabad' || tile.key === 'lucknow') {
                    await activateBenchTile(tile.key);
                    return;
                  }
                  setActiveTile(tile.key);
                  setError('');
                  setInfo(tile.caption);
                }}
                className={`rounded-2xl border p-5 text-left transition ${
                  activeTile === tile.key
                    ? 'border-cyan-200/70 bg-slate-900/70'
                    : 'border-white/15 bg-slate-900/35 hover:border-white/30'
                }`}
              >
                <p className="text-center text-sm font-semibold uppercase tracking-[0.08em] text-slate-100/90 sm:text-base">
                  {tile.label}
                </p>
                <p className="mt-2 text-center text-xs text-slate-300/75">{tile.caption}</p>
              </button>
            ))}
          </div>

          {activeBench && (
            <div className="mx-auto mt-8 max-w-3xl rounded-2xl border border-cyan-200/20 bg-slate-900/55 p-4 sm:mt-10 sm:p-6">
              <h2 className="text-base font-semibold uppercase tracking-[0.08em] text-cyan-100 sm:text-lg">
                {benchLabel(activeBench)}
              </h2>
              <p className="mt-1 text-xs text-slate-300">
                Select listing date and search type. Advocate Roll No wise is intentionally excluded.
              </p>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-200">
                    Listing Date
                  </label>
                  <select
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="mt-2 w-full rounded-lg border border-slate-500/40 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-300"
                    disabled={loadingDates}
                  >
                    <option value="">
                      {loadingDates ? 'Loading dates...' : 'Select listing date'}
                    </option>
                    {dates.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-200">
                    Search Type
                  </label>
                  <div className="mt-2 space-y-2 text-sm text-slate-100">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="cause-list-search-type"
                        checked={searchType === 'court'}
                        onChange={() => setSearchType('court')}
                      />
                      <span>Court Wise</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="cause-list-search-type"
                        checked={searchType === 'counsel'}
                        onChange={() => setSearchType('counsel')}
                      />
                      <span>Counsel Wise</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleNext}
                  className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-60"
                  disabled={loadingDates || loadingCourtOptions || loadingSearch}
                >
                  {loadingCourtOptions ? 'Loading...' : 'Next'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (activeBench) {
                      void loadDates(activeBench);
                    }
                  }}
                  className="rounded-lg border border-slate-400/40 px-4 py-2 text-sm font-semibold text-slate-100 hover:border-slate-300/80"
                  disabled={loadingDates}
                >
                  Refresh Dates
                </button>
              </div>

              {searchType === 'court' && courtOptions.length > 0 && (
                <div className="mt-5 rounded-xl border border-slate-500/30 bg-slate-950/40 p-4">
                  <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-200">
                    Court Number
                  </label>
                  <div className="mt-2 flex flex-col gap-3 sm:flex-row">
                    <select
                      value={selectedCourtNo}
                      onChange={(e) => setSelectedCourtNo(e.target.value)}
                      className="w-full rounded-lg border border-slate-500/40 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-300"
                    >
                      {courtOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleCourtSearch}
                      className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-400 disabled:opacity-60"
                      disabled={loadingSearch}
                    >
                      {loadingSearch ? 'Searching...' : 'Search'}
                    </button>
                  </div>

                  {courtResult && (
                    <div className="mt-4 rounded-lg border border-slate-500/30 bg-slate-900/55 p-3">
                      <p className="text-xs text-slate-300">
                        {courtResult.listTypeLabel} | {courtResult.courtLabel} |{' '}
                        {courtResult.listDate}
                      </p>
                      {courtResult.links.length > 0 && (
                        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                          <select
                            value={selectedPdfUrl}
                            onChange={(e) => setSelectedPdfUrl(e.target.value)}
                            className="w-full rounded-lg border border-slate-500/40 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-300"
                          >
                            {courtResult.links.map((link) => (
                              <option key={link.url} value={link.url}>
                                {link.label}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={handleDownloadCourtPdf}
                            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
                            disabled={downloadingPdf}
                          >
                            {downloadingPdf ? 'Downloading...' : 'Download PDF'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {searchType === 'counsel' && (
                <div className="mt-5 rounded-xl border border-slate-500/30 bg-slate-950/40 p-4">
                  <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-200">
                    Counsel Name
                  </label>
                  <div className="mt-2 flex flex-col gap-3 sm:flex-row">
                    <input
                      value={counselName}
                      onChange={(e) => setCounselName(e.target.value)}
                      placeholder="Enter counsel name (e.g. Amit Kumar)"
                      className="w-full rounded-lg border border-slate-500/40 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-400 focus:border-cyan-300"
                    />
                    <button
                      type="button"
                      onClick={handleCounselSearch}
                      className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-400 disabled:opacity-60"
                      disabled={loadingSearch}
                    >
                      {loadingSearch ? 'Searching...' : 'Search'}
                    </button>
                  </div>

                  {counselResult && (
                    <div className="mt-4 rounded-lg border border-slate-500/30 bg-slate-900/55 p-3">
                      <p className="text-xs text-slate-300">
                        {counselResult.listTypeLabel} | {counselResult.listDate} | Rows:{' '}
                        {counselResult.totalRows}
                      </p>
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={handleDownloadCounselExcel}
                          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
                        >
                          Download Excel
                        </button>
                      </div>

                      {counselResult.previewRows.length > 0 && (
                        <div className="mt-4 overflow-auto rounded-lg border border-slate-600/40">
                          <table className="min-w-full text-left text-xs text-slate-200">
                            <thead className="bg-slate-800/90">
                              <tr>
                                {previewColumns.map((column) => (
                                  <th key={column} className="px-2 py-2 font-semibold">
                                    {column}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {counselResult.previewRows.map((row, idx) => (
                                <tr key={`${idx}-${row.case_no || row.sr_no || 'row'}`} className="border-t border-slate-700/50">
                                  {previewColumns.map((column) => (
                                    <td key={column} className="px-2 py-2 align-top">
                                      {row[column] == null ? '' : String(row[column])}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTile === 'mediation' && (
            <div className="mx-auto mt-8 max-w-3xl rounded-2xl border border-white/15 bg-slate-900/45 p-5 text-center text-sm text-slate-300">
              Mediation Causelist flow will be added next.
            </div>
          )}

          {(error || info) && (
            <div className="mx-auto mt-6 max-w-3xl space-y-2">
              {error && (
                <div className="rounded-lg border border-red-400/40 bg-red-900/25 px-3 py-2 text-sm text-red-200">
                  {error}
                </div>
              )}
              {info && (
                <div className="rounded-lg border border-cyan-400/30 bg-cyan-900/25 px-3 py-2 text-sm text-cyan-100">
                  {info}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
