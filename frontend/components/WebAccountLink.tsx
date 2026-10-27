'use client';

import { useEffect } from 'react';
import { clearWebAccount } from '@/lib/webAccount';

export default function WebAccountLink() {
  useEffect(() => {
    let active = true;
    fetch('/api/auth/session', { cache: 'no-store' }).then(response => response.json()).then(data => {
      if (!active || !data.success) return;
      if (!data.user && localStorage.getItem('courtlensWebAccount')) {
        clearWebAccount();
        window.location.reload();
      }
    }).catch(() => {});
    return () => { active = false; };
  }, []);
  return null;
}
