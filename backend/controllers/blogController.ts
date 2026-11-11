import { findBlog, listBlogs } from '@/models/blogModel';

export async function GET(request: Request) {
  try {
    return Response.json({ articles: await listBlogs(new URL(request.url).searchParams.get('sitemap') === '1') }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Articles are temporarily unavailable.' }, { status: 503 });
  }
}

export async function getArticle(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,120}$/.test(slug)) return Response.json({ error: 'Article not found.' }, { status: 404 });
  try {
    const article = await findBlog(slug);
    return article ? Response.json({ article }, { headers: { 'Cache-Control': 'no-store' } }) : Response.json({ error: 'Article not found.' }, { status: 404 });
  } catch {
    return Response.json({ error: 'Article is temporarily unavailable.' }, { status: 503 });
  }
}
