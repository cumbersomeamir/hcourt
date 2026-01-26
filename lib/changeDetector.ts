// Server-only module - ensure this is not imported in client code
if (typeof window !== 'undefined') {
  throw new Error('lib/changeDetector.ts can only be used on the server');
}

import { ParsedCourtCase } from './parser';
import { CourtCase, ChangeRecord } from '@/types/court';

export function detectChanges(
  oldCourts: CourtCase[],
  newCourts: ParsedCourtCase[]
): ChangeRecord[] {
  const changes: ChangeRecord[] = [];
  const timestamp = new Date();

  // Create maps for easy lookup
  const oldMap = new Map<string, CourtCase>();
  oldCourts.forEach(court => {
    oldMap.set(court.courtNo, court);
  });

  const newMap = new Map<string, ParsedCourtCase>();
  newCourts.forEach(court => {
    newMap.set(court.courtNo, court);
  });

  // Check for updates and new cases
  newCourts.forEach(newCourt => {
    const oldCourt = oldMap.get(newCourt.courtNo);
    
    if (!oldCourt) {
      // New court case added
      changes.push({
        timestamp,
        courtNo: newCourt.courtNo,
        changeType: 'added',
        newValue: newCourt as CourtCase,
        description: `New case added to Court ${newCourt.courtNo}`,
      });
    } else {
      // Check if status changed (in session / not in session)
      if (oldCourt.isInSession !== newCourt.isInSession) {
        changes.push({
          timestamp,
          courtNo: newCourt.courtNo,
          changeType: 'status_changed',
          oldValue: oldCourt,
          newValue: newCourt as CourtCase,
          description: `Court ${newCourt.courtNo} session status changed from ${oldCourt.isInSession ? 'in session' : 'not in session'} to ${newCourt.isInSession ? 'in session' : 'not in session'}`,
        });
      } else if (oldCourt.isInSession && newCourt.isInSession) {
        // Check for other changes in active cases
        const hasChanged = 
          oldCourt.serialNo !== newCourt.serialNo ||
          oldCourt.list !== newCourt.list ||
          oldCourt.progress !== newCourt.progress ||
          JSON.stringify(oldCourt.caseDetails) !== JSON.stringify(newCourt.caseDetails);

        if (hasChanged) {
          changes.push({
            timestamp,
            courtNo: newCourt.courtNo,
            changeType: 'updated',
            oldValue: oldCourt,
            newValue: newCourt as CourtCase,
            description: `Case details updated in Court ${newCourt.courtNo}`,
          });
        }
      }
    }
  });

  // Check for removed cases
  oldCourts.forEach(oldCourt => {
    if (!newMap.has(oldCourt.courtNo)) {
      changes.push({
        timestamp,
        courtNo: oldCourt.courtNo,
        changeType: 'removed',
        oldValue: oldCourt,
        description: `Case removed from Court ${oldCourt.courtNo}`,
      });
    }
  });

  return changes;
}


