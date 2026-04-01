'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Cinzel, Manrope } from 'next/font/google';
import { TrackedOrderCase } from '@/types/court';
import WorkspaceNavigation from '@/views/components/WorkspaceNavigation';

const cinzel = Cinzel({
  subsets: ['latin'],
  weight: ['600', '700'],
});

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
});

type CaseTypeOption = { value: string; label: string };

type OrderCaseForm = {
  caseType: string;
  caseNo: string;
  caseYear: string;
};

function buildOrderTrackingKey(params: {
  city: string;
  caseType: string;
  caseNo: string;
  caseYear: string;
}) {
  return `${params.city}|${params.caseType}|${params.caseNo}|${params.caseYear}`;
}

function normalizeTrackedOrderCases(trackedCases: unknown): TrackedOrderCase[] {
  if (!Array.isArray(trackedCases)) return [];
  const byKey = new Map<string, TrackedOrderCase>();
  for (const item of trackedCases) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Record<string, unknown>;
    const city =
      String(raw.city || 'lucknow').toLowerCase() === 'allahabad' ? 'allahabad' : 'lucknow';
    const caseType = String(raw.caseType || '').trim();
    const caseNo = String(raw.caseNo || '').trim();
    const caseYear = String(raw.caseYear || '').trim();
    const caseTypeLabel = String(raw.caseTypeLabel || '').trim();
    if (!caseType || !/^\d+$/.test(caseNo) || !/^\d{4}$/.test(caseYear)) continue;
    const trackingKey =
      String(raw.trackingKey || '').trim() ||
      buildOrderTrackingKey({ city, caseType, caseNo, caseYear });
    byKey.set(trackingKey, {
      city,
      caseType,
      caseTypeLabel: caseTypeLabel || undefined,
      caseNo,
      caseYear,
      trackingKey,
    });
  }
  return Array.from(byKey.values());
}

function validateCaseId(caseId: string): boolean {
  const pattern = /^[A-Z]+\/[0-9]+\/[0-9]+$/i;
  return pattern.test(caseId.trim());
}

