import { NextResponse } from 'next/server';
import { fetchCaseTypes } from '@/models/ordersModel';

// Ensure this is server-only
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const city = searchParams.get('city') || 'lucknow';
    const types = await fetchCaseTypes(city);
    return NextResponse.json({ success: true, types });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
