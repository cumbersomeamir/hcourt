import { getDb } from '@/lib/mongodb';

const projection = { _id: 0, slug: 1, title: 1, summary: 1, category: 1, sections: 1, source: 1, image: 1, publishedAt: 1, status: 1 };

export async function listBlogs(sitemap = false) {
  const cursor = (await getDb()).collection('blog_articles')
    .find({ status: 'published' }, { projection: sitemap ? { _id: 0, slug: 1, publishedAt: 1 } : projection })
    .sort({ publishedAt: -1 });
  return (sitemap ? cursor : cursor.limit(100)).toArray();
}

export async function findBlog(slug: string) {
  return (await getDb()).collection('blog_articles').findOne({ slug, status: 'published' }, { projection });
}
