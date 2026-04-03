'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Cinzel, Manrope } from 'next/font/google';
import NotificationsPanel from '@/views/components/NotificationsPanel';
import WorkspaceNavigation from '@/views/components/WorkspaceNavigation';
import AdminSectionLinks from '@/views/components/AdminSectionLinks';
import { aiChatFunctionSections } from '@/lib/adminSections';
import { loadTrackedState } from '@/lib/caseProfiles';

const cinzel = Cinzel({
  subsets: ['latin'],
  weight: ['600', '700'],
});

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
});

export default function AdminChatFunctionsPage() {
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
        <div className="mb-8">
          <p className="text-xs uppercase tracking-[0.28em] text-blue-300/75">Admin</p>
          <h1 className={`mt-3 text-3xl font-semibold text-slate-100 sm:text-4xl ${cinzel.className}`}>
            Chat Functions
          </h1>
          <p className="mt-3 max-w-3xl text-sm text-slate-300 sm:text-base">
            Section-by-section view of what AI chat can currently do. If a response category is
            missing here, it is not yet exposed as a first-class AI chat function.
          </p>
        </div>

        <div className="space-y-8">
          <AdminSectionLinks current="chat-functions" />

          {aiChatFunctionSections.map((section) => (
            <section
              key={section.id}
              className="rounded-[2rem] border border-slate-800/80 bg-[#0a132b]/92 p-6 shadow-[0_30px_80px_rgba(2,6,23,0.35)] sm:p-8"
            >
              <div className="mb-5">
                <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                  Capability Group
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-100">{section.label}</h2>
                <p className="mt-3 max-w-3xl text-sm text-slate-300">{section.description}</p>
              </div>

              <div className="space-y-4">
                {section.items.map((item) => (
                  <details
                    key={item.name}
                    className="rounded-3xl border border-slate-700/60 bg-slate-950/35 p-5"
                  >
                    <summary className="cursor-pointer list-none">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-mono text-sm text-cyan-100">{item.name}</p>
                          <p className="mt-2 text-sm text-slate-300">{item.summary}</p>
                        </div>
                        <span className="rounded-full border border-slate-700/60 bg-slate-900/60 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-slate-400">
                          Open
                        </span>
                      </div>
                    </summary>
                    <p className="mt-4 text-sm text-slate-400">{item.detail}</p>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
