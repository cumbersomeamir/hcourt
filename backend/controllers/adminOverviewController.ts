export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({ success: false, error: 'This endpoint is disabled.' }, { status: 410, headers: { 'Cache-Control': 'no-store' } });
}
