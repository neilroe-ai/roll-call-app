/**
 * Scores, and the records they come from.
 */
import { attendancePoints, behaviorPoints } from './points';
import type { Adjustment } from './adjustment';
import type { BehaviorPoint } from './behavior';
import type { AttendanceRecord, Session } from './session';

/** Every Attendance Record and Behavior Point a Score is worked out from. The
    two always travel together, because either alone gives a wrong total. */
export interface PointsLedger {
  attendance: AttendanceRecord[];
  behavior: BehaviorPoint[];
}

export const EMPTY_LEDGER: PointsLedger = { attendance: [], behavior: [] };

/** The part of the Ledger that counts in one Group: Attendance Records from
    that Group's Sessions and Behavior Points given in it. Points are kept by
    Group, so a Student in two Groups earns in each apart.

    A Record whose Session row has not landed belongs to no Group yet, so it
    counts nowhere until it does. */
export function ledgerOf(
  groupId: string,
  ledger: PointsLedger,
  sessions: readonly Session[],
): PointsLedger {
  const theirs = new Set(
    sessions.filter((session) => session.groupId === groupId).map((session) => session.id),
  );
  return {
    attendance: ledger.attendance.filter((record) => theirs.has(record.sessionId)),
    behavior: ledger.behavior.filter((point) => point.groupId === groupId),
  };
}

/** A Student's running total in one Group: attendance points, plus behavior
    points, plus whatever the teacher adjusted by hand. `ledger` is that Group's
    part of the Ledger, from `ledgerOf`. Held points count as 0 until the
    teacher resolves them, so a Score can rise later without any new roll call. */
export function scoreFor(studentId: string, ledger: PointsLedger, adjustment: Adjustment): number {
  const fromAttendance = ledger.attendance
    .filter((record) => record.studentId === studentId)
    .reduce((total, record) => total + attendancePoints(record.pointState), 0);

  const fromBehavior = ledger.behavior
    .filter((point) => point.studentId === studentId)
    .reduce((total, point) => total + behaviorPoints(point.kind), 0);

  return fromAttendance + fromBehavior + adjustment.points;
}
