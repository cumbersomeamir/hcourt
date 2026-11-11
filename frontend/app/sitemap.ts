import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/seo';

export default function sitemap(): MetadataRoute.Sitemap {
  return ['/', '/court-view', '/cause-list', '/orders', '/web-diary', '/support', '/privacy', '/delete-account'].map((path) => ({
    url: new URL(path, siteUrl).href,
  }));
}
