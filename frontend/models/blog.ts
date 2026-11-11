import 'server-only';
import { cache } from 'react';
import { buildUpstreamUrl } from '@/lib/ordersApiProxy';
import type { BlogArticle } from '@/types/blog';

async function fetchBlogs(path: string) {
  return fetch(buildUpstreamUrl(path), { cache: 'no-store', signal: AbortSignal.timeout(15000) });
}

export async function getBlogs(): Promise<BlogArticle[]> {
  const response = await fetchBlogs('/api/blogs');
  if (!response.ok) throw new Error('Articles are temporarily unavailable.');
  return (await response.json()).articles as BlogArticle[];
}

export const getBlog = cache(async (slug: string): Promise<BlogArticle | null> => {
  if (!/^[a-z0-9-]{1,120}$/.test(slug)) return null;
  const response = await fetchBlogs(`/api/blogs/${slug}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Article is temporarily unavailable.');
  return (await response.json()).article as BlogArticle;
});

export async function getBlogSitemapEntries() {
  const response = await fetchBlogs('/api/blogs?sitemap=1');
  if (!response.ok) throw new Error('Articles are temporarily unavailable.');
  return (await response.json()).articles as Pick<BlogArticle, 'slug' | 'publishedAt'>[];
}
