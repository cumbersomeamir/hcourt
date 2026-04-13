import type { ReactNode } from 'react';
import Link from 'next/link';

type HomeTile = {
  href: string;
  title: string;
  label: string;
  description: string;
  badge: string;
  className: string;
  accentClass: string;
  icon: ReactNode;
};

const homeTiles: HomeTile[] = [
  {
    href: '/court-view',
    title: 'Court View',
    label: 'Live Board',
    description: 'Open the live Lucknow bench board with search, tracked filters, alerts, and refresh controls.',
    badge: 'Primary',
    className: 'col-span-2 min-h-[220px] lg:row-span-2 lg:min-h-[340px]',
    accentClass:
      'from-amber-400/18 via-sky-400/10 to-transparent border-amber-300/20 shadow-[0_28px_70px_rgba(15,23,42,0.34)]',
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 21h18M5 21V9m14 12V9M9 21v-6m6 6v-6M4 9l8-6 8 6M8 9h8" />
      </svg>
    ),
  },
  {
    href: '/ai-chat',
    title: 'AI Chat',
    label: 'Assistant',
    description: 'Ask for tracked-case summaries, courtroom changes, alerts, and guided actions in one place.',
    badge: 'Fast',
    className: 'col-span-2 min-h-[180px]',
    accentClass:
      'from-blue-400/16 via-cyan-400/8 to-transparent border-blue-300/18',
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 10h8M8 14h5M7 4h10a3 3 0 013 3v6a3 3 0 01-3 3h-4l-4 4v-4H7a3 3 0 01-3-3V7a3 3 0 013-3z" />
      </svg>
    ),
  },
  {
    href: '/orders',
    title: 'Orders & Judgments',
    label: 'Orders',
    description: 'Fetch case orders, judgments, PDFs, and spreadsheet exports.',
    badge: 'Records',
    className: 'min-h-[180px]',
    accentClass:
      'from-rose-400/14 via-orange-400/8 to-transparent border-rose-300/18',
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z" />
      </svg>
    ),
  },
  {
    href: '/web-diary',
    title: 'Web Diary',
    label: 'Diary',
    description: 'Browse date-based notifications and daily diary documents.',
    badge: 'Daily',
    className: 'min-h-[180px]',
    accentClass:
      'from-violet-400/14 via-fuchsia-400/8 to-transparent border-violet-300/18',
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    href: '/cause-list',
    title: 'Cause List',
    label: 'Lists',
    description: 'Inspect cause lists, court options, counsel search, and downloadable list views.',
    badge: 'Lists',
    className: 'min-h-[180px]',
    accentClass:
      'from-amber-300/14 via-orange-400/8 to-transparent border-amber-300/18',
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 7h8m-8 4h8m-8 4h5M7 3h10a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z" />
      </svg>
    ),
  },
  {
    href: '/status',
    title: 'Status',
    label: 'Board Status',
    description: 'Open the courtroom status board and live progress stream.',
    badge: 'Live',
    className: 'min-h-[180px]',
    accentClass:
      'from-indigo-400/14 via-sky-400/8 to-transparent border-indigo-300/18',
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 17v-6m3 6V7m3 10v-3m4 7H5a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v14a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    href: '/my-cases',
    title: 'My Cases',
    label: 'Workspace',
    description: 'Review saved case profiles, live board matches, and recent activity.',
    badge: 'Saved',
    className: 'min-h-[180px]',
    accentClass:
      'from-cyan-400/14 via-sky-400/8 to-transparent border-cyan-300/18',
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5V4H2v16h5" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 20h6M8 8h8M8 12h5" />
      </svg>
    ),
  },
  {
    href: '/track-cases',
    title: 'Track Cases',
    label: 'Tracking',
    description: 'Manage case IDs, order watchers, and saved tracking preferences.',
    badge: 'Pinned',
    className: 'min-h-[180px]',
    accentClass:
      'from-emerald-400/14 via-teal-400/8 to-transparent border-emerald-300/18',
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
    ),
  },
  {
    href: '/admin',
    title: 'Admin Data Map',
    label: 'Admin',
    description: 'Open the admin workspace for collection mapping, controls, and AI support views.',
    badge: 'Control',
    className: 'col-span-2 min-h-[180px] lg:col-span-1',
    accentClass:
      'from-slate-300/10 via-slate-400/6 to-transparent border-slate-400/18',
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 6h16M4 12h16M4 18h10" />
      </svg>
    ),
  },
];

export default function AppHomePage() {
  return (
    <main className="min-h-screen overflow-hidden">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute left-[-8%] top-[-6%] h-[420px] w-[420px] rounded-full bg-cyan-500/12 blur-[140px]" />
        <div className="absolute right-[-8%] top-[12%] h-[360px] w-[360px] rounded-full bg-amber-500/10 blur-[130px]" />
        <div className="absolute bottom-[-12%] left-[22%] h-[420px] w-[420px] rounded-full bg-emerald-500/8 blur-[150px]" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-3 py-4 sm:px-6 sm:py-6">
        <section className="grid flex-1 auto-rows-[minmax(168px,1fr)] grid-cols-2 gap-3 py-1 sm:gap-4 sm:py-2 lg:grid-cols-4">
          {homeTiles.map((tile) => (
            <Link
              key={tile.href}
              href={tile.href}
              className={`group relative overflow-hidden rounded-[1.7rem] border bg-slate-950/55 p-5 shadow-[0_20px_55px_rgba(2,6,23,0.28)] backdrop-blur-xl transition-all duration-200 hover:-translate-y-1 hover:border-slate-400/35 hover:bg-slate-950/78 ${tile.className} ${tile.accentClass}`}
            >
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br opacity-100 transition-opacity duration-200 group-hover:opacity-90" />
              <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-white/18 to-transparent" />
              <div className="relative flex h-full flex-col">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-slate-900/50 text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    {tile.icon}
                  </div>
                  <span className="rounded-full border border-white/10 bg-slate-950/40 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-300">
                    {tile.badge}
                  </span>
                </div>

                <div className="mt-6">
                  <p className="text-[11px] uppercase tracking-[0.26em] text-slate-400">
                    {tile.label}
                  </p>
                  <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-50 sm:text-2xl">
                    {tile.title}
                  </h2>
                  <p className="mt-3 max-w-[32ch] text-sm leading-6 text-slate-300/88">
                    {tile.description}
                  </p>
                </div>

                <div className="mt-auto flex items-center justify-between pt-6 text-sm font-semibold text-slate-100">
                  <span>Open module</span>
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-slate-950/40 transition-transform duration-200 group-hover:translate-x-1">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
