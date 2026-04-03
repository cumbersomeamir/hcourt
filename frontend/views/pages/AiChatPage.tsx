'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Cinzel, Manrope } from 'next/font/google';
import NotificationsPanel from '@/views/components/NotificationsPanel';
import WorkspaceNavigation from '@/views/components/WorkspaceNavigation';
import { loadTrackedState } from '@/lib/caseProfiles';
import { applyTrackedMutation, loadLawyerProfile } from '@/lib/lawyerProfile';
import { AiChatResponse, LawyerProfile } from '@/types/assistant';
import { TrackedOrderCase } from '@/types/court';

const cinzel = Cinzel({
  subsets: ['latin'],
  weight: ['600', '700'],
});

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
});

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  tools?: AiChatResponse['toolResults'];
};

const starterPrompts = [
  'What is the status of Writ C 10713 of 2023 in Lucknow bench?',
  'Check the cause list of date 02/04/2026 and let me know if any case is assigned to me.',
  'Is there any transfer in courtroom 9, my case is on serial number 12?',
  'Track WRIC/11985/2025 for me.',
];

export default function AiChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'Ask about case status, cause list assignments, courtroom movement, web diary items, alerts, or tracking.',
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [trackedCaseIds, setTrackedCaseIds] = useState<string[]>([]);
  const [trackedOrderCases, setTrackedOrderCases] = useState<TrackedOrderCase[]>([]);
  const [trackedOrderTrackingKeys, setTrackedOrderTrackingKeys] = useState<string[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [accountEmail, setAccountEmail] = useState('');
  const [profileKey, setProfileKey] = useState('');
  const [lawyerProfile, setLawyerProfile] = useState<LawyerProfile | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsCount, setNotificationsCount] = useState(0);

  useEffect(() => {
    let mounted = true;

    const loadPage = async () => {
      try {
        const trackedState = await loadTrackedState();
        if (!mounted) return;

        setTrackedCaseIds(trackedState.caseIds);
        setTrackedOrderCases(trackedState.trackedOrderCases);
        setTrackedOrderTrackingKeys(
          trackedState.trackedOrderCases.map((trackedCase) => trackedCase.trackingKey)
        );
        setUserId(trackedState.userId);
        setAccountEmail(trackedState.accountEmail);

        const lawyerProfileState = await loadLawyerProfile(trackedState.userId);
        if (!mounted) return;

        setProfileKey(lawyerProfileState.profileKey);
        setLawyerProfile(lawyerProfileState.profile);

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
      } catch (loadError) {
        if (mounted) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load AI chat');
        }
      }
    };

    loadPage();

    return () => {
      mounted = false;
    };
  }, []);

  const trackedSummary = useMemo(
    () => trackedCaseIds.length + trackedOrderCases.length,
    [trackedCaseIds.length, trackedOrderCases.length]
  );

  const sendMessage = async (prompt: string) => {
    const trimmed = prompt.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setError('');

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
    };

    setMessages((current) => [...current, userMessage]);
    setInput('');

    try {
      const history = [...messages, userMessage]
        .filter((message) => message.role === 'user' || message.role === 'assistant')
        .slice(-8)
        .map((message) => ({
          role: message.role,
          content: message.content,
        }));

      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          history,
          clientState: {
            profileKey,
            userId,
            email: accountEmail || null,
            trackedCaseIds,
            trackedOrderCases,
          },
        }),
      });
      const data = await response.json();
      if (!data.success || !data.result) {
        throw new Error(data.error || 'Failed to get AI response');
      }

      const result = data.result as AiChatResponse;
      if (result.clientMutation) {
        applyTrackedMutation(result.clientMutation);
        if (result.clientMutation.trackedCaseIds) {
          setTrackedCaseIds(result.clientMutation.trackedCaseIds);
        }
        if (result.clientMutation.trackedOrderCases) {
          setTrackedOrderCases(result.clientMutation.trackedOrderCases);
          setTrackedOrderTrackingKeys(
            result.clientMutation.trackedOrderCases.map((trackedCase) => trackedCase.trackingKey)
          );
        }
      }
      if (result.lawyerProfile) {
        setLawyerProfile(result.lawyerProfile);
      }

      setMessages((current) => [
        ...current,
        {
          id: result.requestId,
          role: 'assistant',
          content: result.answer,
          tools: result.toolResults,
        },
      ]);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Failed to send message');
    } finally {
      setSending(false);
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
                href="/admin"
                className="inline-flex items-center gap-2 rounded-full border border-amber-400/25 bg-amber-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-100 transition-colors hover:bg-amber-500/18"
              >
                Open Admin
              </Link>
            </div>
            <WorkspaceNavigation
              current="ai-chat"
              alertsCount={notificationsCount}
              onAlertsClick={() => setNotificationsOpen(true)}
            />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 sm:pb-20 sm:pt-10">
        <div className="mb-8 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-cyan-300/75">AI Chat</p>
            <h1 className={`mt-3 text-3xl font-semibold text-slate-100 sm:text-4xl ${cinzel.className}`}>
              Court Assistant
            </h1>
            <p className="mt-3 max-w-3xl text-sm text-slate-300 sm:text-base">
              GPT-5 Nano handles the natural-language request, triggers the right court tools,
              then writes the final concise answer from the retrieved facts.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
            <div className="rounded-3xl border border-cyan-400/20 bg-cyan-500/10 p-5">
              <p className="text-[11px] uppercase tracking-[0.24em] text-cyan-200/70">
                Tracking Context
              </p>
              <p className="mt-3 text-3xl font-semibold text-cyan-100">{trackedSummary}</p>
              <p className="mt-2 text-sm text-cyan-100/70">
                Saved case references available to the assistant.
              </p>
            </div>
            <div className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-5">
              <p className="text-[11px] uppercase tracking-[0.24em] text-amber-200/70">
                Lawyer Profile
              </p>
              <p className="mt-3 text-2xl font-semibold text-amber-100">
                {lawyerProfile?.counselName || 'Not configured'}
              </p>
              <p className="mt-2 text-sm text-amber-100/70">
                {lawyerProfile
                  ? `${lawyerProfile.aliases.length + lawyerProfile.chamberAliases.length} aliases ready`
                  : 'Configure this in /admin/data-map for “assigned to me” checks.'}
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <section className="rounded-[2rem] border border-slate-800/80 bg-[#0a132b]/92 p-4 shadow-[0_30px_80px_rgba(2,6,23,0.35)] sm:p-6">
            <div className="mb-4 flex flex-wrap gap-2">
              {starterPrompts.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => sendMessage(prompt)}
                  disabled={sending}
                  className="rounded-full border border-slate-700/60 bg-slate-950/40 px-4 py-2 text-left text-xs text-slate-300 transition-colors hover:bg-slate-900/70 disabled:opacity-50"
                >
                  {prompt}
                </button>
              ))}
            </div>

            <div className="max-h-[34rem] space-y-4 overflow-y-auto pr-1">
              {messages.map((message) => (
                <article
                  key={message.id}
                  className={`rounded-3xl border p-4 sm:p-5 ${
                    message.role === 'assistant'
                      ? 'border-slate-800/80 bg-slate-950/35'
                      : 'border-cyan-400/20 bg-cyan-500/10'
                  }`}
                >
                  <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                    {message.role === 'assistant' ? 'Assistant' : 'You'}
                  </p>
                  <p className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-100">
                    {message.content}
                  </p>
                  {message.tools && message.tools.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {message.tools.map((tool) => (
                        <div
                          key={`${message.id}-${tool.tool}`}
                          className="rounded-2xl border border-slate-700/60 bg-slate-900/35 px-4 py-3 text-sm text-slate-300"
                        >
                          <span className="font-semibold text-slate-100">{tool.tool}</span>
                          <span className="ml-2 text-slate-400">{tool.summary}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>

            <div className="mt-5 rounded-[1.6rem] border border-slate-700/60 bg-slate-950/45 p-3">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage(input);
                  }
                }}
                className="min-h-28 w-full resize-none bg-transparent px-2 py-2 text-sm leading-7 text-slate-100 outline-none placeholder:text-slate-500"
                placeholder="Ask about status, cause list assignments, courtroom transfer, alerts, web diary, or ask the assistant to track a case."
              />
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-xs text-slate-500">
                  Planner model: GPT-5 Nano. Final answer model: GPT-5 Nano.
                </p>
                <button
                  onClick={() => void sendMessage(input)}
                  disabled={sending || !input.trim()}
                  className="inline-flex items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-500/15 px-5 py-3 text-sm font-semibold text-cyan-100 transition-colors hover:bg-cyan-500/25 disabled:opacity-50"
                >
                  {sending ? 'Thinking...' : 'Send'}
                </button>
              </div>
            </div>
          </section>

          <aside className="space-y-5">
            <section className="rounded-[2rem] border border-slate-800/80 bg-[#0a132b]/92 p-6">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                Current Profile
              </p>
              <h2 className="mt-3 text-xl font-semibold text-slate-100">
                {lawyerProfile?.counselName || 'No lawyer profile saved'}
              </h2>
              <p className="mt-3 text-sm text-slate-400">
                {lawyerProfile
                  ? `Aliases: ${[
                      ...lawyerProfile.aliases,
                      ...lawyerProfile.chamberAliases,
                    ].join(', ') || 'none'}`
                  : 'Go to /admin/data-map and add your counsel name, aliases, and chamber names.'}
              </p>
              <Link
                href="/admin/data-map#lawyer-profile"
                className="mt-5 inline-flex items-center justify-center rounded-2xl border border-amber-400/25 bg-amber-500/10 px-5 py-3 text-sm font-semibold text-amber-100 transition-colors hover:bg-amber-500/18"
              >
                Edit Lawyer Profile
              </Link>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
