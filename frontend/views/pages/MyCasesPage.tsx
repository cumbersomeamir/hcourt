'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Cinzel, Manrope } from 'next/font/google';
import { CourtCase, Notification } from '@/types/court';
import NotificationsPanel from '@/views/components/NotificationsPanel';
import WorkspaceNavigation from '@/views/components/WorkspaceNavigation';
import {
  buildSavedCaseProfiles,
  encodeCaseProfileSlug,
  formatBenchLabel,
  getTrackedOrderDisplay,
  loadTrackedState,
  SavedCaseProfile,
} from '@/lib/caseProfiles';

const cinzel = Cinzel({
  subsets: ['latin'],
  weight: ['600', '700'],
});

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
});

type ScheduleMap = Record<string, CourtCase>;

function formatTimestamp(value?: Date | string | null) {
  if (!value) return 'No recent updates';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return 'No recent updates';
  return date.toLocaleString();
}

function getPrimaryLabel(profile: SavedCaseProfile, currentCourt?: CourtCase) {
  if (currentCourt?.caseDetails?.title) return currentCourt.caseDetails.title;
  if (profile.canonicalCaseId) return profile.canonicalCaseId;
  if (profile.orderTrackers[0]) return getTrackedOrderDisplay(profile.orderTrackers[0]);
  return 'Saved case';
}

function getSecondaryLabel(profile: SavedCaseProfile, currentCourt?: CourtCase) {
  if (currentCourt?.caseDetails?.title && profile.canonicalCaseId) {
    return profile.canonicalCaseId;
  }
  if (profile.orderTrackers[0]) return getTrackedOrderDisplay(profile.orderTrackers[0]);
  return profile.effectiveCaseIds[0] || 'No identifiers available';
}

function getBenchSummary(profile: SavedCaseProfile, currentCourt?: CourtCase) {
  const benches = new Set<string>();
  if (currentCourt) benches.add('Lucknow live board');
  for (const trackedCase of profile.orderTrackers) {
    benches.add(formatBenchLabel(trackedCase.city));
  }
  if (benches.size === 0) {
    return 'Saved locally';
  }
  return Array.from(benches).join(' • ');
}

