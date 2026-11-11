import Link from 'next/link';
import Image from 'next/image';
import { getBlogs } from '@/models/blog';
import { publicPageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';
export const metadata = publicPageMetadata('/blogs', 'Legal News & Blogs', 'Read source-linked legal updates, court news, and explanations of Indian legal developments on Courtlens.');

export default async function BlogsPage() {
  let articles: Awaited<ReturnType<typeof getBlogs>> = [];
  let unavailable = false;
  try { articles = await getBlogs(); } catch { unavailable = true; }
  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
      <Link href="/" className="text-sm text-cyan-300 hover:text-cyan-100">← Home</Link>
      <header className="mt-6 rounded-[1.7rem] border border-cyan-300/18 bg-gradient-to-br from-slate-900 via-slate-950 to-cyan-950/50 p-6 sm:p-9">
        <p className="text-xs uppercase tracking-[0.28em] text-cyan-300">Courtlens Journal</p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-50 sm:text-4xl">Legal News &amp; Blogs</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">Court updates and Indian legal developments, explained clearly with links to official sources.</p>
      </header>
      {articles.length ? (
        <section aria-label="Latest articles" className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((article) => (
            <Link key={article.slug} href={`/blogs/${article.slug}`} className="overflow-hidden rounded-2xl border border-slate-700/50 bg-slate-900/70 transition hover:border-cyan-300/40">
              {article.image && <Image src={article.image.url} alt={article.image.alt} width={720} height={400} unoptimized className="h-48 w-full object-cover" />}
              <div className="p-5">
                <p className="text-xs uppercase tracking-wider text-cyan-300">{article.category}</p>
                <h2 className="mt-3 text-xl font-semibold leading-snug text-slate-50">{article.title}</h2>
                <p className="mt-3 text-sm leading-6 text-slate-400">{article.summary}</p>
                <p className="mt-5 text-xs text-slate-500">{new Date(article.publishedAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' })} · {article.source.name}</p>
                <span className="mt-4 inline-block text-sm font-medium text-cyan-300">Read article →</span>
              </div>
            </Link>
          ))}
        </section>
      ) : (
        <div role={unavailable ? 'status' : undefined} className="mt-6 rounded-2xl border border-slate-700/50 bg-slate-900/70 p-8 text-slate-400">
          {unavailable ? 'Articles are temporarily unavailable. Please try again shortly.' : 'Our first legal updates are on the way. Check back soon.'}
        </div>
      )}
      <p className="mt-8 text-xs leading-5 text-slate-500">Articles are AI-generated from linked sources. Courtlens is an independent service. Verify critical details with the original source; articles are not legal advice.</p>
    </main>
  );
}
