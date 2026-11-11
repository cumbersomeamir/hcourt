import type { Metadata } from 'next';

export const siteUrl = 'https://courtlens.website';

export function publicPageMetadata(path: string, title: string, description: string): Metadata {
  const url = new URL(path, siteUrl).href;
  return {
    title: path === '/' ? { absolute: title } : title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      url,
      siteName: 'Courtlens',
      title,
      description,
      locale: 'en_IN',
    },
    twitter: { card: 'summary', title, description },
  };
}

export const privatePageMetadata: Metadata = {
  robots: { index: false, follow: false },
};
