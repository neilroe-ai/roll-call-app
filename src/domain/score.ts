import { attendancePoints, behaviorPoints } from './points';
import type { BehaviorPoint } from './behavior';
import type { AttendanceRecord } from './session';

/** A Student's single running total: attendance points plus behavior points.
    Held points count as 0 until the teacher resolves them, so a Score can rise
    later without any new roll call. */
export function scoreFor(
  studentId: string,
  records: AttendanceRecord[],
  behavior: BehaviorPoint[],
): number {
  const fromAttendance = records
    .filter((record) => record.studentId === studentId)
    .reduce((total, record) => total + attendancePoints(record.pointState), 0);

  const fromBehavior = behavior
    .filter((point) => point.studentId === studentId)
    .reduce((total, point) => total + behaviorPoints(point.kind), 0);

  return fromAttendance + fromBehavior;
}
