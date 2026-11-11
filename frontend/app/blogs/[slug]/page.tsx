import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getBlog } from '@/models/blog';
import { publicPageMetadata, siteUrl } from '@/lib/seo';

export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const article = await getBlog(slug);
  if (!article) return { title: 'Article Not Found', robots: { index: false } };
  const metadata = publicPageMetadata(`/blogs/${article.slug}`, article.title, article.summary);
  return {
    ...metadata,
    openGraph: { ...metadata.openGraph, type: 'article', publishedTime: article.publishedAt, ...(article.image ? { images: [{ url: article.image.url, alt: article.image.alt }] } : {}) },
  };
}

export default async function BlogPage({ params }: Props) {
  const { slug } = await params;
  const article = await getBlog(slug);
  if (!article) notFound();
  const structuredData = {
    '@context': 'https://schema.org', '@type': 'BlogPosting',
    headline: article.title, description: article.summary,
    datePublished: article.publishedAt,
    author: { '@type': 'Organization', name: 'Courtlens' },
    publisher: { '@type': 'Organization', name: 'Courtlens', url: siteUrl },
    mainEntityOfPage: `${siteUrl}/blogs/${article.slug}`,
    citation: article.source.url,
    ...(article.image ? { image: article.image.url } : {}),
  };
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 py-8 sm:py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }} />
      <Link href="/blogs" className="text-sm text-cyan-300 hover:text-cyan-100">← All blogs</Link>
      <article className="mt-6 rounded-[1.7rem] border border-slate-700/50 bg-slate-900/70 p-5 sm:p-8">
        <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">{article.category}</p>
        <h1 className="mt-3 text-3xl font-semibold leading-tight text-slate-50 sm:text-4xl">{article.title}</h1>
        <p className="mt-4 text-xs text-slate-500">Courtlens · AI-generated · <time dateTime={article.publishedAt}>{new Date(article.publishedAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric' })}</time></p>
        <p className="mt-6 text-lg leading-8 text-slate-300">{article.summary}</p>
        {article.image && <figure className="mt-6"><Image src={article.image.url} alt={article.image.alt} width={1200} height={675} unoptimized className="h-auto w-full rounded-xl" /><figcaption className="mt-2 text-xs text-slate-500">Image: {article.image.credit}</figcaption></figure>}
        {article.sections.map((section, index) => <section key={index} className="mt-8"><h2 className="text-xl font-semibold text-slate-100">{section.heading}</h2>{section.paragraphs.map((paragraph, i) => <p key={i} className="mt-3 text-base leading-8 text-slate-300">{paragraph}</p>)}</section>)}
        <footer className="mt-8 border-t border-slate-700/60 pt-6">
          <h2 className="font-semibold text-slate-100">Original source</h2>
          <a href={article.source.url} target="_blank" rel="noopener noreferrer" className="mt-2 block text-sm leading-6 text-cyan-300 hover:underline">{article.source.title} — {article.source.name}</a>
          <p className="mt-2 text-xs text-slate-500">Source date: {new Date(article.source.publishedAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
          <p className="mt-4 text-xs leading-6 text-slate-500">AI-generated explanation, not legal advice. Verify critical details with the original source. Courtlens is not an official court or government service.</p>
        </footer>
      </article>
    </main>
  );
}
