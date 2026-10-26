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
  type: 'change' | 'new_case' | 'status_change' | 'order_update';
  title: string;
  message: string;
  changeRecordId?: string;
  orderTrackingKey?: string;
  orderJudgment?: {
    viewUrl: string;
    date: string;
    judgmentId: string;
  };
  metadata?: {
    city?: string;
    caseType?: string;
    caseTypeLabel?: string;
    caseNo?: string;
    caseYear?: string;
  };
  read: boolean;
}

export interface TrackedOrderCase {
  city: 'lucknow' | 'allahabad';
  caseType: string;
  caseTypeLabel?: string;
  caseNo: string;
  caseYear: string;
  trackingKey: string;
}

export interface CourtHistoryRecord {
  _id?: string;
  date: string;
  courtNo: string;
  timestamp: Date | string;
  serialNo: string | null;
  list: string | null;
  progress: string | null;
  isInSession: boolean;
  caseDetails: CourtCase['caseDetails'] | null;
  state: CourtCase;
  source: string;
}
