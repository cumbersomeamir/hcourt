import Link from 'next/link';

export default function PrivacyPage() {
  return <main className="mx-auto min-h-screen max-w-3xl px-5 py-12 text-slate-200">
    <h1 className="text-3xl font-semibold text-white">Courtlens Privacy Policy</h1>
    <p className="mt-3 text-sm text-slate-400">Effective 14 September 2026</p>
    <div className="mt-8 space-y-5 leading-7">
      <p>Courtlens is operated by Tensorblue Technologies Private Limited, India.</p>
      <p>We process account details, lawyer profile information, tracked case references, AI chat messages, app diagnostics and usage analytics to provide sign-in, court monitoring, personalized assistance, security and support.</p>
      <p>Court records are retrieved from official court sources. Files are stored in Cloudflare R2, application data in MongoDB, and AI requests may be processed by our configured cloud AI provider. We do not sell personal data.</p>
      <p>Data is protected in transit using HTTPS. AI conversations are retained for up to 30 days. Other account data is retained while the account is active or as legally required.</p>
      <p>You may request access, correction or deletion at <a className="text-cyan-300" href="mailto:info@tensorblue.com">info@tensorblue.com</a>.</p>
      <p>Courtlens is not an official app of the Allahabad High Court or any government authority. Verify important information against the official court record.</p>
    </div>
    <div className="mt-10 flex gap-4"><Link className="text-cyan-300" href="/delete-account">Request account deletion</Link><Link className="text-cyan-300" href="/">Back to Courtlens</Link></div>
  </main>;
}
