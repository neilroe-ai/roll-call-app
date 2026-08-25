/**
 * Scores, and the records they come from.
 */
import { attendancePoints, behaviorPoints } from './points';
import type { BehaviorPoint } from './behavior';
import type { AttendanceRecord } from './session';

/** Every Attendance Record and Behavior Point a Score is worked out from. The
    two always travel together, because either alone gives a wrong total. */
export interface PointsLedger {
  attendance: AttendanceRecord[];
  behavior: BehaviorPoint[];
}

export const EMPTY_LEDGER: PointsLedger = { attendance: [], behavior: [] };

/** A Student's single running total: attendance points plus behavior points.
    Held points count as 0 until the teacher resolves them, so a Score can rise
    later without any new roll call. */
export function scoreFor(studentId: string, ledger: PointsLedger): number {
  const fromAttendance = ledger.attendance
    .filter((record) => record.studentId === studentId)
    .reduce((total, record) => total + attendancePoints(record.pointState), 0);

  const fromBehavior = ledger.behavior
    .filter((point) => point.studentId === studentId)
    .reduce((total, point) => total + behaviorPoints(point.kind), 0);

  return fromAttendance + fromBehavior;
}
