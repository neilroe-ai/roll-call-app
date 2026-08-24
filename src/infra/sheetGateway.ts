import type { AttendanceStatus, PointState } from '../domain/points';

/** One attendance row as stored in the Google Sheet. */
export interface AttendanceRow {
  studentId: string;
  sessionId: string;
  status: AttendanceStatus;
  /** Stored, not derived: a held point is resolved by the teacher, so the
      current state cannot be recomputed from the status alone. */
  pointState: PointState;
  note?: string;
}

/** Port for the Google Sheet that backs the app. Implemented in a later step. */
export interface SheetGateway {
  appendAttendance(row: AttendanceRow): Promise<void>;
  listAttendance(sessionId: string): Promise<AttendanceRow[]>;
}
