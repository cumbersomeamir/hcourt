import { NextResponse } from 'next/server';
import { parseCourtSchedule } from '@/lib/parser';
import { getDb } from '@/lib/mongodb';
import { CourtCase } from '@/types/court';

/**
 * Upload HTML from client and parse/save to database
 * This bypasses Vercel's SSL issues by having the browser fetch directly
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { html } = body;

    if (!html || typeof html !== 'string') {
      return NextResponse.json(
        { success: false, error: 'HTML content is required' },
        { status: 400 }
      );
    }

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
      courts: courtsToStore.length,
    });
  } catch (error) {
    console.error('Error processing uploaded HTML:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

