import { NextResponse } from 'next/server';
import { fetchOrders } from '@/lib/orders';

// Server-only route configuration
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = await fetchOrders({
      caseType: String(body.caseType || ''),
      caseNo: String(body.caseNo || ''),
      caseYear: String(body.caseYear || ''),
    });
    return NextResponse.json({ success: true, result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

