export type BlogArticle = {
  slug: string;
  title: string;
  summary: string;
  category: string;
  sections: { heading: string; paragraphs: string[] }[];
  source: { name: string; title: string; url: string; publishedAt: string };
  image?: { url: string; alt: string; credit: string };
  publishedAt: string;
  status: 'published';
};
