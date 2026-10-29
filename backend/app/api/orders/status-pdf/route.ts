import { buildCaseStatusPdf } from '@/lib/orders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.text();
    if (body.length > 200000) return Response.json({ success: false, error: 'Case data is too large.' }, { status: 413 });
    const record = JSON.parse(body);
    if (!/^\d+$/.test(record.caseInfo?.caseNo || '') || !/^\d{4}$/.test(record.caseInfo?.caseYear || '') || !Array.isArray(record.details?.keyValues)) {
      return Response.json({ success: false, error: 'Fetch case details before downloading the status PDF.' }, { status: 400 });
    }
    const result = await buildCaseStatusPdf(record);
    return Response.json({ success: true, result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ success: false, error: 'Unable to generate the case-status PDF. Please retry.' }, { status: 500 });
  }
}
