'use client';

import Link from 'next/link';
import { ReactNode, useState } from 'react';

type NavKey =
  | 'dashboard'
  | 'web-diary'
  | 'cause-list'
  | 'status'
  | 'orders'
  | 'my-cases'
  | 'track-cases';

type NavItem = {
  key: NavKey;
  href: string;
  label: string;
  title: string;
  borderClass: string;
  textClass: string;
  iconClass: string;
  icon: ReactNode;
};

const desktopNavItemClass =
  'group relative inline-flex h-11 items-center gap-2 rounded-full border bg-slate-950/35 px-4 text-sm font-semibold text-slate-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-colors duration-200 hover:bg-slate-900/70';
const mobileMenuItemClass =
  'relative flex min-h-14 items-center gap-3 rounded-2xl border bg-slate-950/40 px-4 py-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-colors duration-200 hover:bg-slate-900/70';
const mobileMenuIconClass =
  'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border bg-slate-950/80';

const navItems: NavItem[] = [
  {
    key: 'dashboard',
    href: '/',
    label: 'Dashboard',
    title: 'Open dashboard',
    borderClass: 'border-slate-500/20',
    textClass: 'text-slate-100',
    iconClass: 'border-slate-500/20 bg-slate-500/10 text-slate-200',
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12l8-7 8 7" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 10v10h12V10" />
      </svg>
    ),
  },
  {
    key: 'web-diary',
    href: '/web-diary',
    label: 'Web Diary',
    title: 'View Web Diary',
    borderClass: 'border-violet-400/20',
    textClass: 'text-violet-100',
    iconClass: 'border-violet-400/20 bg-violet-500/10 text-violet-200',
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    key: 'cause-list',
    href: '/cause-list',
    label: 'Cause List',
    title: 'View Cause List',
    borderClass: 'border-amber-400/20',
    textClass: 'text-amber-100',
    iconClass: 'border-amber-400/20 bg-amber-500/10 text-amber-200',
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h8m-8 4h8m-8 4h5M7 3h10a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z" />
      </svg>
    ),
  },
  {
    key: 'status',
    href: '/status',
    label: 'Status',
    title: 'View Status',
    borderClass: 'border-indigo-400/20',
    textClass: 'text-indigo-100',
    iconClass: 'border-indigo-400/20 bg-indigo-500/10 text-indigo-200',
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-6m3 6V7m3 10v-3m4 7H5a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v14a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    key: 'orders',
    href: '/orders',
    label: 'Orders',
    title: 'View Orders',
    borderClass: 'border-rose-400/20',
    textClass: 'text-rose-100',
    iconClass: 'border-rose-400/20 bg-rose-500/10 text-rose-200',
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z" />
      </svg>
    ),
  },
  {
    key: 'my-cases',
    href: '/my-cases',
    label: 'My Cases',
    title: 'View saved cases',
    borderClass: 'border-cyan-400/20',
    textClass: 'text-cyan-100',
    iconClass: 'border-cyan-400/20 bg-cyan-500/10 text-cyan-200',
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5V4H2v16h5" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20h6M8 8h8M8 12h5" />
      </svg>
    ),
  },
  {
    key: 'track-cases',
    href: '/track-cases',
    label: 'Track Cases',
    title: 'Manage tracked cases',
    borderClass: 'border-emerald-400/20',
    textClass: 'text-emerald-100',
    iconClass: 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200',
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
    ),
  },
];

export default function WorkspaceNavigation({ current }: { current?: NavKey }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setMobileNavOpen((open) => !open)}
        className="fixed right-4 top-4 z-50 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-700/60 bg-slate-950/80 text-slate-100 shadow-[0_18px_40px_rgba(2,6,23,0.45)] backdrop-blur-xl lg:hidden"
        aria-label="Toggle navigation menu"
        aria-expanded={mobileNavOpen}
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d={mobileNavOpen ? 'M6 18L18 6M6 6l12 12' : 'M4 7h16M4 12h16M4 17h16'}
          />
        </svg>
      </button>

      <div
        className={`fixed inset-0 z-40 bg-slate-950/55 backdrop-blur-sm transition-opacity duration-200 lg:hidden ${
          mobileNavOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={() => setMobileNavOpen(false)}
        aria-hidden={!mobileNavOpen}
      />

      <aside
        className={`fixed right-0 top-0 z-50 flex h-full w-[min(24rem,calc(100vw-1rem))] flex-col border-l border-slate-700/60 bg-[#081127]/95 shadow-[-24px_0_80px_rgba(2,6,23,0.65)] backdrop-blur-2xl transition-transform duration-300 ease-out lg:hidden ${
          mobileNavOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-hidden={!mobileNavOpen}
      >
        <div className="flex items-center justify-between border-b border-slate-800/80 px-5 py-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Navigation</p>
            <p className="mt-1 text-sm text-slate-400">Court tools and case workspace</p>
          </div>
          <button
            onClick={() => setMobileNavOpen(false)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-700/60 bg-slate-950/50 text-slate-100"
            aria-label="Close navigation menu"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="grid grid-cols-1 gap-2.5">
            {navItems.map((item) => {
              const active = item.key === current;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  onClick={() => setMobileNavOpen(false)}
                  className={`${mobileMenuItemClass} ${item.borderClass} ${
                    active ? 'bg-slate-900/80 ring-1 ring-white/10' : ''
                  }`}
                  title={item.title}
                  aria-current={active ? 'page' : undefined}
                >
                  <span className={`${mobileMenuIconClass} ${item.iconClass}`}>{item.icon}</span>
                  <span className="text-base font-semibold text-slate-100">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </aside>

      <div className="hidden lg:flex flex-wrap items-center justify-end gap-2.5">
        {navItems.map((item) => {
          const active = item.key === current;
          return (
            <Link
              key={item.key}
              href={item.href}
              className={`${desktopNavItemClass} ${item.borderClass} ${item.textClass} ${
                active ? 'bg-slate-900/80 ring-1 ring-white/10' : ''
              }`}
              title={item.title}
              aria-current={active ? 'page' : undefined}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </div>
    </>
  );
}
