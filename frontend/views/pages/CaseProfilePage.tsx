'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Cinzel, Manrope } from 'next/font/google';
import { CourtCase, Notification } from '@/types/court';
import NotificationsPanel from '@/views/components/NotificationsPanel';
import WorkspaceNavigation from '@/views/components/WorkspaceNavigation';
import {
  buildSavedCaseProfiles,
  decodeCaseProfileSlug,
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

type CaseProfilePageProps = {
  caseSlug: string;
};

function formatTimestamp(value?: Date | string | null) {
  if (!value) return 'No recent activity';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return 'No recent activity';
  return date.toLocaleString();
}

function getPrimaryTitle(profile: SavedCaseProfile | null, currentCourt: CourtCase | null) {
  if (currentCourt?.caseDetails?.title) return currentCourt.caseDetails.title;
  if (profile?.canonicalCaseId) return profile.canonicalCaseId;
  if (profile?.orderTrackers[0]) return getTrackedOrderDisplay(profile.orderTrackers[0]);
  return 'Case Profile';
}

function getBenchSummary(profile: SavedCaseProfile, currentCourt: CourtCase | null) {
  const benches = new Set<string>();
  if (currentCourt) benches.add('Lucknow live board');
  for (const trackedCase of profile.orderTrackers) {
    benches.add(formatBenchLabel(trackedCase.city));
  }
  if (benches.size === 0) {
    return 'No bench hints available yet';
  }
  return Array.from(benches).join(' • ');
}

export default function CaseProfilePage({ caseSlug }: CaseProfilePageProps) {
  const [profile, setProfile] = useState<SavedCaseProfile | null>(null);
  const [currentCourt, setCurrentCourt] = useState<CourtCase | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [hasAccount, setHasAccount] = useState(false);
  const [accountEmail, setAccountEmail] = useState('');
  const [scheduleUpdatedAt, setScheduleUpdatedAt] = useState<string>('');
  const [trackedCaseIds, setTrackedCaseIds] = useState<string[]>([]);
  const [trackedOrderTrackingKeys, setTrackedOrderTrackingKeys] = useState<string[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [globalUnreadCount, setGlobalUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const decodedSlug = useMemo(() => decodeCaseProfileSlug(caseSlug), [caseSlug]);

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

        const profiles = buildSavedCaseProfiles(
          trackedState.caseIds,
          trackedState.trackedOrderCases
        );
        const nextProfile = profiles.find((entry) => entry.profileId === decodedSlug) || null;
        setProfile(nextProfile);

        if (!nextProfile) return;

        if (nextProfile.effectiveCaseIds.length > 0) {
          const scheduleResponse = await fetch(
            `/api/schedule/latest?caseIds=${encodeURIComponent(nextProfile.effectiveCaseIds.join(','))}`
          );
          const scheduleData = await scheduleResponse.json();
          if (mounted && scheduleData.success && scheduleData.schedule) {
            const match =
              (scheduleData.schedule.courts || []).find((court: CourtCase) => {
                const caseNumber = court.caseDetails?.caseNumber?.toUpperCase();
                return Boolean(caseNumber && nextProfile.effectiveCaseIds.includes(caseNumber));
              }) || null;
            setCurrentCourt(match);
            setScheduleUpdatedAt(String(scheduleData.schedule.lastUpdated || ''));
          }
        } else if (mounted) {
          setCurrentCourt(null);
          setScheduleUpdatedAt('');
        }

        if (
          nextProfile.effectiveCaseIds.length > 0 ||
          nextProfile.orderTrackingKeys.length > 0
        ) {
          const params = new URLSearchParams();
          params.append('limit', '30');
          if (nextProfile.effectiveCaseIds.length > 0) {
            params.append('caseIds', nextProfile.effectiveCaseIds.join(','));
          }
          if (nextProfile.orderTrackingKeys.length > 0) {
            params.append('orderTrackingKeys', nextProfile.orderTrackingKeys.join(','));
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
          setError(loadError instanceof Error ? loadError.message : 'Failed to load case profile');
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
  }, [decodedSlug]);

  useEffect(() => {
    let mounted = true;

    const loadUnreadCount = async () => {
      if (trackedCaseIds.length === 0 && trackedOrderTrackingKeys.length === 0 && !userId) {
        if (mounted) setGlobalUnreadCount(0);
        return;
      }

      try {
        const params = new URLSearchParams();
        params.append('limit', '100');
        if (trackedCaseIds.length > 0) {
          params.append('caseIds', trackedCaseIds.join(','));
        }
        if (trackedOrderTrackingKeys.length > 0) {
          params.append('orderTrackingKeys', trackedOrderTrackingKeys.join(','));
        }
        if (userId) {
          params.append('userId', userId);
        }

        const response = await fetch(`/api/notifications?${params.toString()}`);
        const data = await response.json();
        if (mounted && data.success) {
          setGlobalUnreadCount(
            (data.notifications || []).filter((notification: Notification) => !notification.read)
              .length
          );
        }
      } catch {
        if (mounted) setGlobalUnreadCount(0);
      }
    };

    loadUnreadCount();

    return () => {
      mounted = false;
    };
  }, [trackedCaseIds, trackedOrderTrackingKeys, userId]);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.read).length,
    [notifications]
  );
  const primaryTitle = getPrimaryTitle(profile, currentCourt);
  const primaryCity = profile?.primaryCity || 'lucknow';

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
              alertsCount={globalUnreadCount}
              onAlertsClick={() => setNotificationsOpen(true)}
            />
          </div>
        </div>

        <div className="mb-8 flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
          <Link
            href="/"
            className="rounded-full border border-slate-700/40 bg-slate-950/35 px-4 py-2 transition-colors hover:bg-slate-900/70"
          >
            Dashboard
          </Link>
          <span>/</span>
          <Link
            href="/my-cases"
            className="rounded-full border border-slate-700/40 bg-slate-950/35 px-4 py-2 transition-colors hover:bg-slate-900/70"
          >
            My Cases
          </Link>
          <span>/</span>
          <span className="text-slate-200">Case Profile</span>
        </div>

        {loading ? (
          <div className="glass-card-lg p-12 text-center text-sm text-slate-400">
            Loading case profile...
          </div>
        ) : !profile ? (
          <div className="glass-card-lg p-10 sm:p-12">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Not Found</p>
              <h1 className={`mt-3 text-3xl font-semibold text-slate-100 ${cinzel.className}`}>
                Case profile unavailable
              </h1>
              <p className="mt-3 text-sm text-slate-400 sm:text-base">
                This case no longer exists in the current saved tracking list.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/my-cases"
                  className="inline-flex items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-500/15 px-6 py-3 text-sm font-semibold text-cyan-100 transition-colors hover:bg-cyan-500/25"
                >
                  Back to My Cases
                </Link>
                <Link
                  href="/track-cases"
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-600/30 bg-slate-900/40 px-6 py-3 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-800/65"
                >
                  Open Track Cases
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-8 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-indigo-300/75">
                  Case Profile
                </p>
                <h1
                  className={`mt-3 text-3xl font-semibold tracking-wide text-slate-100 sm:text-4xl ${cinzel.className}`}
                >
                  {primaryTitle}
                </h1>
                <p className="mt-3 max-w-3xl text-sm text-slate-300 sm:text-base">
                  {profile.canonicalCaseId
                    ? `Primary identifier: ${profile.canonicalCaseId}`
                    : 'Built from saved order or judgment watchers.'}
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link
                  href="/track-cases"
                  className="inline-flex items-center justify-center rounded-2xl border border-emerald-400/25 bg-emerald-500/15 px-5 py-3 text-sm font-semibold text-emerald-100 transition-colors hover:bg-emerald-500/25"
                >
                  Manage Tracking
                </Link>
                <Link
                  href="/my-cases"
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-600/30 bg-slate-900/40 px-5 py-3 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-800/65"
                >
                  Back to My Cases
                </Link>
              </div>
            </div>

            <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-3xl border border-cyan-400/20 bg-cyan-500/10 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <p className="text-[11px] uppercase tracking-[0.24em] text-cyan-200/70">
                  Tracking Modes
                </p>
                <p className="mt-3 text-lg font-semibold text-cyan-100">
                  {profile.hasScheduleTracking ? 'Live Board' : 'No board coverage'}
                  {profile.hasOrderTracking ? ' • Orders' : ''}
                </p>
                <p className="mt-2 text-sm text-cyan-100/70">{getBenchSummary(profile, currentCourt)}</p>
              </div>

              <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <p className="text-[11px] uppercase tracking-[0.24em] text-emerald-200/70">
                  Live Board
                </p>
                <p className="mt-3 text-lg font-semibold text-emerald-100">
                  {currentCourt ? `Court ${currentCourt.courtNo}` : 'Not on board now'}
                </p>
                <p className="mt-2 text-sm text-emerald-100/70">
                  {scheduleUpdatedAt
                    ? `Snapshot: ${formatTimestamp(scheduleUpdatedAt)}`
                    : 'No schedule snapshot available.'}
                </p>
              </div>

              <div className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <p className="text-[11px] uppercase tracking-[0.24em] text-amber-200/70">
                  Activity Feed
                </p>
                <p className="mt-3 text-lg font-semibold text-amber-100">
                  {notifications.length} recent alert{notifications.length === 1 ? '' : 's'}
                </p>
                <p className="mt-2 text-sm text-amber-100/70">{unreadCount} unread</p>
              </div>

              <div className="rounded-3xl border border-slate-700/40 bg-slate-950/40 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Sync Mode</p>
                <p className="mt-3 text-lg font-semibold text-slate-100">
                  {hasAccount ? accountEmail || 'Synced account' : 'Local only'}
                </p>
                <p className="mt-2 text-sm text-slate-400">
                  The profile reflects the existing tracked identifiers already saved by the app.
                </p>
              </div>
            </div>

            {error && (
              <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.85fr)]">
              <div className="space-y-6">
                <section className="glass-card-lg p-5 sm:p-6">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                    Identifiers
                  </p>
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <div className="rounded-2xl border border-slate-700/35 bg-slate-950/40 p-4">
                      <p className="text-sm font-semibold text-slate-100">Schedule-facing IDs</p>
                      <div className="mt-3 space-y-2">
                        {profile.effectiveCaseIds.length > 0 ? (
                          profile.effectiveCaseIds.map((caseId) => (
                            <div
                              key={caseId}
                              className="rounded-xl border border-slate-700/30 bg-slate-900/60 px-3 py-2 font-mono text-sm text-slate-200"
                            >
                              {caseId}
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-slate-500">No schedule-facing identifiers.</p>
                        )}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-700/35 bg-slate-950/40 p-4">
                      <p className="text-sm font-semibold text-slate-100">Order watchers</p>
                      <div className="mt-3 space-y-2">
                        {profile.orderTrackers.length > 0 ? (
                          profile.orderTrackers.map((trackedCase) => (
                            <div
                              key={trackedCase.trackingKey}
                              className="rounded-xl border border-slate-700/30 bg-slate-900/60 px-3 py-3"
                            >
                              <p className="text-sm font-semibold text-slate-200">
                                {getTrackedOrderDisplay(trackedCase)}
                              </p>
                              <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">
                                {formatBenchLabel(trackedCase.city)}
                              </p>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-slate-500">No order watcher configured.</p>
                        )}
                      </div>
                    </div>
                  </div>
                </section>

                <section className="glass-card-lg p-5 sm:p-6">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                    Tracking
                  </p>
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <div className="rounded-2xl border border-cyan-400/15 bg-cyan-500/10 p-4">
                      <p className="text-sm font-semibold text-cyan-100">Live board tracking</p>
                      <p className="mt-2 text-sm text-cyan-100/75">
                        {profile.hasScheduleTracking
                          ? `${profile.effectiveCaseIds.length} schedule-facing identifier${profile.effectiveCaseIds.length === 1 ? '' : 's'} available for live board matching.`
                          : 'No live board coverage is configured for this case.'}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-indigo-400/15 bg-indigo-500/10 p-4">
                      <p className="text-sm font-semibold text-indigo-100">Order / judgment tracking</p>
                      <p className="mt-2 text-sm text-indigo-100/75">
                        {profile.hasOrderTracking
                          ? `${profile.orderTrackers.length} order watcher${profile.orderTrackers.length === 1 ? '' : 's'} active for this case.`
                          : 'No order watcher is configured for this case.'}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4">
                    <Link
                      href="/track-cases"
                      className="inline-flex items-center justify-center rounded-2xl border border-slate-600/30 bg-slate-900/40 px-5 py-3 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-800/65"
                    >
                      Change Tracking in Track Cases
                    </Link>
                  </div>
                </section>

                <section className="glass-card-lg p-5 sm:p-6">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                    Latest Board Snapshot
                  </p>
                  {currentCourt ? (
                    <div className="mt-4 space-y-4">
                      <div className="grid gap-4 md:grid-cols-3">
                        <div className="rounded-2xl border border-slate-700/35 bg-slate-950/40 p-4">
                          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                            Court
                          </p>
                          <p className="mt-2 text-base font-semibold text-slate-100">
                            {currentCourt.courtNo}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-slate-700/35 bg-slate-950/40 p-4">
                          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                            Serial / List
                          </p>
                          <p className="mt-2 text-base font-semibold text-slate-100">
                            {currentCourt.serialNo || '-'}
                            {currentCourt.list ? ` • ${currentCourt.list}` : ''}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-slate-700/35 bg-slate-950/40 p-4">
                          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                            Session
                          </p>
                          <p className="mt-2 text-base font-semibold text-slate-100">
                            {currentCourt.isInSession ? 'In session' : 'Not in session'}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-700/35 bg-slate-950/40 p-4">
                        <p className="text-sm font-semibold text-slate-100">
                          {currentCourt.caseDetails?.title || 'Case title unavailable'}
                        </p>
                        <p className="mt-2 text-sm text-slate-400">
                          {currentCourt.progress || 'No progress text available yet.'}
                        </p>
                        {currentCourt.caseDetails && (
                          <div className="mt-4 grid gap-4 lg:grid-cols-2">
                            <div>
                              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                                Petitioner counsel
                              </p>
                              <p className="mt-2 text-sm text-slate-300">
                                {currentCourt.caseDetails.petitionerCounsels.join(', ') || 'N/A'}
                              </p>
                            </div>
                            <div>
                              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                                Respondent counsel
                              </p>
                              <p className="mt-2 text-sm text-slate-300">
                                {currentCourt.caseDetails.respondentCounsels.join(', ') || 'N/A'}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-2xl border border-dashed border-slate-700/45 bg-slate-950/25 px-4 py-5 text-sm text-slate-500">
                      This case is not currently visible on the latest live board snapshot.
                    </div>
                  )}
                </section>

                <section className="glass-card-lg p-5 sm:p-6">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                    Recent Activity Feed
                  </p>
                  <div className="mt-4 space-y-3">
                    {notifications.length > 0 ? (
                      notifications.map((notification) => (
                        <div
                          key={notification._id || `${notification.type}-${notification.timestamp}`}
                          className={`rounded-2xl border p-4 ${
                            notification.read
                              ? 'border-slate-700/35 bg-slate-950/40'
                              : 'border-cyan-400/20 bg-cyan-500/10'
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-slate-100">
                              {notification.title}
                            </p>
                            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                              {formatTimestamp(notification.timestamp)}
                            </p>
                          </div>
                          <div className="mt-3 space-y-1 text-sm text-slate-300">
                            {String(notification.message || '')
                              .split('\n')
                              .filter(Boolean)
                              .map((line) => (
                                <p key={line}>{line}</p>
                              ))}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-dashed border-slate-700/45 bg-slate-950/25 px-4 py-5 text-sm text-slate-500">
                        No recent activity for this case yet.
                      </div>
                    )}
                  </div>
                </section>
              </div>

              <aside className="space-y-6">
                <div className="glass-card-lg p-5 sm:p-6">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                    Service Shortcuts
                  </p>
                  <div className="mt-4 space-y-3">
                    <Link
                      href={`/orders?mode=quick&city=${primaryCity}`}
                      className="block rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-4 text-sm font-semibold text-rose-100 transition-colors hover:bg-rose-500/20"
                    >
                      Open Orders
                    </Link>
                    <Link
                      href="/cause-list"
                      className="block rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-4 text-sm font-semibold text-amber-100 transition-colors hover:bg-amber-500/20"
                    >
                      Open Cause List
                    </Link>
                    <Link
                      href="/status"
                      className="block rounded-2xl border border-indigo-400/20 bg-indigo-500/10 px-4 py-4 text-sm font-semibold text-indigo-100 transition-colors hover:bg-indigo-500/20"
                    >
                      Open Status
                    </Link>
                    <Link
                      href="/web-diary"
                      className="block rounded-2xl border border-violet-400/20 bg-violet-500/10 px-4 py-4 text-sm font-semibold text-violet-100 transition-colors hover:bg-violet-500/20"
                    >
                      Open Web Diary
                    </Link>
                  </div>
                </div>

                <div className="glass-card-lg p-5 sm:p-6">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                    Source Map
                  </p>
                  <div className="mt-4 space-y-3 text-sm text-slate-400">
                    <p>
                      Live board coverage comes from the Lucknow court board snapshot already used
                      by the app.
                    </p>
                    <p>
                      Order and judgment coverage comes from the saved order watcher identifiers for
                      this case.
                    </p>
                  </div>
                </div>
              </aside>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
