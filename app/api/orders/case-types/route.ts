import { NextResponse } from 'next/server';
import { fetchCaseTypes } from '@/lib/orders';

export async function GET() {
  try {
    const types = await fetchCaseTypes();
    return NextResponse.json({ success: true, types });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

