import JudgmentViewerPage from '@/views/pages/JudgmentViewerPage';
import { privatePageMetadata } from '@/lib/seo';

export const metadata = privatePageMetadata;

export default async function Page(props: {
  searchParams?: Promise<{
    viewUrl?: string;
    date?: string;
    page?: string;
    title?: string;
  }>;
}) {
  const searchParams = (await props.searchParams) || {};

  return (
    <JudgmentViewerPage
      viewUrl={String(searchParams.viewUrl || '')}
      date={String(searchParams.date || '') || null}
      page={searchParams.page ? Number(searchParams.page) : null}
      title={String(searchParams.title || '') || null}
    />
  );
}
