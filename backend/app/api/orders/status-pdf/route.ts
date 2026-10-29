import { acquirePdfSlot, rateLimit, readRequestJson } from '@/lib/requestSecurity';
import { getAuthenticatedUser } from '@/lib/auth';
import { buildCaseStatusPdf } from '@/lib/orders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let release: (() => Promise<void>) | null = null;
  try {
    const user = getAuthenticatedUser(request);
    if (!user && request.headers.has('authorization')) return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    const limited = await rateLimit('status-pdf-user', 10, 60000, user?.userId || 'guest') || await rateLimit('status-pdf-global', 60);
    if (limited) return limited;
    const record = await readRequestJson(request, 200000);
    if (!/^\d+$/.test(record.caseInfo?.caseNo || '') || !/^\d{4}$/.test(record.caseInfo?.caseYear || '') || !Array.isArray(record.details?.keyValues)) {
      return Response.json({ success: false, error: 'Fetch case details before downloading the status PDF.' }, { status: 400 });
    }
    release = await acquirePdfSlot();
    if (!release) return Response.json({ success: false, error: 'PDF service is busy. Please retry shortly.' }, { status: 429, headers: { 'Retry-After': '5' } });
    const result = await buildCaseStatusPdf(record);
    return Response.json({ success: true, result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ success: false, error: 'Unable to generate the case-status PDF. Please retry.' }, { status: 500 });
  } finally {
    if (release) await release().catch(() => undefined);
  }
}