export default function TrackCasesPage() {
  const [caseIds, setCaseIds] = useState<string[]>([]);
  const [trackedOrderCases, setTrackedOrderCases] = useState<TrackedOrderCase[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState('');
  const [hasAccount, setHasAccount] = useState(false);
  const [accountEmail, setAccountEmail] = useState('');
  const [caseTypeOptions, setCaseTypeOptions] = useState<CaseTypeOption[]>([]);
  const [caseTypeLoading, setCaseTypeLoading] = useState(false);
  const [orderCaseForm, setOrderCaseForm] = useState<OrderCaseForm>({
    caseType: '',
    caseNo: '',
    caseYear: new Date().getFullYear().toString(),
  });

  useEffect(() => {
    let mounted = true;

    const loadPage = async () => {
      try {
        const storedCaseIds = localStorage.getItem('trackedCaseIds');
        const storedTrackedOrderCases = localStorage.getItem('trackedOrderCases');
        const storedUserId = localStorage.getItem('userId');
        const storedUserEmail = localStorage.getItem('userEmail');

        setHasAccount(Boolean(storedUserId));

        if (storedCaseIds) {
          try {
            setCaseIds(JSON.parse(storedCaseIds));
          } catch (loadError) {
            console.error('Error parsing tracked case IDs:', loadError);
          }
        }

        if (storedTrackedOrderCases) {
          try {
            setTrackedOrderCases(normalizeTrackedOrderCases(JSON.parse(storedTrackedOrderCases)));
          } catch (loadError) {
            console.error('Error parsing tracked order cases:', loadError);
          }
        }

        if (storedUserEmail) {
          setAccountEmail(storedUserEmail);
        }

        setCaseTypeLoading(true);
        const typeResponse = await fetch('/api/orders/case-types?city=lucknow');
        const typeData = await typeResponse.json();
        if (mounted && typeData.success && Array.isArray(typeData.types)) {
          setCaseTypeOptions(typeData.types);
          setOrderCaseForm((prev) =>
            prev.caseType || typeData.types.length === 0
              ? prev
              : { ...prev, caseType: typeData.types[0].value }
          );
        }

        if (!storedUserId) return;

        const response = await fetch(`/api/users?userId=${storedUserId}`);
        const data = await response.json();
        if (!mounted || !data.success || !data.user) return;

        const userCaseIds = Array.isArray(data.user.caseIds) ? data.user.caseIds : [];
        const userTrackedOrderCases = normalizeTrackedOrderCases(data.user.trackedOrderCases);

        setCaseIds(userCaseIds);
        setTrackedOrderCases(userTrackedOrderCases);
        setAccountEmail(data.user.email || storedUserEmail || '');
        localStorage.setItem('trackedCaseIds', JSON.stringify(userCaseIds));
        localStorage.setItem('trackedOrderCases', JSON.stringify(userTrackedOrderCases));
      } catch (loadError) {
        console.error('Error loading track cases page:', loadError);
      } finally {
        if (mounted) {
          setCaseTypeLoading(false);
        }
      }
    };

    loadPage();

    return () => {
      mounted = false;
    };
  }, []);

  const totalTracked = caseIds.length + trackedOrderCases.length;
  const accountCaption = useMemo(() => {
    if (!hasAccount) return 'Saved on this device only';
    return accountEmail ? `Synced as ${accountEmail}` : 'Synced across devices';
  }, [accountEmail, hasAccount]);

  const persistTracking = async (
    nextCaseIds: string[],
    nextTrackedOrderCases: TrackedOrderCase[]
  ) => {
    localStorage.setItem('trackedCaseIds', JSON.stringify(nextCaseIds));
    localStorage.setItem('trackedOrderCases', JSON.stringify(nextTrackedOrderCases));

    const existingUserId = localStorage.getItem('userId');
    if (!existingUserId) return;

    try {
      await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: existingUserId,
          caseIds: nextCaseIds,
          trackedOrderCases: nextTrackedOrderCases,
        }),
      });
    } catch {
      // Keep local settings even if account sync fails.
    }
  };

  const handleAddCaseId = async () => {
    const trimmed = inputValue.trim();
    if (!trimmed) {
      setError('Please enter a case ID');
      return;
    }

    if (!validateCaseId(trimmed)) {
      setError('Invalid case ID format. Example: WRIC/11985/2025');
      return;
    }

    const normalized = trimmed.toUpperCase();
    if (caseIds.includes(normalized)) {
      setError('This case ID is already added');
      return;
    }

    const nextCaseIds = [...caseIds, normalized];
    setCaseIds(nextCaseIds);
    setInputValue('');
    setError('');
    await persistTracking(nextCaseIds, trackedOrderCases);
  };

  const handleAddOrderCase = async () => {
    const city = 'lucknow' as const;
    const caseType = orderCaseForm.caseType.trim();
    const caseNo = orderCaseForm.caseNo.trim();
    const caseYear = orderCaseForm.caseYear.trim();

    if (!caseType || !/^\d+$/.test(caseNo) || !/^\d{4}$/.test(caseYear)) {
      setError('Order tracking needs Case Type, numeric Case No, and 4-digit Case Year');
      return;
    }

    const caseTypeLabel =
      caseTypeOptions.find((option) => option.value === caseType)?.label || caseType;
    const trackingKey = buildOrderTrackingKey({ city, caseType, caseNo, caseYear });

    if (trackedOrderCases.some((trackedCase) => trackedCase.trackingKey === trackingKey)) {
      setError('This order-tracking case is already added');
      return;
    }

    const nextTrackedOrderCases = [
      ...trackedOrderCases,
      {
        city,
        caseType,
        caseTypeLabel,
        caseNo,
        caseYear,
        trackingKey,
      },
    ];

    setTrackedOrderCases(nextTrackedOrderCases);
    setOrderCaseForm((prev) => ({ ...prev, caseNo: '' }));
    setError('');
    await persistTracking(caseIds, nextTrackedOrderCases);
  };

  const handleRemoveCaseId = async (index: number) => {
    const nextCaseIds = caseIds.filter((_, itemIndex) => itemIndex !== index);
    setCaseIds(nextCaseIds);
    setError('');
    await persistTracking(nextCaseIds, trackedOrderCases);
  };

  const handleRemoveOrderCase = async (trackingKey: string) => {
    const nextTrackedOrderCases = trackedOrderCases.filter(
      (trackedCase) => trackedCase.trackingKey !== trackingKey
    );
    setTrackedOrderCases(nextTrackedOrderCases);
    setError('');
    await persistTracking(caseIds, nextTrackedOrderCases);
  };

  return (
    <div className={`min-h-screen ${manrope.className}`}>
      <div className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 sm:pb-20 sm:pt-10">
        <div className="mb-6 flex justify-end">
          <WorkspaceNavigation current="track-cases" />
        </div>

        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full border border-slate-700/40 bg-slate-950/35 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300 transition-colors hover:bg-slate-900/70"
            >
              <span aria-hidden="true">←</span>
              Dashboard
            </Link>
            <p className="mt-4 text-xs uppercase tracking-[0.28em] text-emerald-300/75">
              Tracking Workspace
            </p>
            <h1
              className={`mt-3 text-3xl font-semibold tracking-wide text-slate-100 sm:text-4xl ${cinzel.className}`}
            >
              Track Your Cases
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-slate-300 sm:text-base">
              Manage schedule watchlists and order monitoring in one place.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:min-w-[320px]">
            <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <p className="text-[11px] uppercase tracking-[0.24em] text-emerald-200/70">
                Tracked Items
              </p>
              <p className="mt-2 text-3xl font-semibold text-emerald-100">{totalTracked}</p>
              <p className="mt-1 text-sm text-emerald-100/75">
                {caseIds.length} schedule case IDs and {trackedOrderCases.length} order watchers
              </p>
            </div>
            <div className="rounded-3xl border border-slate-700/40 bg-slate-950/40 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">
                Storage
              </p>
              <p className="mt-2 text-base font-semibold text-slate-100">{accountCaption}</p>
              <p className="mt-1 text-sm text-slate-400">
                Changes save automatically when you add or remove tracked cases.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.85fr)]">
          <div className="glass-card-lg overflow-hidden">
            <div className="border-b border-slate-700/30 px-5 py-5 sm:px-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="max-w-2xl">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                    Watchlist Setup
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-slate-100 sm:text-2xl">
                    Add or update the cases you want monitored
                  </h2>
                  <p className="mt-2 text-sm text-slate-400">
                    Schedule tracking filters the live court board. Order tracking watches for new
                    order or judgment entries for the case you save.
                  </p>
                </div>
                <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100/85">
                  Changes save automatically as you add or remove tracked cases.
                </div>
              </div>
            </div>

            <div className="space-y-6 px-5 py-5 sm:px-8 sm:py-8">
              <section className="rounded-3xl border border-slate-700/35 bg-slate-950/35 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="max-w-xl">
                    <p className="text-[11px] uppercase tracking-[0.24em] text-cyan-300/75">
                      Schedule Tracking
                    </p>
                    <h3 className="mt-2 text-lg font-semibold text-slate-100">
                      Track by Case ID
                    </h3>
                    <p className="mt-2 text-sm text-slate-400">
                      Use the exact court case identifier, such as{' '}
                      <span className="font-mono text-slate-300">WRIC/11985/2025</span>.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-cyan-400/15 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100/75">
                    {caseIds.length} schedule watcher{caseIds.length === 1 ? '' : 's'}
                  </div>
                </div>

                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(event) => {
                      setInputValue(event.target.value);
                      setError('');
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        void handleAddCaseId();
                      }
                    }}
                    placeholder="e.g. WRIC/11985/2025"
                    className="flex-1 rounded-2xl border border-slate-600/25 bg-slate-900/60 px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/15 focus:outline-none"
                  />
                  <button
                    onClick={() => void handleAddCaseId()}
                    className="inline-flex items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-500/15 px-5 py-3 text-sm font-semibold text-cyan-100 transition-colors hover:bg-cyan-500/25"
                  >
                    Add Case ID
                  </button>
                </div>

                <div className="mt-5">
                  {caseIds.length > 0 ? (
                    <div className="flex flex-wrap gap-3">
                      {caseIds.map((caseId, index) => (
                        <div
                          key={`${caseId}-${index}`}
                          className="flex items-center gap-3 rounded-2xl border border-slate-700/35 bg-slate-900/65 px-4 py-3"
                        >
                          <span className="font-mono text-sm text-slate-100">{caseId}</span>
                          <button
                            onClick={() => void handleRemoveCaseId(index)}
                            className="rounded-full border border-red-400/25 bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-300 transition-colors hover:bg-red-500/20"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-700/45 bg-slate-900/25 px-4 py-5 text-sm text-slate-500">
                      No schedule case IDs added yet.
                    </div>
                  )}
                </div>
              </section>

              <section className="rounded-3xl border border-slate-700/35 bg-slate-950/35 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="max-w-xl">
                    <p className="text-[11px] uppercase tracking-[0.24em] text-indigo-300/75">
                      Order / Judgment Tracking
                    </p>
                    <h3 className="mt-2 text-lg font-semibold text-slate-100">
                      Track by Case Type, Number, and Year
                    </h3>
                    <p className="mt-2 text-sm text-slate-400">
                      Save a case watcher for order and judgment updates. This watches new entries
                      in the orders stream, not the live court board.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-indigo-400/15 bg-indigo-500/10 px-4 py-3 text-sm text-indigo-100/75">
                    {trackedOrderCases.length} order watcher{trackedOrderCases.length === 1 ? '' : 's'}
                  </div>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  <select
                    value={orderCaseForm.caseType}
                    onChange={(event) =>
                      setOrderCaseForm((prev) => ({ ...prev, caseType: event.target.value }))
                    }
                    disabled={caseTypeLoading}
                    className="rounded-2xl border border-slate-600/25 bg-slate-900/60 px-4 py-3 text-sm text-slate-100 focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/15 focus:outline-none disabled:opacity-50"
                  >
                    <option value="">
                      {caseTypeLoading ? 'Loading case types...' : 'Select case type'}
                    </option>
                    {caseTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>

                  <input
                    type="text"
                    value={orderCaseForm.caseNo}
                    onChange={(event) =>
                      setOrderCaseForm((prev) => ({
                        ...prev,
                        caseNo: event.target.value.replace(/[^0-9]/g, ''),
                      }))
                    }
                    placeholder="Case no"
                    className="rounded-2xl border border-slate-600/25 bg-slate-900/60 px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/15 focus:outline-none"
                  />

                  <input
                    type="text"
                    value={orderCaseForm.caseYear}
                    onChange={(event) =>
                      setOrderCaseForm((prev) => ({
                        ...prev,
                        caseYear: event.target.value.replace(/[^0-9]/g, '').slice(0, 4),
                      }))
                    }
                    placeholder="Case year"
                    className="rounded-2xl border border-slate-600/25 bg-slate-900/60 px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/15 focus:outline-none"
                  />
                </div>

                <div className="mt-4">
                  <button
                    onClick={() => void handleAddOrderCase()}
                    className="inline-flex items-center justify-center rounded-2xl border border-indigo-400/25 bg-indigo-500/15 px-5 py-3 text-sm font-semibold text-indigo-100 transition-colors hover:bg-indigo-500/25"
                  >
                    Add Order Tracking
                  </button>
                </div>

                <div className="mt-5">
                  {trackedOrderCases.length > 0 ? (
                    <div className="space-y-3">
                      {trackedOrderCases.map((trackedCase) => (
                        <div
                          key={trackedCase.trackingKey}
                          className="flex flex-col gap-3 rounded-2xl border border-slate-700/35 bg-slate-900/65 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div>
                            <p className="text-sm font-semibold text-slate-100">
                              {trackedCase.caseTypeLabel || trackedCase.caseType}
                            </p>
                            <p className="mt-1 text-sm text-slate-400">
                              Case {trackedCase.caseNo}/{trackedCase.caseYear}
                            </p>
                          </div>
                          <button
                            onClick={() => void handleRemoveOrderCase(trackedCase.trackingKey)}
                            className="inline-flex items-center justify-center rounded-full border border-red-400/25 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-300 transition-colors hover:bg-red-500/20"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-700/45 bg-slate-900/25 px-4 py-5 text-sm text-slate-500">
                      No order or judgment watchers added yet.
                    </div>
                  )}
                </div>
              </section>

              {error && (
                <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  {error}
                </div>
              )}
            </div>
          </div>

          <aside className="space-y-6">
            <div className="glass-card-lg p-5 sm:p-6">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                Tracking Modes
              </p>
              <div className="mt-4 space-y-4">
                <div className="rounded-2xl border border-cyan-400/15 bg-cyan-500/10 p-4">
                  <h4 className="text-sm font-semibold text-cyan-100">Schedule Tracking</h4>
                  <p className="mt-2 text-sm leading-6 text-cyan-100/75">
                    Filters the live court schedule around the case IDs you save and drives
                    schedule-related alerts for those entries.
                  </p>
                </div>
                <div className="rounded-2xl border border-indigo-400/15 bg-indigo-500/10 p-4">
                  <h4 className="text-sm font-semibold text-indigo-100">Order / Judgment Tracking</h4>
                  <p className="mt-2 text-sm leading-6 text-indigo-100/75">
                    Watches the orders feed for new entries tied to the saved case type, number,
                    and year combination.
                  </p>
                </div>
              </div>
            </div>

            <div className="glass-card-lg p-5 sm:p-6">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                Current Status
              </p>
              <div className="mt-4 space-y-3">
                <div className="rounded-2xl border border-slate-700/35 bg-slate-950/40 p-4">
                  <p className="text-sm font-semibold text-slate-100">Case IDs</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-100">{caseIds.length}</p>
                </div>
                <div className="rounded-2xl border border-slate-700/35 bg-slate-950/40 p-4">
                  <p className="text-sm font-semibold text-slate-100">Order watchers</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-100">
                    {trackedOrderCases.length}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-700/35 bg-slate-950/40 p-4">
                  <p className="text-sm font-semibold text-slate-100">Save mode</p>
                  <p className="mt-1 text-sm text-slate-400">
                    {hasAccount
                      ? 'Changes auto-update the linked synced account.'
                      : 'Changes auto-save in local browser storage.'}
                  </p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
