'use client';

import { useEffect } from 'react';

declare global {
  interface Window {
    clarity?: (action: string, ...args: unknown[]) => void;
  }
}

export default function Clarity() {
  useEffect(() => {
    // Only load Clarity if project ID is provided
    const clarityId = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID;
    
    if (!clarityId) {
      console.log('Microsoft Clarity: Project ID not configured');
      return;
    }

    // Load Clarity script
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (function (c: Window & { [key: string]: any }, l: Document, a: string, r: string, i: string) {
      c[a] =
        c[a] ||
        function (...args: unknown[]) {
          (c[a].q = c[a].q || []).push(args);
        };
      const t = l.createElement(r) as HTMLScriptElement;
      t.async = true;
      t.src = 'https://www.clarity.ms/tag/' + i;
      const y = l.getElementsByTagName(r)[0];
      y.parentNode?.insertBefore(t, y);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    })(window as Window & { [key: string]: any }, document, 'clarity', 'script', clarityId);
  }, []);

  return null;
}
