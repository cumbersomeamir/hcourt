'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
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
  role: 'user' | 'assistant' | 'pending';
  content: string;
  tools?: AiChatResponse['toolResults'];
};

type ConversationSummary = {
  conversationId: string;
  title: string;
  updatedAt: string;
};

const welcomeMessage: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content: 'I am your personal AI assistant. Ask me to write, plan, explain, summarize, or help with court work.',
};

const starterPrompts = [
  "Show today's Court View.",
  "Show today's Lucknow Web Diary.",
  'Draft a professional client update.',
];

const pendingMessages = [
  'Understanding your request...',
  'Checking saved court data...',
  'Preparing your answer...',
];

function getMessageOrderLinks(tools: ChatMessage['tools']) {
  if (!tools) return [];

  return tools.flatMap((tool) => {
    const data = (tool.data || {}) as Record<string, unknown>;
    if (!['order_list', 'latest_order'].includes(String(data.responseMode || ''))) return [];
    const cases = Array.isArray(data.cases) ? (data.cases as Array<Record<string, unknown>>) : [];

    return cases.flatMap((entry) => {
      const caseLabel = String(entry.caseId || entry.referenceLabel || 'Tracked case');
      const orderStatus = (entry.orderStatus || {}) as Record<string, unknown>;
      const orders = Array.isArray(orderStatus.orderJudgments)
        ? (orderStatus.orderJudgments as Array<Record<string, unknown>>)
        : [];

      return orders
        .map((order, index) => {
          const viewUrl = String(order.viewUrl || '').trim();
          if (!viewUrl) return null;
          const date = String(order.date || '').trim();
          const params = new URLSearchParams({
            viewUrl,
            page: '1',
            title: `${caseLabel}${date ? ` - ${date}` : ''}`,
          });
          if (date) params.set('date', date);

          return {
            href: `/orders/judgment-view?${params.toString()}`,
            label: date ? `Open order: ${date}` : `Open order ${index + 1}`,
          };
        })
        .filter((link): link is { href: string; label: string } => Boolean(link));
    });
  });
}

