'use client';

import Link from 'next/link';
import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';
import { clearWebAccount, saveWebAccount } from '@/lib/webAccount';

type GoogleIdentity = { accounts: { id: {
  initialize: (options: { client_id: string; callback: (response: { credential: string }) => void }) => void;
  renderButton: (element: HTMLElement, options: Record<string, string | number>) => void;
  disableAutoSelect: () => void;
} } };

export default function AccountPage() {
  const [user, setUser] = useState<{ email: string } | null>(null);
  const [clientId, setClientId] = useState('');
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const button = useRef<HTMLDivElement>(null);
  const signingIn = useRef(false);
  useEffect(() => {
    fetch('/api/auth/session', { cache: 'no-store' }).then(response => response.json()).then(data => {
      if (!data.success) throw new Error(data.error);
      setUser(data.user);
      setClientId(data.googleClientId || '');
      if (!data.user && !data.googleClientId) setError('Google sign-in is temporarily unavailable.');
    }).catch(() => setError('Unable to load sign-in. Please refresh the page.')).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    const google = (window as Window & { google?: GoogleIdentity }).google;
    if (!ready || !clientId || user || !button.current || !google) return;
    google.accounts.id.initialize({ client_id: clientId, callback: async ({ credential }) => {
      if (signingIn.current) return;
      signingIn.current = true;
      setBusy(true);
      setError('');
      try {
        const response = await fetch('/api/auth/web-google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: credential }) });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || 'Google sign-in failed.');
        saveWebAccount(data.user, data.account);
        window.location.assign('/');
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : 'Unable to sign in.');
        signingIn.current = false;
        setBusy(false);
      }
    } });
    button.current.replaceChildren();
    google.accounts.id.renderButton(button.current, { theme: 'outline', size: 'large', text: 'continue_with', shape: 'pill', width: 280 });
  }, [ready, clientId, user]);
  const signOut = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/auth/session', { method: 'DELETE' });
      if (!response.ok) throw new Error('Unable to sign out. Please try again.');
      (window as Window & { google?: GoogleIdentity }).google?.accounts.id.disableAutoSelect();
      clearWebAccount();
      window.location.assign('/account');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to sign out.');
      setBusy(false);
    }
  };
  return <main className="mx-auto flex min-h-[75vh] max-w-lg items-center px-4 py-12">
    <Script src="https://accounts.google.com/gsi/client" onReady={() => setReady(true)} onError={() => setError('Google could not load. Check your connection and refresh.')} />
    <section className="w-full rounded-3xl border border-slate-700/60 bg-slate-900/80 p-6 shadow-xl sm:p-10">
      <Link href="/" className="text-sm text-sky-300">← Home</Link>
      <h1 className="mt-6 text-3xl font-semibold text-slate-100">{user ? 'Your Courtlens account' : 'Welcome to Courtlens'}</h1>
      <p className="mt-3 text-sm leading-6 text-slate-400">{user ? user.email : 'Continue with the same Google account you use in the app. Your saved cases stay connected across devices.'}</p>
      {loading ? <p className="mt-6 text-slate-400">Loading account…</p> : user ? <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/my-cases" className="rounded-xl bg-sky-500/15 px-4 py-3 text-sky-200">My Cases</Link>
        <button disabled={busy} onClick={signOut} className="rounded-xl border border-slate-600 px-4 py-3 text-slate-200 disabled:opacity-50">{busy ? 'Signing out…' : 'Sign out'}</button>
      </div> : <div className={`mt-7 flex justify-center ${busy ? 'pointer-events-none opacity-50' : ''}`} ref={button} />}
      {busy && !user && <p role="status" className="mt-4 text-sm text-sky-200">Signing in and syncing your cases…</p>}
      {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
    </section>
  </main>;
}
