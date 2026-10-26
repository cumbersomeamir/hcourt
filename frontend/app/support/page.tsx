import Link from 'next/link';

export default function SupportPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 py-12 text-slate-200">
      <Link href="/" className="text-sm text-cyan-300">Back to home</Link>
      <h1 className="mt-6 text-3xl font-semibold text-white">Courtlens Support</h1>
      <p className="mt-6 leading-7">For questions, technical issues, or account help, contact Tensorblue Technologies Private Limited.</p>
      <a href="mailto:info@tensorblue.com" className="mt-3 inline-block text-cyan-300">info@tensorblue.com</a>
      <p className="mt-4 leading-7">Include your app version, device model, and a description of the issue. Do not send passwords or confidential case documents.</p>
      <p className="mt-8 leading-7">Courtlens is not an official court or government app. Verify critical information with official court records.</p>
      <div className="mt-6 flex gap-6">
        <Link href="/privacy" className="text-cyan-300">Privacy Policy</Link>
        <Link href="/delete-account" className="text-cyan-300">Delete Account</Link>
      </div>
    </main>
  );
}