export default function AiChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([welcomeMessage]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [reportedIds, setReportedIds] = useState<string[]>([]);
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
  const [pendingStartedAt, setPendingStartedAt] = useState<number | null>(null);
  const [pendingStep, setPendingStep] = useState(0);

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

        const ownerParams = new URLSearchParams();
        if (trackedState.userId) ownerParams.set('userId', trackedState.userId);
        else if (lawyerProfileState.profileKey) ownerParams.set('profileKey', lawyerProfileState.profileKey);
        else if (trackedState.accountEmail) ownerParams.set('email', trackedState.accountEmail);
        if ([...ownerParams].length > 0) {
          const historyResponse = await fetch(`/api/ai/conversations?${ownerParams.toString()}`);
          const historyData = await historyResponse.json();
          if (mounted && historyData.success) setConversations(historyData.result || []);
        }

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

  useEffect(() => {
    if (!sending || !pendingStartedAt) {
      setPendingStep(0);
      return;
    }

    const interval = window.setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - pendingStartedAt) / 1000);
      if (elapsedSeconds >= 18) {
        setPendingStep(3);
      } else if (elapsedSeconds >= 8) {
        setPendingStep(2);
      } else if (elapsedSeconds >= 3) {
        setPendingStep(1);
      } else {
        setPendingStep(0);
      }
    }, 500);

    return () => window.clearInterval(interval);
  }, [pendingStartedAt, sending]);

  const ownerParams = () => {
    const params = new URLSearchParams();
    if (userId) params.set('userId', userId);
    else if (profileKey) params.set('profileKey', profileKey);
    else if (accountEmail) params.set('email', accountEmail);
    return params;
  };

  const openConversation = async (id: string) => {
    const params = ownerParams();
    params.set('conversationId', id);
    const response = await fetch(`/api/ai/conversations?${params.toString()}`);
    const data = await response.json();
    if (!data.success || !data.result) return;
    setConversationId(id);
    setHistoryOpen(false);
    setMessages((data.result.messages || []).map((message: ChatMessage) => ({
      ...message,
      tools: message.tools || (message as ChatMessage & { toolResults?: ChatMessage['tools'] }).toolResults,
    })));
  };

  const newConversation = () => {
    setConversationId(null);
    setHistoryOpen(false);
    setMessages([welcomeMessage]);
    setInput('');
  };

  const reportMessage = async (message: ChatMessage) => {
    if (reportedIds.includes(message.id)) return;
    const response = await fetch('/api/ai/report', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ responseId: message.id, conversationId, content: message.content }),
    });
    if (response.ok) setReportedIds((current) => [...current, message.id]);
  };

  const sendMessage = async (prompt: string) => {
    const trimmed = prompt.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setPendingStartedAt(Date.now());
    setPendingStep(0);
    setError('');

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
    };

    const pendingMessage: ChatMessage = {
      id: `pending-${Date.now()}`,
      role: 'pending',
      content: pendingMessages[0],
    };

    setMessages((current) => [...current, userMessage, pendingMessage]);
    setInput('');

    try {
      const history = [...messages, userMessage]
        .filter((message) => message.role === 'user' || message.role === 'assistant')
        .slice(-8)
        .map((message) => ({
          role: message.role,
          content: message.content,
          toolResults: message.tools,
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
          conversationId,
        }),
      });
      const data = await response.json();
      if (!data.success || !data.result) {
        throw new Error(data.error || 'Failed to get AI response');
      }

      const result = data.result as AiChatResponse & { conversationId?: string | null };
      if (result.conversationId) {
        setConversationId(result.conversationId);
        setConversations((current) => {
          const existing = current.find((item) => item.conversationId === result.conversationId);
          const item = existing || {
            conversationId: result.conversationId as string,
            title: trimmed.slice(0, 60),
            updatedAt: new Date().toISOString(),
          };
          return [item, ...current.filter((entry) => entry.conversationId !== result.conversationId)];
        });
      }
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
        ...current.filter((message) => message.role !== 'pending'),
        {
          id: result.requestId,
          role: 'assistant',
          content: result.answer,
          tools: result.toolResults,
        },
      ]);
    } catch {
      setMessages((current) => [
        ...current.filter((message) => message.role !== 'pending'),
        {
          id: `assistant-error-${Date.now()}`,
          role: 'assistant',
          content: "I couldn't retrieve the data right now. Please try again in a moment.",
        },
      ]);
      setError('');
    } finally {
      setSending(false);
      setPendingStartedAt(null);
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

      <header className="border-b border-slate-800/80 bg-[#081127]/95">
        <div className="mx-auto max-w-[1400px] px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-full border border-slate-700/40 bg-slate-950/35 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300 transition-colors hover:bg-slate-900/70"
              >
                <span aria-hidden="true">←</span>
                Dashboard
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

      <div className="mx-auto grid max-w-[1400px] gap-5 px-4 pb-10 pt-7 sm:px-6 sm:pb-16 sm:pt-10 lg:grid-cols-[16rem_minmax(0,1fr)]">
        {historyOpen && (
          <button
            aria-label="Close chat history"
            onClick={() => setHistoryOpen(false)}
            className="fixed inset-0 z-40 bg-slate-950/70 lg:hidden"
          />
        )}
        <aside className={`${historyOpen ? 'translate-x-0' : '-translate-x-full'} fixed inset-y-0 left-0 z-50 w-[82vw] max-w-72 border-r border-slate-800/80 bg-[#0a132b] p-4 shadow-2xl transition-transform lg:sticky lg:top-6 lg:z-auto lg:h-[calc(100vh-8rem)] lg:w-auto lg:max-w-none lg:translate-x-0 lg:rounded-[1.5rem] lg:border`}>
          <button
            onClick={newConversation}
            className="w-full rounded-xl border border-cyan-400/25 bg-cyan-500/15 px-4 py-3 text-left text-sm font-semibold text-cyan-100"
          >
            + New chat
          </button>
          <p className="mb-2 mt-5 px-2 text-[10px] uppercase tracking-[0.2em] text-slate-500">Last 30 days</p>
          <div className="max-h-[calc(100vh-9rem)] space-y-1 overflow-y-auto lg:max-h-[calc(100vh-14rem)]">
            {conversations.map((conversation) => (
              <button
                key={conversation.conversationId}
                onClick={() => void openConversation(conversation.conversationId)}
                className={`w-full rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                  conversationId === conversation.conversationId
                    ? 'bg-cyan-500/15 text-cyan-100'
                    : 'text-slate-300 hover:bg-slate-900/70'
                }`}
              >
                <span className="block truncate">{conversation.title}</span>
              </button>
            ))}
          </div>
        </aside>

        <main className="min-w-0">
        <div className="mb-6">
          <div>
            <button
              onClick={() => setHistoryOpen(true)}
              className="mb-4 rounded-xl border border-slate-700/60 bg-slate-950/40 px-4 py-2 text-sm font-semibold text-slate-200 lg:hidden"
            >
              ☰ Chats
            </button>
            <p className="text-xs uppercase tracking-[0.28em] text-cyan-300/75">AI Chat</p>
            <h1 className={`mt-3 text-3xl font-semibold text-slate-100 sm:text-4xl ${cinzel.className}`}>
              {lawyerProfile?.counselName
                ? `${lawyerProfile.counselName}'s AI Assistant`
                : 'Personal AI Assistant'}
            </h1>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

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

            <div className="max-h-[36rem] space-y-4 overflow-y-auto pr-1 sm:max-h-[42rem]">
              {messages.map((message) => (
                <article
                  key={message.id}
                  className={`max-w-[92%] rounded-3xl p-4 sm:p-5 ${
                    message.role === 'assistant' || message.role === 'pending'
                      ? 'mr-auto bg-slate-950/35'
                      : 'ml-auto border border-cyan-400/20 bg-cyan-500/10'
                  }`}
                >
                  <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                    {message.role === 'user' ? 'You' : 'Hcourt AI'}
                  </p>
                  {message.role === 'pending' ? (
                    <div className="mt-3 flex items-center gap-3 text-sm leading-7 text-slate-100">
                      <span className="inline-flex gap-1" aria-hidden="true">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-300" />
                        <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-300 [animation-delay:150ms]" />
                        <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-300 [animation-delay:300ms]" />
                      </span>
                      <span>{pendingMessages[pendingStep]}</span>
                    </div>
                  ) : (
                    <p className="mt-3 whitespace-pre-wrap text-[15px] leading-7 text-slate-100">
                      {message.content}
                    </p>
                  )}
                  {getMessageOrderLinks(message.tools).length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {getMessageOrderLinks(message.tools).map((link) => (
                        <Link
                          key={link.href}
                          href={link.href}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-xl border border-cyan-400/25 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-100 transition-colors hover:bg-cyan-500/20"
                        >
                          {link.label}
                        </Link>
                      ))}
                    </div>
                  )}
                  {message.role === 'assistant' && message.id !== 'welcome' && (
                    <button
                      onClick={() => void reportMessage(message)}
                      className="mt-3 text-xs text-slate-500 hover:text-slate-300"
                    >
                      {reportedIds.includes(message.id) ? 'Reported' : 'Report response'}
                    </button>
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
                className="min-h-24 w-full resize-none bg-transparent px-2 py-2 text-sm leading-7 text-slate-100 outline-none placeholder:text-slate-500"
                placeholder="Ask anything about court work, drafting, planning, or research..."
              />
              <div className="mt-3 flex items-center justify-between gap-3">
                <span />
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
        </main>
      </div>
    </div>
  );
}
