'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

const routes = [
  '/court-view',
  '/ai-chat',
  '/orders',
  '/web-diary',
  '/cause-list',
  '/status',
  '/my-cases',
  '/track-cases',
];

export default function RoutePrefetcher() {
  const router = useRouter();
  useEffect(() => {
    routes.forEach((route) => router.prefetch(route));
  }, [router]);
  return null;
}
