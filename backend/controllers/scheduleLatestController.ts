import { NextResponse } from 'next/server';
import { getDb } from '@/models/mongodbModel';
import { CourtCase } from '@/types/court';
import { normalizeCaseIds } from '@/lib/tracking';
import { syncSchedule } from '@/lib/scheduleSync';

// Server-only route configuration
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const caseIdsParam = searchParams.get('caseIds');
    const userId = searchParams.get('userId');
    const forceRefresh = ['1', 'true', 'yes'].includes(
      String(searchParams.get('force') || '').toLowerCase()
    );

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
    const latestResult = await syncSchedule({
      db,
      force: forceRefresh,
      source: forceRefresh ? 'schedule_latest_force' : 'schedule_latest',
    });
    const latestSchedule = latestResult.schedule;

    if (!latestSchedule) {
      return NextResponse.json({
        success: false,
        error: 'No schedule found',
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
    });
  } catch (error) {
    console.error('Error fetching latest schedule:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
