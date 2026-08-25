import { initialPointState, type AttendanceStatus, type PointState } from './points';
import type { Group } from './roster';

/** An ISO 8601 instant, e.g. `2026-08-25T09:05:00+08:00`. */
export type Timestamp = string;

/** One roll call of one Group at a date and time. */
export interface Session {
  id: string;
  groupId: string;
  takenAt: Timestamp;
}

/** One Student's outcome for one Session. */
export interface AttendanceRecord {
  sessionId: string;
  studentId: string;
  status: AttendanceStatus;
  pointState: PointState;
  note?: string;
}

/** The record roll call produces for one Student: the point state follows
    from the status, and the teacher may resolve a held point later. */
export function recordAttendance(
  session: Session,
  studentId: string,
  status: AttendanceStatus,
  note?: string,
): AttendanceRecord {
  const record: AttendanceRecord = {
    sessionId: session.id,
    studentId,
    status,
    pointState: initialPointState(status),
  };
  return note === undefined ? record : { ...record, note };
}

/** Student ids still waiting to be marked in this Session, in Group order. */
export function unmarkedStudentIds(group: Group, records: AttendanceRecord[]): string[] {
  const marked = new Set(records.map((record) => record.studentId));
  return group.studentIds.filter((id) => !marked.has(id));
}
