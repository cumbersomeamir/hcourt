'use client';
import { FormEvent, useState } from 'react';

export default function DeleteAccountPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const response = await fetch('/api/account/deletion-request', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) });
    setMessage(response.ok ? 'Deletion request received. We will process it as soon as reasonably possible.' : 'Request could not be submitted. Email info@tensorblue.com.');
  };
  return <main className="mx-auto min-h-screen max-w-xl px-5 py-12 text-slate-200">
    <h1 className="text-3xl font-semibold text-white">Delete your Courtlens account</h1>
    <p className="mt-4 leading-7 text-slate-400">Submit the email used for Courtlens. Account, profile, tracked-case and AI-chat data will be deleted, except records we must retain by law.</p>
    <form onSubmit={submit} className="mt-8 space-y-4">
      <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Account email" className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3" />
      <button className="rounded-xl bg-red-500/20 px-5 py-3 font-semibold text-red-200">Request deletion</button>
    </form>
    {message && <p className="mt-5 text-sm text-cyan-200">{message}</p>}
  </main>;
}
