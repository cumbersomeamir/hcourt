export interface CourtCase {
  courtNo: string;
  serialNo: string | null;
  list: string | null;
  progress: string | null;
  caseDetails: {
    caseNumber: string;
    title: string;
    petitionerCounsels: string[];
    respondentCounsels: string[];
  } | null;
  isInSession: boolean;
}

export interface CourtSchedule {
  date: string;
  lastUpdated: Date;
  courts: CourtCase[];
}

export interface ChangeRecord {
  _id?: string;
  timestamp: Date;
  courtNo: string;
  changeType: 'added' | 'updated' | 'removed' | 'status_changed';
  oldValue?: CourtCase;
  newValue?: CourtCase;
  description: string;
}

export interface Notification {
  _id?: string;
  timestamp: Date;
  courtNo: string;
  type: 'change' | 'new_case' | 'status_change';
  title: string;
  message: string;
  changeRecordId?: string;
  read: boolean;
}


