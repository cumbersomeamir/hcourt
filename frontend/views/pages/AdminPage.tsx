'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Cinzel, Manrope } from 'next/font/google';
import NotificationsPanel from '@/views/components/NotificationsPanel';
import WorkspaceNavigation from '@/views/components/WorkspaceNavigation';
import { loadTrackedState } from '@/lib/caseProfiles';
import { loadLawyerProfile, saveLawyerProfile } from '@/lib/lawyerProfile';
import { AdminOverview, LawyerProfile } from '@/types/assistant';

const cinzel = Cinzel({
  subsets: ['latin'],
  weight: ['600', '700'],
});

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
});

function listToTextarea(values: string[]) {
  return values.join('\n');
}

function textareaToList(value: string) {
  return Array.from(
    new Set(
      value
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

export default function AdminPage() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [profile, setProfile] = useState<LawyerProfile | null>(null);
  const [profileKey, setProfileKey] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [accountEmail, setAccountEmail] = useState('');
  const [trackedCaseIds, setTrackedCaseIds] = useState<string[]>([]);
  const [trackedOrderTrackingKeys, setTrackedOrderTrackingKeys] = useState<string[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsCount, setNotificationsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [form, setForm] = useState({
    counselName: '',
    aliasesText: '',
    chamberAliasesText: '',
    enrollmentNo: '',
  });

  useEffect(() => {
    let mounted = true;

    const loadPage = async () => {
      try {
        setLoading(true);
        setError('');

        const trackedState = await loadTrackedState();
        if (!mounted) return;

        setUserId(trackedState.userId);
        setAccountEmail(trackedState.accountEmail);
        setTrackedCaseIds(trackedState.caseIds);
        setTrackedOrderTrackingKeys(
          trackedState.trackedOrderCases.map((trackedCase) => trackedCase.trackingKey)
        );

        const [overviewResponse, lawyerProfileState] = await Promise.all([
          fetch('/api/admin/overview').then((response) => response.json()),
          loadLawyerProfile(trackedState.userId),
        ]);

        if (!mounted) return;

        if (!overviewResponse.success || !overviewResponse.overview) {
          throw new Error(overviewResponse.error || 'Failed to load admin overview');
        }

        setOverview(overviewResponse.overview as AdminOverview);
        setProfileKey(lawyerProfileState.profileKey);
        setProfile(lawyerProfileState.profile);
        setForm({
          counselName: lawyerProfileState.draft.counselName,
          aliasesText: listToTextarea(lawyerProfileState.draft.aliases),
          chamberAliasesText: listToTextarea(lawyerProfileState.draft.chamberAliases),
          enrollmentNo: lawyerProfileState.draft.enrollmentNo,
        });

        const params = new URLSearchParams({ limit: '100' });
        if (trackedState.caseIds.length > 0) {
          params.append('caseIds', trackedState.caseIds.join(','));
        }
        if (trackedState.trackedOrderCases.length > 0) {
          params.append(
            'orderTrackingKeys',
            trackedState.trackedOrderCases.map((trackedCase) => trackedCase.trackingKey).join(',')
          );
        }
        if (trackedState.userId) {
          params.append('userId', trackedState.userId);
        }

        const notificationResponse = await fetch(`/api/notifications?${params.toString()}`);
        const notificationData = await notificationResponse.json();
        if (mounted && notificationData.success) {
          setNotificationsCount(
            (notificationData.notifications || []).filter(
              (notification: { read: boolean }) => !notification.read
            ).length
          );
        }
      } catch (loadError) {
        if (mounted) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load admin page');
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

  const collectionTotal = useMemo(
    () => overview?.collections.reduce((total, collection) => total + collection.count, 0) || 0,
    [overview]
  );

  const handleSave = async () => {
    try {
      setSaving(true);
      setError('');
      setSaveMessage('');

      const savedProfile = await saveLawyerProfile({
        profileKey,
        userId,
        email: accountEmail || null,
        counselName: form.counselName,
        aliases: textareaToList(form.aliasesText),
        chamberAliases: textareaToList(form.chamberAliasesText),
        enrollmentNo: form.enrollmentNo,
      });

      setProfile(savedProfile);
      setSaveMessage('Lawyer profile saved.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save lawyer profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`min-h-screen ${manrope.className}`}>
      <NotificationsPanel
        isOpen={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        trackedCaseIds={trackedCaseIds}
        trackedOrderTrackingKeys={trackedOrderTrackingKeys}
        userId={userId}
      />

      <header className="border-b border-slate-800/80 bg-[#081127]/82 backdrop-blur-xl">
        <div className="mx-auto max-w-[1400px] px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-full border border-slate-700/40 bg-slate-950/35 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300 transition-colors hover:bg-slate-900/70"
              >
                <span aria-hidden="true">←</span>
                Dashboard
              </Link>
              <Link
                href="/ai-chat"
                className="inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-500/12 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100 transition-colors hover:bg-cyan-500/22"
              >
                Open AI Chat
              </Link>
            </div>
            <WorkspaceNavigation
              alertsCount={notificationsCount}
              onAlertsClick={() => setNotificationsOpen(true)}
            />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 sm:pb-20 sm:pt-10">
        <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-amber-300/75">Admin</p>
            <h1 className={`mt-3 text-3xl font-semibold text-slate-100 sm:text-4xl ${cinzel.className}`}>
              Data Map
            </h1>
            <p className="mt-3 max-w-3xl text-sm text-slate-300 sm:text-base">
              Visual map of which collections power which features, plus the lawyer profile that
              AI uses for assignment-style questions.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-3xl border border-cyan-400/20 bg-cyan-500/10 p-5">
              <p className="text-[11px] uppercase tracking-[0.24em] text-cyan-200/70">
                Collections
              </p>
              <p className="mt-3 text-3xl font-semibold text-cyan-100">
                {overview?.collections.length || 0}
              </p>
              <p className="mt-2 text-sm text-cyan-100/70">{collectionTotal} total documents</p>
            </div>
            <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5">
              <p className="text-[11px] uppercase tracking-[0.24em] text-emerald-200/70">
                Lawyer Profile
              </p>
              <p className="mt-3 text-3xl font-semibold text-emerald-100">
                {profile?.counselName ? 'Ready' : 'Pending'}
              </p>
              <p className="mt-2 text-sm text-emerald-100/70">
                {profile?.updatedAt
                  ? `Updated ${new Date(profile.updatedAt).toLocaleString()}`
                  : 'Add aliases for cause-list assignment checks.'}
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {saveMessage && (
          <div className="mb-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {saveMessage}
          </div>
        )}

        {loading ? (
          <div className="glass-card-lg p-12 text-center text-sm text-slate-400">
            Loading admin overview...
          </div>
        ) : (
          <div className="space-y-8">
            <section className="rounded-[2rem] border border-slate-800/80 bg-[#0a132b]/92 p-6 shadow-[0_30px_80px_rgba(2,6,23,0.35)] sm:p-8">
              <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                    Lawyer Profile
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-100">
                    Counsel identity used by AI
                  </h2>
                </div>
                <p className="text-sm text-slate-400">
                  Profile key: <span className="font-mono text-slate-300">{profileKey}</span>
                </p>
              </div>

              <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="space-y-4">
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-300">
                      Counsel Name
                    </span>
                    <input
                      value={form.counselName}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, counselName: event.target.value }))
                      }
                      className="w-full rounded-2xl border border-slate-700/60 bg-slate-950/45 px-4 py-3 text-sm text-slate-100 outline-none transition-colors focus:border-cyan-400/40"
                      placeholder="Amit Kumar Singh"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-300">
                      Counsel Aliases
                    </span>
                    <textarea
                      value={form.aliasesText}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, aliasesText: event.target.value }))
                      }
                      className="min-h-28 w-full rounded-2xl border border-slate-700/60 bg-slate-950/45 px-4 py-3 text-sm text-slate-100 outline-none transition-colors focus:border-cyan-400/40"
                      placeholder={'A.K. Singh\nAmit K Singh'}
                    />
                  </label>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="block">
                      <span className="mb-2 block text-sm font-medium text-slate-300">
                        Chamber / Firm Aliases
                      </span>
                      <textarea
                        value={form.chamberAliasesText}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            chamberAliasesText: event.target.value,
                          }))
                        }
                        className="min-h-28 w-full rounded-2xl border border-slate-700/60 bg-slate-950/45 px-4 py-3 text-sm text-slate-100 outline-none transition-colors focus:border-cyan-400/40"
                        placeholder={'Singh & Co.\nAmit Singh Chamber'}
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm font-medium text-slate-300">
                        Enrollment No.
                      </span>
                      <input
                        value={form.enrollmentNo}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, enrollmentNo: event.target.value }))
                        }
                        className="w-full rounded-2xl border border-slate-700/60 bg-slate-950/45 px-4 py-3 text-sm text-slate-100 outline-none transition-colors focus:border-cyan-400/40"
                        placeholder="UP01234/2020"
                      />
                    </label>
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-700/60 bg-slate-950/35 p-5">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                    How It Is Used
                  </p>
                  <div className="mt-4 space-y-3 text-sm text-slate-300">
                    <p>Cause list assignment checks search using the counsel name and aliases.</p>
                    <p>Chamber aliases are included for broader counsel matching when needed.</p>
                    <p>The same profile key works locally, and syncs to the backend if you have an account.</p>
                  </div>

                  <div className="mt-6 rounded-2xl border border-slate-700/60 bg-slate-900/40 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                      Sync State
                    </p>
                    <p className="mt-3 text-lg font-semibold text-slate-100">
                      {userId ? 'Synced account available' : 'Local profile only'}
                    </p>
                    <p className="mt-2 text-sm text-slate-400">
                      {accountEmail || 'No synced account email available'}
                    </p>
                  </div>

                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="mt-6 inline-flex w-full items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-500/15 px-5 py-3 text-sm font-semibold text-cyan-100 transition-colors hover:bg-cyan-500/25 disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save Lawyer Profile'}
                  </button>
                </div>
              </div>
            </section>

            <section>
              <div className="mb-5">
                <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Features</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-100">
                  Feature to collection map
                </h2>
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                {overview?.features.map((feature) => (
                  <article
                    key={feature.id}
                    className="rounded-3xl border border-slate-800/80 bg-[#0a132b]/92 p-6"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                          {feature.mode.replace('_', ' ')}
                        </p>
                        <h3 className="mt-2 text-xl font-semibold text-slate-100">
                          {feature.label}
                        </h3>
                      </div>
                      <span className="rounded-full border border-slate-700/60 bg-slate-950/35 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">
                        {feature.collections.length} collections
                      </span>
                    </div>
                    <p className="mt-4 text-sm text-slate-300">{feature.sourceOfTruth}</p>
                    <p className="mt-4 text-sm text-slate-400">Freshness: {feature.freshness}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {feature.lookupKeys.map((key) => (
                        <span
                          key={key}
                          className="rounded-full border border-cyan-400/15 bg-cyan-500/8 px-3 py-1 text-xs text-cyan-100/80"
                        >
                          {key}
                        </span>
                      ))}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {feature.collections.map((collection) => (
                        <span
                          key={collection}
                          className="rounded-full border border-slate-700/60 bg-slate-950/35 px-3 py-1 text-xs text-slate-300"
                        >
                          {collection}
                        </span>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section>
              <div className="mb-5">
                <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Collections</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-100">
                  Stored collections by responsibility
                </h2>
              </div>
              <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                {overview?.collections.map((collection) => (
                  <article
                    key={collection.name}
                    className="rounded-3xl border border-slate-800/80 bg-[#0a132b]/92 p-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                          {collection.persistence}
                        </p>
                        <h3 className="mt-2 text-lg font-semibold text-slate-100">
                          {collection.name}
                        </h3>
                      </div>
                      <span className="rounded-full border border-slate-700/60 bg-slate-950/35 px-3 py-1 text-xs text-slate-300">
                        {collection.count}
                      </span>
                    </div>
                    <p className="mt-4 text-sm text-slate-300">{collection.purpose}</p>
                    <p className="mt-4 text-sm text-slate-400">
                      Latest: {collection.latestAt ? new Date(collection.latestAt).toLocaleString() : 'No documents yet'}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {collection.primaryKeys.map((key) => (
                        <span
                          key={key}
                          className="rounded-full border border-amber-400/15 bg-amber-500/8 px-3 py-1 text-xs text-amber-100/80"
                        >
                          {key}
                        </span>
                      ))}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {collection.features.map((feature) => (
                        <span
                          key={feature}
                          className="rounded-full border border-slate-700/60 bg-slate-950/35 px-3 py-1 text-xs text-slate-300"
                        >
                          {feature}
                        </span>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
