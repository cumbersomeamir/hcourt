'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { navigationStartIndex } from '@/lib/navigation';

export default function NavigationHistoryTracker() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const previousHref = useRef<string | null>(null);
  const popping = useRef(false);

  useEffect(() => {
    const onPopState = () => { popping.current = true; };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const href = window.location.href;
    if (!popping.current && previousHref.current !== href) {
      const canGoBack = window.history.length > 1 && (previousHref.current !== null || Boolean(window.history.state?.courtlensCanGoBack));
      window.history.replaceState({ ...window.history.state, courtlensCanGoBack: canGoBack, courtlensFirstIndex: navigationStartIndex() }, '');
    }
    popping.current = false;
    previousHref.current = href;
  }, [pathname, search]);

  return null;
}
