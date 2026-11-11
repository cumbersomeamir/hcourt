import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/seo';
import { getBlogSitemapEntries } from '@/models/blog';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages = ['/', '/blogs', '/court-view', '/cause-list', '/orders', '/web-diary', '/support', '/privacy', '/delete-account'].map((path) => ({
    url: new URL(path, siteUrl).href,
  }));
  try {
    const articles = await getBlogSitemapEntries();
    return [...pages, ...articles.map((article) => ({ url: `${siteUrl}/blogs/${article.slug}`, lastModified: article.publishedAt }))];
  } catch {
    return pages;
  }
}
