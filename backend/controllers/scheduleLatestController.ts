import { NextResponse } from 'next/server';
import { getDb } from '@/models/mongodbModel';
import { CourtCase } from '@/types/court';
import { normalizeCaseIds } from '@/lib/tracking';
import { getStoredScheduleByDate, syncSchedule } from '@/lib/scheduleSync';

// Server-only route configuration
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const caseIdsParam = searchParams.get('caseIds');
    const userId = searchParams.get('userId');
    const bench = searchParams.get('bench') === 'allahabad' ? 'allahabad' : 'lucknow';
    const forceRefresh = ['1', 'true', 'yes'].includes(
      String(searchParams.get('force') || '').toLowerCase()
    );

    const date = searchParams.get('date');
    if (date) {
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
      const earliest = new Date(today + 'T12:00:00Z');
      earliest.setUTCDate(earliest.getUTCDate() - 5);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < earliest.toISOString().slice(0, 10) || date > today || new Date(date + 'T12:00:00Z').toISOString().slice(0, 10) !== date) {
        return NextResponse.json({ success: false, error: 'Choose today or one of the previous five dates.' }, { status: 400 });
      }
    }

    // Get tracked case IDs
    let trackedCaseIds: string[] = [];
    
    if (caseIdsParam) {
      // Parse from query parameter (comma-separated)
      trackedCaseIds = normalizeCaseIds(caseIdsParam.split(','));
    } else if (userId) {
      // Fetch from user account
      const db = await getDb();
      const usersCollection = db.collection('users');
      const { ObjectId } = await import('mongodb');
      
      try {
        const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
        if (user && user.caseIds) {
          trackedCaseIds = normalizeCaseIds(user.caseIds);
        }
      } catch {
        // Invalid ObjectId, continue without filtering
      }
    }

    const db = await getDb();
    const latestResult = date
      ? { schedule: await getStoredScheduleByDate(db, date, bench), refreshed: false, stale: false, warning: undefined }
      : await syncSchedule({
      db,
      force: forceRefresh,
      source: forceRefresh ? 'schedule_latest_force' : 'schedule_latest',
      bench,
    });
    const latestSchedule = latestResult.schedule;

    if (!latestSchedule) {
      return NextResponse.json({
        success: false,
        error: date ? `No saved court view available for ${date}.` : 'No schedule found',
      }, { status: 404 });
    }

    // Filter by tracked case IDs if any are provided
    let filteredSchedule = latestSchedule;
    if (trackedCaseIds.length > 0) {
      const courts = (latestSchedule.courts || []) as CourtCase[];
      const filteredCourts = courts.filter((court) => {
        if (!court.caseDetails || !court.caseDetails.caseNumber) {
          return false; // Skip courts without case details
        }
        const caseNumber = court.caseDetails.caseNumber.toUpperCase();
        return trackedCaseIds.includes(caseNumber);
      });
      
      filteredSchedule = {
        ...latestSchedule,
        courts: filteredCourts,
      };
    }

    return NextResponse.json({
      success: true,
      schedule: filteredSchedule,
      refreshed: latestResult.refreshed,
      stale: latestResult.stale,
      warning: latestResult.warning,
      bench,
    });
  } catch (error) {
    console.error('Error fetching latest schedule:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
