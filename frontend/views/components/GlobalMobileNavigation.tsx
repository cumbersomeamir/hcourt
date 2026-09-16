'use client';

import { usePathname } from 'next/navigation';
import WorkspaceNavigation from '@/views/components/WorkspaceNavigation';

const pagesWithNavigation = [
  '/ai-chat',
  '/my-cases',
  '/track-cases',
  '/case-profile',
  '/admin',
];

export default function GlobalMobileNavigation() {
  const pathname = usePathname();
  if (pathname === '/' || pathname === '/home') return null;
  if (pagesWithNavigation.some((path) => pathname.startsWith(path))) return null;

  const current = pathname.startsWith('/web-diary')
    ? 'web-diary'
    : pathname.startsWith('/court-view')
      ? 'court-view'
    : pathname.startsWith('/cause-list')
      ? 'cause-list'
      : pathname.startsWith('/status')
        ? 'status'
        : pathname.startsWith('/orders')
          ? 'orders'
          : undefined;

  return (
    <div className="xl:hidden">
      <WorkspaceNavigation current={current} />
    </div>
  );
}
