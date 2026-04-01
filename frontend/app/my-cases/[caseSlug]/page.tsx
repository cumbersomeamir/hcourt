import CaseProfilePage from '@/views/pages/CaseProfilePage';

export default async function Page({
  params,
}: {
  params: Promise<{ caseSlug: string }>;
}) {
  const { caseSlug } = await params;
  return <CaseProfilePage caseSlug={caseSlug} />;
}