export default function MyCasesPage() {
  const [profiles, setProfiles] = useState<SavedCaseProfile[]>([]);
  const [scheduleMap, setScheduleMap] = useState<ScheduleMap>({});
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [hasAccount, setHasAccount] = useState(false);
  const [accountEmail, setAccountEmail] = useState('');
  const [scheduleUpdatedAt, setScheduleUpdatedAt] = useState<string>('');
  const [trackedCaseIds, setTrackedCaseIds] = useState<string[]>([]);
  const [trackedOrderTrackingKeys, setTrackedOrderTrackingKeys] = useState<string[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    const loadPage = async () => {
      try {
        setLoading(true);
        setError('');

        const trackedState = await loadTrackedState();
        if (!mounted) return;

        setHasAccount(trackedState.hasAccount);
        setAccountEmail(trackedState.accountEmail);
        setTrackedCaseIds(trackedState.caseIds);
        setTrackedOrderTrackingKeys(
          trackedState.trackedOrderCases.map((trackedCase) => trackedCase.trackingKey)
        );
        setUserId(trackedState.userId);

        const nextProfiles = buildSavedCaseProfiles(
          trackedState.caseIds,
          trackedState.trackedOrderCases
        );
        setProfiles(nextProfiles);

        const effectiveCaseIds = Array.from(
          new Set(nextProfiles.flatMap((profile) => profile.effectiveCaseIds))
        );
        const orderTrackingKeys = Array.from(
          new Set(nextProfiles.flatMap((profile) => profile.orderTrackingKeys))
        );

        if (effectiveCaseIds.length > 0) {
          const scheduleResponse = await fetch(
            `/api/schedule/latest?caseIds=${encodeURIComponent(effectiveCaseIds.join(','))}`
          );
          const scheduleData = await scheduleResponse.json();
          if (mounted && scheduleData.success && scheduleData.schedule) {
            const nextScheduleMap: ScheduleMap = {};
            for (const court of scheduleData.schedule.courts || []) {
              const caseNumber = court.caseDetails?.caseNumber?.toUpperCase();
              if (caseNumber) {
                nextScheduleMap[caseNumber] = court;
              }
            }
            setScheduleMap(nextScheduleMap);
            setScheduleUpdatedAt(String(scheduleData.schedule.lastUpdated || ''));
          }
        } else if (mounted) {
          setScheduleMap({});
          setScheduleUpdatedAt('');
        }

        if (effectiveCaseIds.length > 0 || orderTrackingKeys.length > 0) {
          const params = new URLSearchParams();
          params.append('limit', '100');
          if (effectiveCaseIds.length > 0) {
            params.append('caseIds', effectiveCaseIds.join(','));
          }
          if (orderTrackingKeys.length > 0) {
            params.append('orderTrackingKeys', orderTrackingKeys.join(','));
          }
          const notificationsResponse = await fetch(`/api/notifications?${params.toString()}`);
          const notificationsData = await notificationsResponse.json();
          if (mounted && notificationsData.success) {
            setNotifications(notificationsData.notifications || []);
          }
        } else if (mounted) {
          setNotifications([]);
        }
      } catch (loadError) {
        if (mounted) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load cases');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadPage();

    return () => {
      mounted = false;
    };
  }, []);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.read).length,
    [notifications]
  );
  const liveBoardCount = useMemo(
    () =>
      profiles.filter((profile) =>
        profile.effectiveCaseIds.some((caseId) => Boolean(scheduleMap[caseId]))
      ).length,
    [profiles, scheduleMap]
  );

  return (
    <div className={`min-h-screen ${manrope.className}`}>
      <NotificationsPanel
        isOpen={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        trackedCaseIds={trackedCaseIds}
        trackedOrderTrackingKeys={trackedOrderTrackingKeys}
        userId={userId}
      />

      <div className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 sm:pb-20 sm:pt-10">
        <div className="mb-6 flex justify-end lg:relative lg:overflow-hidden lg:rounded-[32px] lg:border lg:border-white/10 lg:bg-[#0b1224]/90 lg:p-5 lg:shadow-[0_28px_70px_rgba(2,6,23,0.35)]">
          <div className="pointer-events-none absolute inset-0 hidden lg:block bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.12),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(34,211,238,0.10),transparent_30%)]" />
          <div className="pointer-events-none absolute inset-x-6 top-0 hidden lg:block h-px bg-gradient-to-r from-transparent via-white/12 to-transparent" />
          <div className="relative">
            <WorkspaceNavigation
              current="my-cases"
              alertsCount={unreadCount}
              onAlertsClick={() => setNotificationsOpen(true)}
            />
          </div>
        </div>

        <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full border border-slate-700/40 bg-slate-950/35 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300 transition-colors hover:bg-slate-900/70"
            >
              <span aria-hidden="true">←</span>
              Dashboard
            </Link>
            <p className="mt-4 text-xs uppercase tracking-[0.28em] text-cyan-300/75">
              Case Workspace
            </p>
            <h1
              className={`mt-3 text-3xl font-semibold tracking-wide text-slate-100 sm:text-4xl ${cinzel.className}`}
            >
              My Cases
            </h1>
            <p className="mt-3 max-w-3xl text-sm text-slate-300 sm:text-base">
              A case-centric view of the matters already saved in tracking, with live board context
              and direct access to each case profile.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/track-cases"
              className="inline-flex items-center justify-center rounded-2xl border border-emerald-400/25 bg-emerald-500/15 px-5 py-3 text-sm font-semibold text-emerald-100 transition-colors hover:bg-emerald-500/25"
            >
              Manage Tracking
            </Link>
          </div>
        </div>

        <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-3xl border border-cyan-400/20 bg-cyan-500/10 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <p className="text-[11px] uppercase tracking-[0.24em] text-cyan-200/70">
              Saved Cases
            </p>
            <p className="mt-3 text-3xl font-semibold text-cyan-100">{profiles.length}</p>
            <p className="mt-2 text-sm text-cyan-100/70">Built from your current tracking list.</p>
          </div>

          <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <p className="text-[11px] uppercase tracking-[0.24em] text-emerald-200/70">
              On Live Board
            </p>
            <p className="mt-3 text-3xl font-semibold text-emerald-100">{liveBoardCount}</p>
            <p className="mt-2 text-sm text-emerald-100/70">
              Cases currently matched on the latest Lucknow court board.
            </p>
          </div>

          <div className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <p className="text-[11px] uppercase tracking-[0.24em] text-amber-200/70">
              Recent Alerts
            </p>
            <p className="mt-3 text-3xl font-semibold text-amber-100">{notifications.length}</p>
            <p className="mt-2 text-sm text-amber-100/70">
              {unreadCount} unread in the latest fetched activity set.
            </p>
          </div>

          <div className="rounded-3xl border border-slate-700/40 bg-slate-950/40 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Sync Mode</p>
            <p className="mt-3 text-lg font-semibold text-slate-100">
              {hasAccount ? accountEmail || 'Synced account' : 'Local only'}
            </p>
            <p className="mt-2 text-sm text-slate-400">
              {scheduleUpdatedAt
                ? `Board snapshot: ${formatTimestamp(scheduleUpdatedAt)}`
                : 'Board snapshot will appear when a saved case matches the live board.'}
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="glass-card-lg p-12 text-center text-sm text-slate-400">
            Loading saved cases...
          </div>
        ) : profiles.length === 0 ? (
          <div className="glass-card-lg p-10 sm:p-12">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs uppercase tracking-[0.28em] text-slate-500">No Cases Yet</p>
              <h2 className="mt-3 text-2xl font-semibold text-slate-100">
                Your case workspace is empty
              </h2>
              <p className="mt-3 text-sm text-slate-400 sm:text-base">
                Start by adding cases in tracking. Once they are saved, they will appear here as
                case profiles.
              </p>
              <Link
                href="/track-cases"
                className="mt-6 inline-flex items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-500/15 px-6 py-3 text-sm font-semibold text-cyan-100 transition-colors hover:bg-cyan-500/25"
              >
                Open Track Cases
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.8fr)]">
            <div className="grid gap-5 md:grid-cols-2">
              {profiles.map((profile) => {
                const currentCourt = profile.effectiveCaseIds
                  .map((caseId) => scheduleMap[caseId])
                  .find(Boolean);
                const primaryLabel = getPrimaryLabel(profile, currentCourt);
                const secondaryLabel = getSecondaryLabel(profile, currentCourt);

                return (
                  <div
                    key={profile.profileId}
                    className="glass-card-lg overflow-hidden border border-slate-700/35"
                  >
                    <div className="border-b border-slate-700/30 px-5 py-4">
                      <div className="flex flex-wrap gap-2">
                        {profile.hasScheduleTracking && (
                          <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/80">
                            Live Board
                          </span>
                        )}
                        {profile.hasOrderTracking && (
                          <span className="rounded-full border border-indigo-400/20 bg-indigo-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-indigo-100/80">
                            Orders / Judgments
                          </span>
                        )}
                        {currentCourt && (
                          <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-100/80">
                            Live now
                          </span>
                        )}
                      </div>
                      <h2 className="mt-4 text-xl font-semibold text-slate-100">{primaryLabel}</h2>
                      <p className="mt-2 text-sm text-slate-400">{secondaryLabel}</p>
                    </div>

                    <div className="space-y-4 px-5 py-5">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl border border-slate-700/35 bg-slate-950/40 p-4">
                          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                            Sources
                          </p>
                          <p className="mt-2 text-sm font-semibold text-slate-100">
                            {getBenchSummary(profile, currentCourt)}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-slate-700/35 bg-slate-950/40 p-4">
                          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                            Tracking
                          </p>
                          <p className="mt-2 text-sm font-semibold text-slate-100">
                            {profile.explicitCaseIds.length} case ID watcher
                            {profile.explicitCaseIds.length === 1 ? '' : 's'}
                            {' • '}
                            {profile.orderTrackers.length} order watcher
                            {profile.orderTrackers.length === 1 ? '' : 's'}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-700/35 bg-slate-950/40 p-4">
                        <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                          Live board snapshot
                        </p>
                        {currentCourt ? (
                          <div className="mt-3 space-y-2 text-sm text-slate-300">
                            <p>
                              Court {currentCourt.courtNo}
                              {currentCourt.serialNo ? ` • Serial ${currentCourt.serialNo}` : ''}
                            </p>
                            <p>{currentCourt.progress || 'No progress text available yet.'}</p>
                          </div>
                        ) : (
                          <p className="mt-3 text-sm text-slate-500">
                            Not currently visible on the latest live board snapshot.
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-3">
                        <Link
                          href={`/my-cases/${encodeCaseProfileSlug(profile.profileId)}`}
                          className="inline-flex items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-500/15 px-5 py-3 text-sm font-semibold text-cyan-100 transition-colors hover:bg-cyan-500/25"
                        >
                          View Profile
                        </Link>
                        <Link
                          href="/track-cases"
                          className="inline-flex items-center justify-center rounded-2xl border border-slate-600/30 bg-slate-900/40 px-5 py-3 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-800/65"
                        >
                          Manage Tracking
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <aside className="space-y-5">
              <div className="glass-card-lg p-5 sm:p-6">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                Workspace Notes
              </p>
              <div className="mt-4 space-y-4 text-sm leading-6 text-slate-400">
                <p>
                  My Cases is built from the identifiers already saved in tracking. It does not
                  create a new source of truth.
                </p>
                <p>
                  A case profile combines schedule-facing identifiers and order/judgment watchers
                  into one case-centric view.
                </p>
              </div>
            </div>

              <div className="glass-card-lg p-5 sm:p-6">
                <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                  Coverage
                </p>
                <div className="mt-4 space-y-3">
                  <div className="rounded-2xl border border-cyan-400/15 bg-cyan-500/10 p-4">
                    <p className="text-sm font-semibold text-cyan-100">Schedule-linked cases</p>
                    <p className="mt-1 text-sm text-cyan-100/70">
                      {profiles.filter((profile) => profile.hasScheduleTracking).length} cases have
                      live board coverage.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-indigo-400/15 bg-indigo-500/10 p-4">
                    <p className="text-sm font-semibold text-indigo-100">Order-linked cases</p>
                    <p className="mt-1 text-sm text-indigo-100/70">
                      {profiles.filter((profile) => profile.hasOrderTracking).length} cases have
                      order or judgment watchers.
                    </p>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
