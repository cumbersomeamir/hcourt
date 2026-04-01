import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getAdminCatalog } from '@/lib/adminCatalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = await getDb();
    const overview = await getAdminCatalog(db);
    return NextResponse.json({
      success: true,
      overview,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
