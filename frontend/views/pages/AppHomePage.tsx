import type { ReactNode } from 'react';
import Link from 'next/link';

type HomeTile = {
  href: string;
  title: string;
  label: string;
  description: string;
  className: string;
  surfaceClassName: string;
  glowClassName: string;
  orbClassName: string;
  iconClassName: string;
  labelClassName: string;
  titleClassName: string;
  ctaClassName: string;
  icon: ReactNode;
};

const homeTiles: HomeTile[] = [
  {
    href: '/court-view',
    title: 'Court View',
    label: 'Live Board',
    description: 'Open the live Lucknow bench board with search, tracked filters, alerts, and refresh controls.',
    className: 'col-span-2 min-h-[220px] sm:min-h-[240px] lg:row-span-2 lg:min-h-[340px]',
    surfaceClassName:
      'border-amber-300/20 bg-[linear-gradient(145deg,rgba(15,23,42,0.94),rgba(10,20,46,0.9)_52%,rgba(22,78,99,0.72))] shadow-[0_28px_70px_rgba(15,23,42,0.34)]',
    glowClassName:
      'bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.24),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(34,211,238,0.22),transparent_38%)]',
    orbClassName: 'bg-amber-300/25',
    iconClassName: 'border-amber-200/15 bg-amber-200/10 text-amber-50',
    labelClassName: 'text-amber-100/55',
    titleClassName: 'text-slate-50',
    ctaClassName: 'border-amber-200/12 bg-amber-100/8 text-amber-50',
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
    className: 'col-span-2 min-h-[205px] sm:min-h-[220px]',
    surfaceClassName:
      'border-cyan-300/18 bg-[linear-gradient(145deg,rgba(8,17,40,0.95),rgba(16,30,68,0.88)_48%,rgba(8,145,178,0.55))] shadow-[0_28px_70px_rgba(8,47,73,0.26)]',
    glowClassName:
      'bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.24),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(59,130,246,0.18),transparent_42%)]',
    orbClassName: 'bg-cyan-300/25',
    iconClassName: 'border-cyan-200/15 bg-cyan-200/10 text-cyan-50',
    labelClassName: 'text-cyan-100/55',
    titleClassName: 'text-slate-50',
    ctaClassName: 'border-cyan-200/12 bg-cyan-100/8 text-cyan-50',
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
    className: 'min-h-[190px] sm:min-h-[180px]',
    surfaceClassName:
      'border-rose-300/18 bg-[linear-gradient(150deg,rgba(20,13,30,0.94),rgba(55,20,39,0.84)_55%,rgba(234,88,12,0.42))] shadow-[0_24px_60px_rgba(67,20,7,0.24)]',
    glowClassName:
      'bg-[radial-gradient(circle_at_top_left,rgba(251,113,133,0.24),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(251,146,60,0.2),transparent_38%)]',
    orbClassName: 'bg-rose-300/25',
    iconClassName: 'border-rose-200/15 bg-rose-200/10 text-rose-50',
    labelClassName: 'text-rose-100/55',
    titleClassName: 'text-slate-50',
    ctaClassName: 'border-rose-200/12 bg-rose-100/8 text-rose-50',
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
    className: 'min-h-[170px] sm:min-h-[180px]',
    surfaceClassName:
      'border-violet-300/18 bg-[linear-gradient(145deg,rgba(17,12,37,0.95),rgba(41,19,72,0.86)_55%,rgba(192,132,252,0.4))] shadow-[0_22px_55px_rgba(46,16,101,0.25)]',
    glowClassName:
      'bg-[radial-gradient(circle_at_top_right,rgba(196,181,253,0.22),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(217,70,239,0.18),transparent_40%)]',
    orbClassName: 'bg-violet-300/25',
    iconClassName: 'border-violet-200/15 bg-violet-200/10 text-violet-50',
    labelClassName: 'text-violet-100/55',
    titleClassName: 'text-slate-50',
    ctaClassName: 'border-violet-200/12 bg-violet-100/8 text-violet-50',
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
    className: 'min-h-[170px] sm:min-h-[180px]',
    surfaceClassName:
      'border-orange-300/18 bg-[linear-gradient(150deg,rgba(26,17,13,0.95),rgba(74,36,12,0.85)_54%,rgba(251,146,60,0.38))] shadow-[0_22px_55px_rgba(120,53,15,0.24)]',
    glowClassName:
      'bg-[radial-gradient(circle_at_top_left,rgba(252,211,77,0.2),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(251,146,60,0.2),transparent_38%)]',
    orbClassName: 'bg-orange-300/25',
    iconClassName: 'border-orange-200/15 bg-orange-200/10 text-orange-50',
    labelClassName: 'text-orange-100/55',
    titleClassName: 'text-slate-50',
    ctaClassName: 'border-orange-200/12 bg-orange-100/8 text-orange-50',
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
    className: 'min-h-[185px] sm:min-h-[180px]',
    surfaceClassName:
      'border-indigo-300/18 bg-[linear-gradient(145deg,rgba(11,16,40,0.96),rgba(24,31,88,0.85)_55%,rgba(79,70,229,0.42))] shadow-[0_24px_58px_rgba(30,27,75,0.24)]',
    glowClassName:
      'bg-[radial-gradient(circle_at_top_right,rgba(129,140,248,0.22),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(56,189,248,0.16),transparent_42%)]',
    orbClassName: 'bg-indigo-300/25',
    iconClassName: 'border-indigo-200/15 bg-indigo-200/10 text-indigo-50',
    labelClassName: 'text-indigo-100/55',
    titleClassName: 'text-slate-50',
    ctaClassName: 'border-indigo-200/12 bg-indigo-100/8 text-indigo-50',
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
    className: 'min-h-[178px] sm:min-h-[180px]',
    surfaceClassName:
      'border-sky-300/18 bg-[linear-gradient(150deg,rgba(10,20,34,0.95),rgba(11,54,78,0.86)_50%,rgba(45,212,191,0.32))] shadow-[0_24px_58px_rgba(8,47,73,0.24)]',
    glowClassName:
      'bg-[radial-gradient(circle_at_top_left,rgba(103,232,249,0.2),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(45,212,191,0.18),transparent_40%)]',
    orbClassName: 'bg-sky-300/25',
    iconClassName: 'border-sky-200/15 bg-sky-200/10 text-sky-50',
    labelClassName: 'text-sky-100/55',
    titleClassName: 'text-slate-50',
    ctaClassName: 'border-sky-200/12 bg-sky-100/8 text-sky-50',
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
    className: 'min-h-[192px] sm:min-h-[180px]',
    surfaceClassName:
      'border-emerald-300/18 bg-[linear-gradient(145deg,rgba(8,23,24,0.95),rgba(12,71,65,0.84)_55%,rgba(16,185,129,0.36))] shadow-[0_24px_58px_rgba(6,78,59,0.24)]',
    glowClassName:
      'bg-[radial-gradient(circle_at_top_right,rgba(110,231,183,0.22),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(45,212,191,0.16),transparent_40%)]',
    orbClassName: 'bg-emerald-300/25',
    iconClassName: 'border-emerald-200/15 bg-emerald-200/10 text-emerald-50',
    labelClassName: 'text-emerald-100/55',
    titleClassName: 'text-slate-50',
    ctaClassName: 'border-emerald-200/12 bg-emerald-100/8 text-emerald-50',
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
    className: 'col-span-2 min-h-[178px] lg:col-span-1',
    surfaceClassName:
      'border-slate-400/18 bg-[linear-gradient(145deg,rgba(15,23,42,0.95),rgba(30,41,59,0.88)_52%,rgba(71,85,105,0.42))] shadow-[0_22px_55px_rgba(15,23,42,0.24)]',
    glowClassName:
      'bg-[radial-gradient(circle_at_top_left,rgba(226,232,240,0.14),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(148,163,184,0.18),transparent_36%)]',
    orbClassName: 'bg-slate-300/20',
    iconClassName: 'border-slate-200/12 bg-slate-200/8 text-slate-50',
    labelClassName: 'text-slate-300/55',
    titleClassName: 'text-slate-50',
    ctaClassName: 'border-slate-200/12 bg-slate-100/8 text-slate-50',
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
              className={`group relative overflow-hidden rounded-[1.7rem] border p-5 shadow-[0_20px_55px_rgba(2,6,23,0.28)] backdrop-blur-xl transition-all duration-200 hover:-translate-y-1 hover:border-slate-200/20 ${tile.className} ${tile.surfaceClassName}`}
            >
              <div className={`pointer-events-none absolute inset-0 opacity-100 transition-opacity duration-200 group-hover:opacity-90 ${tile.glowClassName}`} />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),transparent_20%,transparent_75%,rgba(15,23,42,0.14))]" />
              <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-white/18 to-transparent" />
              <div className={`pointer-events-none absolute -right-8 top-12 h-24 w-24 rounded-full blur-3xl ${tile.orbClassName}`} />
              <div className={`pointer-events-none absolute bottom-0 left-10 h-20 w-20 rounded-full blur-2xl ${tile.orbClassName}`} />
              <div className="relative flex h-full flex-col">
                <div className="flex items-start">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${tile.iconClassName}`}>
                    {tile.icon}
                  </div>
                </div>

                <div className="mt-6">
                  <p className={`text-[11px] uppercase tracking-[0.26em] ${tile.labelClassName}`}>
                    {tile.label}
                  </p>
                  <h2 className={`mt-2 text-xl font-semibold tracking-[-0.03em] sm:text-2xl ${tile.titleClassName}`}>
                    {tile.title}
                  </h2>
                  <p className="mt-3 max-w-[32ch] text-sm leading-6 text-slate-100/78">
                    {tile.description}
                  </p>
                </div>

                <div className="mt-auto flex items-center justify-end pt-6 text-sm font-semibold text-slate-100">
                  <span className={`inline-flex h-10 w-10 items-center justify-center rounded-full border transition-transform duration-200 group-hover:translate-x-1 ${tile.ctaClassName}`}>
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
