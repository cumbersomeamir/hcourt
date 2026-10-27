'use client';

import Link from 'next/link';
import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';
import { clearWebAccount, saveWebAccount } from '@/lib/webAccount';
import styles from './account.module.css';

type LawyerProfile = { counselName: string; enrollmentNo: string | null; aliases: string[]; chamberAliases: string[] };

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
  const [profile, setProfile] = useState<LawyerProfile | null>(null);
  const [editor, setEditor] = useState<'setup' | 'settings' | null>(null);
  const [form, setForm] = useState({ counselName: '', enrollmentNo: '', aliases: '', chamberAliases: '' });
  const button = useRef<HTMLDivElement>(null);
  const signingIn = useRef(false);
  useEffect(() => {
    fetch('/api/auth/session', { cache: 'no-store' }).then(response => response.json()).then(async data => {
      if (!data.success) throw new Error(data.error);
      setUser(data.user);
      setClientId(data.googleClientId || '');
      if (data.user) {
        const response = await fetch('/api/lawyer-profile', { cache: 'no-store' });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error);
        setProfile(result.profile);
        if (new URLSearchParams(window.location.search).has('setup')) {
          if (result.profile) window.location.assign('/');
          else setEditor('setup');
        }
      }
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
        window.location.assign('/account?setup=1');
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : 'Unable to sign in.');
        signingIn.current = false;
        setBusy(false);
      }
    } });
    button.current.replaceChildren();
    google.accounts.id.renderButton(button.current, { theme: 'outline', size: 'large', text: 'continue_with', shape: 'pill', width: 280 });
  }, [ready, clientId, user, loading]);
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
  const openProfile = () => {
    setForm({ counselName: profile?.counselName || '', enrollmentNo: profile?.enrollmentNo || '', aliases: profile?.aliases.join('\n') || '', chamberAliases: profile?.chamberAliases.join('\n') || '' });
    setError('');
    setEditor('settings');
  };
  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.counselName.trim() || !form.enrollmentNo.trim()) {
      setError('Full counsel name and enrollment number are required.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const toAliases = (value: string) => value.split(/[\n,]/).map(item => item.trim()).filter(Boolean);
      const response = await fetch('/api/lawyer-profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ counselName: form.counselName.trim(), enrollmentNo: form.enrollmentNo.trim(), aliases: toAliases(form.aliases), chamberAliases: toAliases(form.chamberAliases) }) });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Could not save lawyer profile.');
      setProfile(data.profile);
      if (editor === 'setup') window.location.assign('/');
      else setEditor(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save lawyer profile.');
    } finally { setBusy(false); }
  };
  const deleteAccount = async () => {
    if (!window.confirm('Delete your Courtlens account, profile, tracked cases and AI chat data? This cannot be undone.')) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/account', { method: 'DELETE' });
      if (!response.ok) throw new Error('Account data could not be deleted.');
      await signOut();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not delete account.');
      setBusy(false);
    }
  };
  const cancelEditor = () => {
    setError('');
    if (editor === 'setup') window.location.assign('/');
    else setEditor(null);
  };
  const row = (icon: string, title: string, description: string, tone = 'slate', action?: () => void, href?: string) => {
    const content = <><span className={`${styles.icon} ${styles[tone]}`}>{icon}</span><span className={styles.rowCopy}><strong className={tone === 'red' ? styles.danger : ''}>{title}</strong><small>{description}</small></span>{(action || href) && <span className={styles.chevron}>›</span>}</>;
    return href ? <Link className={styles.row} href={href}>{content}</Link> : action ? <button className={styles.row} onClick={action} disabled={busy}>{content}</button> : <div className={styles.row}>{content}</div>;
  };
  const accountName = profile?.counselName || 'Courtlens member';
  return <main className={styles.screen}>
    <Script src="https://accounts.google.com/gsi/client" onReady={() => setReady(true)} onError={() => setError('Google could not load. Check your connection and refresh.')} />
    <div className={`${styles.content} ${!user ? styles.loginContent : editor ? styles.profileContent : styles.settingsContent}`}>
      {loading ? <p role="status">Loading account…</p> : !user ? <div className={styles.login}>
        <div className={styles.brand}><span className={styles.brandMark}>H</span><div><strong>Courtlens</strong><small>ADVOCATE DESK</small></div></div>
        <div className={styles.hero}><p className={styles.eyebrow}>YOUR PRIVATE LEGAL WORKSPACE</p><h1>Practice with clarity.<br /><span>Move with confidence.</span></h1><p className={styles.description}>One secure place for your matters, court updates, and the work that matters next.</p></div>
        <div className={styles.benefits}><p>A workspace tailored to your practice</p><p>Secure access to your tracked matters</p></div>
        <div className={styles.loginFooter}><div className={styles.googleButton} style={busy ? { pointerEvents: 'none', opacity: .5 } : undefined} ref={button} />
          {busy && <p role="status" className={styles.footnote}>Connecting securely...</p>}
          <p className={styles.footnote}>By continuing, you agree to use Courtlens for your professional legal work.</p>
          <div className={styles.legal}><Link href="/privacy">Privacy policy</Link><span>•</span><Link href="/delete-account">Delete account</Link></div>
        </div>
      </div> : editor ? <>
        <header className={styles.header}><button disabled={busy} onClick={editor === 'setup' ? signOut : cancelEditor}>‹ Back</button><button disabled={busy} onClick={cancelEditor}>{editor === 'settings' ? 'Cancel' : 'Skip for now'}</button></header>
        <p className={styles.eyebrow}>MAKE Courtlens YOUR OWN</p><h1>Set up your <br />practice.</h1><p className={styles.description}>These details help Courtlens recognize your matters and personalize your workspace.</p>
        <div className={styles.linked}><span>G</span><div><small>SIGNED IN AS</small><p>{user.email}</p></div></div>
        <form className={styles.profileForm} onSubmit={saveProfile}>
          <label className={styles.field}>Full counsel name<input required autoComplete="name" placeholder="e.g. Adv. Priya Sharma" value={form.counselName} onChange={e => setForm({ ...form, counselName: e.target.value })} /></label>
          <label className={styles.field}>Bar enrollment number<input required placeholder="e.g. UP/1234/2022" value={form.enrollmentNo} onChange={e => setForm({ ...form, enrollmentNo: e.target.value })} /></label>
          <label className={styles.field}>Name aliases <small>OPTIONAL</small><textarea placeholder="Add alternate name spellings, one per line" value={form.aliases} onChange={e => setForm({ ...form, aliases: e.target.value })} /></label>
          <label className={styles.field}>Chamber or firm <small>OPTIONAL</small><textarea placeholder="Add your chamber or firm name" value={form.chamberAliases} onChange={e => setForm({ ...form, chamberAliases: e.target.value })} /></label>
          <button className={styles.save} disabled={busy}>{busy ? 'Saving your profile...' : 'Save and continue'}</button><p className={styles.footnote}>You can update these details anytime from your account settings.</p>
        </form>
      </> : <>
        <header className={styles.header}><Link href="/">‹ Dashboard</Link></header><p className={styles.eyebrow}>ACCOUNT & SETTINGS</p><h1>Your workspace, <br />your way.</h1>
        <div className={styles.identity}><span className={styles.avatar}>{accountName.trim().charAt(0).toUpperCase()}</span><div className={styles.rowCopy}><strong>{accountName}</strong><p>{user.email}</p><span className={styles.badge}>GOOGLE ACCOUNT</span></div></div>
        <div className={styles.settingsGrid}>
        <section><h2>YOUR PRACTICE</h2><div className={styles.card}>{row('P', 'Profile details', profile?.enrollmentNo || 'Add your professional details', 'cyan', openProfile)}</div></section>
        <section><h2>PRIVACY & SECURITY</h2><div className={styles.card}>{row('G', 'Connected account', user.email, 'indigo')}{row('✓', 'Private workspace', 'Your profile is used only for your Courtlens workspace', 'emerald')}</div></section>
        <section><h2>SUPPORT & LEGAL</h2><div className={styles.card}>{row('?', 'Help & support', 'Contact us, privacy policy and legal information', 'slate', undefined, '/support')}</div></section>
        <section><h2>ACCOUNT ACTIONS</h2><div className={styles.card}>{row('↪', 'Log out', 'Sign out from this device', 'slate', signOut)}{row('×', 'Delete account', 'Remove your account and data from Courtlens', 'red', deleteAccount)}</div></section>
        </div>
      </>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </div>
  </main>;
}
