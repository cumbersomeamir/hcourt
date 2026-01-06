import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const caseIdsParam = searchParams.get('caseIds');
    const userId = searchParams.get('userId');

    // Get tracked case IDs
    let trackedCaseIds: string[] = [];
    
    if (caseIdsParam) {
      // Parse from query parameter (comma-separated)
      trackedCaseIds = caseIdsParam.split(',').map(id => id.trim().toUpperCase()).filter(Boolean);
    } else if (userId) {
      // Fetch from user account
      const db = await getDb();
      const usersCollection = db.collection('users');
      const { ObjectId } = await import('mongodb');
      
      try {
        const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
        if (user && user.caseIds) {
          trackedCaseIds = user.caseIds.map((id: string) => id.toUpperCase());
        }
      } catch (e) {
        // Invalid ObjectId, continue without filtering
      }
    }

    const db = await getDb();
    const scheduleCollection = db.collection('schedules');

    const latestSchedule = await scheduleCollection
      .findOne({}, { sort: { lastUpdated: -1 } });

    if (!latestSchedule) {
      return NextResponse.json({
        success: false,
        error: 'No schedule found',
      }, { status: 404 });
    }

    // Filter by tracked case IDs if any are provided
    let filteredSchedule = latestSchedule;
    if (trackedCaseIds.length > 0) {
      const filteredCourts = (latestSchedule.courts || []).filter((court: any) => {
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
    });
  } catch (error) {
    console.error('Error fetching latest schedule:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}


