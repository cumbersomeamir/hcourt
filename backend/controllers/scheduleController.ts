import { NextResponse } from 'next/server';
import { parseCourtSchedule } from '@/models/parserModel';
import { getDb } from '@/models/mongodbModel';
import { CourtCase } from '@/types/court';

// Server-only route configuration
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COURT_VIEW_URL = 'https://courtview2.allahabadhighcourt.in/courtview/CourtViewLucknow.do';

export async function GET() {
  try {
    // Fetch the court schedule page
    const response = await fetch(COURT_VIEW_URL, {
      next: { revalidate: 0 }, // Always fetch fresh data
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.statusText}`);
    }

    const html = await response.text();
    const courts = parseCourtSchedule(html);

    // Get current date
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];

    // Save to database
    const db = await getDb();
    const scheduleCollection = db.collection('schedules');
    
    // Convert to CourtCase format for storage
    const courtsToStore: CourtCase[] = courts.map(court => ({
      ...court,
      caseDetails: court.caseDetails,
    }));

    await scheduleCollection.insertOne({
      date: dateStr,
      lastUpdated: now,
      courts: courtsToStore,
    });

    return NextResponse.json({
      success: true,
      date: dateStr,
      lastUpdated: now,
      courts: courtsToStore,
    });
  } catch (error) {
    console.error('Error fetching schedule:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}


