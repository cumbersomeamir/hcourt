import Link from 'next/link';
import { Cinzel, Manrope } from 'next/font/google';

const cinzel = Cinzel({
  subsets: ['latin'],
  weight: ['600', '700'],
});

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
});

const statusTiles: Array<{
  label: string;
  href?: string;
  caption: string;
}> = [
  {
    label: 'Case Status Allahabad',
    href: '/orders?mode=quick&city=allahabad',
    caption: 'Open Allahabad quick search',
  },
  {
    label: 'Mediation (Allahabad & Lucknow)',
    caption: 'Mediation module',
  },
  {
    label: 'Case Status Lucknow Bench',
    href: '/orders?mode=quick&city=lucknow',
    caption: 'Open Lucknow quick search',
  },
  {
    label: 'Computerized Copying Folio Application Status',
    caption: 'Copying folio module',
  },
];

export default function StatusPage() {
  return (
    <div
      className={`min-h-screen bg-slate-950 ${manrope.className}`}
      style={{
        backgroundImage:
          'radial-gradient(1200px 420px at 50% -40px, rgba(249,115,22,0.22), transparent 60%), linear-gradient(180deg, #020617 0%, #0b1a3b 58%, #12284a 100%)',
      }}
    >
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:pt-14">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-[0_24px_100px_rgba(0,0,0,0.45)] backdrop-blur-md sm:p-8">
          <div className="mx-auto max-w-4xl text-center">
            <p className="text-xs tracking-[0.28em] text-orange-300/80 sm:text-sm">
              STATUS PORTAL
            </p>
            <h1
              className={`mt-3 text-2xl font-semibold tracking-wide text-orange-400 sm:text-4xl ${cinzel.className}`}
            >
              HIGH COURT OF JUDICATURE AT ALLAHABAD
            </h1>
            <p className="mt-3 text-sm text-slate-300 sm:text-base">
              Choose a status service below
            </p>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-4 sm:mt-10 sm:grid-cols-2">
            {statusTiles.map((tile) =>
              tile.href ? (
                <Link
                  key={tile.label}
                  href={tile.href}
                  className="group relative overflow-hidden rounded-2xl border border-cyan-300/30 bg-slate-900/55 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition duration-200 hover:-translate-y-0.5 hover:border-cyan-200/80 hover:bg-slate-900/75"
                >
                  <div className="absolute -right-14 -top-14 h-32 w-32 rounded-full bg-cyan-300/15 blur-2xl transition group-hover:bg-cyan-300/25" />
                  <p className="relative text-sm font-semibold uppercase tracking-[0.08em] text-cyan-100/95 sm:text-base">
                    {tile.label}
                  </p>
                  <div className="relative mt-3 flex items-center justify-between">
                    <p className="text-xs text-cyan-100/70">{tile.caption}</p>
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-cyan-200/50 text-cyan-100 transition group-hover:border-cyan-100">
                      →
                    </span>
                  </div>
                </Link>
              ) : (
                <div
                  key={tile.label}
                  className="rounded-2xl border border-white/15 bg-slate-900/35 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                >
                  <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-100/90 sm:text-base">
                    {tile.label}
                  </p>
                  <div className="mt-3 flex items-center justify-between">
                    <p className="text-xs text-slate-300/75">{tile.caption}</p>
                    <span className="rounded-full border border-slate-400/40 px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-slate-200/70">
                      Coming Soon
                    </span>
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
