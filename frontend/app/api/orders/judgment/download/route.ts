import { Buffer } from 'node:buffer';
import { NextRequest } from 'next/server';
import { buildUpstreamUrl } from '@/lib/ordersApiProxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const viewUrl = request.nextUrl.searchParams.get('viewUrl') || '';
  const date = request.nextUrl.searchParams.get('date') || '';
  if (!viewUrl) return Response.json({ success: false }, { status: 400 });

  const upstream = await fetch(buildUpstreamUrl('/api/orders/judgment'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ viewUrl, date }),
    cache: 'no-store',
  });
  const data = await upstream.json();
  if (!upstream.ok || !data.success || !data.result?.base64) {
    return Response.json({ success: false }, { status: upstream.status || 502 });
  }

  const filename = String(data.result.filename || 'hcourt-order.pdf').replace(/["\r\n]/g, '');
  return new Response(Buffer.from(String(data.result.base64), 'base64'), {
    headers: {
      'Content-Type': String(data.result.mimeType || 'application/pdf'),
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
