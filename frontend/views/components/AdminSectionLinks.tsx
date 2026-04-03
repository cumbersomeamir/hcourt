'use client';

import Link from 'next/link';
import { adminSectionLinks, AdminSectionId } from '@/lib/adminSections';

type AdminSectionLinksProps = {
  current: AdminSectionId;
};

export default function AdminSectionLinks({ current }: AdminSectionLinksProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {adminSectionLinks.map((section) => {
        const active = section.id === current;

        return (
          <Link
            key={section.id}
            href={section.href}
            aria-current={active ? 'page' : undefined}
            className={`rounded-3xl border bg-[#0a132b]/92 p-5 transition-colors hover:bg-[#0d1834] ${section.borderClass} ${
              active ? 'ring-1 ring-white/10' : ''
            }`}
          >
            <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
              {section.eyebrow}
            </p>
            <h2 className={`mt-3 text-xl font-semibold ${section.textClass}`}>{section.label}</h2>
            <p className="mt-3 text-sm text-slate-300">{section.description}</p>
          </Link>
        );
      })}
    </div>
  );
}
