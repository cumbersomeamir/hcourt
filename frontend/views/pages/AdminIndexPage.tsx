'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Cinzel, Manrope } from 'next/font/google';
import NotificationsPanel from '@/views/components/NotificationsPanel';
import WorkspaceNavigation from '@/views/components/WorkspaceNavigation';
import AdminSectionLinks from '@/views/components/AdminSectionLinks';
import { loadTrackedState } from '@/lib/caseProfiles';

const cinzel = Cinzel({
  subsets: ['latin'],
  weight: ['600', '700'],
});

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
});

export default function AdminIndexPage() {
  const [trackedCaseIds, setTrackedCaseIds] = useState<string[]>([]);
  const [trackedOrderTrackingKeys, setTrackedOrderTrackingKeys] = useState<string[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsCount, setNotificationsCount] = useState(0);

  useEffect(() => {
    let mounted = true;

    const loadPage = async () => {
      const trackedState = await loadTrackedState();
      if (!mounted) return;

      setTrackedCaseIds(trackedState.caseIds);
      setTrackedOrderTrackingKeys(
        trackedState.trackedOrderCases.map((trackedCase) => trackedCase.trackingKey)
      );
      setUserId(trackedState.userId);

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

      const response = await fetch(`/api/notifications?${params.toString()}`);
      const data = await response.json();
      if (mounted && data.success) {
        setNotificationsCount(
          (data.notifications || []).filter(
            (notification: { read: boolean }) => !notification.read
          ).length
        );
      }
    };

    void loadPage();

    return () => {
      mounted = false;
    };
  }, []);

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
        <div className="mb-8 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-amber-300/75">Admin</p>
            <h1 className={`mt-3 text-3xl font-semibold text-slate-100 sm:text-4xl ${cinzel.className}`}>
              Control Center
            </h1>
            <p className="mt-3 max-w-3xl text-sm text-slate-300 sm:text-base">
              Jump between the admin pages for collection mapping, lawyer-profile setup, and AI
              chat capability review.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
            <div className="rounded-3xl border border-cyan-400/20 bg-cyan-500/10 p-5">
              <p className="text-[11px] uppercase tracking-[0.24em] text-cyan-200/70">
                Admin Pages
              </p>
              <p className="mt-3 text-3xl font-semibold text-cyan-100">3</p>
              <p className="mt-2 text-sm text-cyan-100/70">
                Home, data map, and AI chat functions.
              </p>
            </div>
            <div className="rounded-3xl border border-blue-400/20 bg-blue-500/10 p-5">
              <p className="text-[11px] uppercase tracking-[0.24em] text-blue-200/70">
                AI Coverage
              </p>
              <p className="mt-3 text-3xl font-semibold text-blue-100">7</p>
              <p className="mt-2 text-sm text-blue-100/70">
                First-class AI chat tools currently mapped.
              </p>
            </div>
          </div>
        </div>

        <section className="space-y-6">
          <AdminSectionLinks current="overview" />

          <div className="grid gap-4 xl:grid-cols-2">
            <article className="rounded-3xl border border-slate-800/80 bg-[#0a132b]/92 p-6">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                Recommended Flow
              </p>
              <div className="mt-4 space-y-3 text-sm text-slate-300">
                <p>Use Data Map to see which collections support each feature.</p>
                <p>Use Chat Functions to see what AI chat can answer today.</p>
                <p>Anything not listed there is not yet a first-class AI chat capability.</p>
              </div>
            </article>

            <article className="rounded-3xl border border-slate-800/80 bg-[#0a132b]/92 p-6">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                Lawyer Profile
              </p>
              <div className="mt-4 space-y-3 text-sm text-slate-300">
                <p>The lawyer profile editor stays inside Data Map.</p>
                <p>That profile is what AI chat uses for “assigned to me” style checks.</p>
              </div>
              <Link
                href="/admin/data-map#lawyer-profile"
                className="mt-5 inline-flex items-center justify-center rounded-2xl border border-amber-400/25 bg-amber-500/10 px-5 py-3 text-sm font-semibold text-amber-100 transition-colors hover:bg-amber-500/18"
              >
                Open Lawyer Profile
              </Link>
            </article>
          </div>
        </section>
      </div>
    </div>
  );
}
