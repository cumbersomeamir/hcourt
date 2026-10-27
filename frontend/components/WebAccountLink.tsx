'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { clearWebAccount } from '@/lib/webAccount';

export default function WebAccountLink() {
  const [email, setEmail] = useState('');
  useEffect(() => {
    let active = true;
    fetch('/api/auth/session', { cache: 'no-store' }).then(response => response.json()).then(data => {
      if (!active || !data.success) return;
      setEmail(data.user?.email || '');
      if (!data.user && localStorage.getItem('courtlensWebAccount')) {
        clearWebAccount();
        window.location.reload();
      }
    }).catch(() => {});
    return () => { active = false; };
  }, []);
  return <div className="flex justify-end px-4 pt-3">
    <Link href="/account" className="max-w-[80%] truncate rounded-full border border-sky-400/25 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-200 hover:bg-sky-500/20">{email || 'Sign in with Google'}</Link>
  </div>;
}
