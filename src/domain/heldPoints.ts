/**
 * The Held Points waiting on the teacher.
 *
 * A `sick` or `other` mark scores 0 until she says whether the documentation
 * arrived. Nothing expires, so these accumulate quietly: a Student can be
 * carrying a term's worth of points that only look lost. This module is the
 * list of what is still undecided, worked out from the Snapshot rather than
 * tracked anywhere, so it cannot fall out of step with the Sheet.
 */
import { calendarDateOf, type CalendarDate } from './behavior';
import type { AttendanceStatus } from './points';
import type { Snapshot } from './snapshot';

/** One Held Point, with everything needed to settle it without opening the
    Sheet: who, when, what was marked, and what the teacher wrote at the time. */
export interface HeldPoint {
  sessionId: string;
  studentId: string;
  studentName: string;
  status: AttendanceStatus;
  /** When the roll was taken, or nothing if the Session row has not landed —
      an Attendance Record can outrun its Session by one failed write. */
  on?: CalendarDate;
  note?: string;
}

/**
 * Every Held Point still to settle, oldest first.
 *
 * Oldest first because the oldest is the one a Student has been carrying
 * longest. A Record whose Session row is missing has no date to place it by, so
 * it goes last rather than being hidden — it scores nothing either way, and a
 * point the teacher cannot see is a point she cannot award.
 *
 * A Record for a Student no longer on the Students tab is left out. There is
 * nobody to award it to, and every other screen counts the same Students.
 */
export function heldPoints(snapshot: Snapshot): HeldPoint[] {
  const names = new Map(snapshot.students.map((student) => [student.id, student.name]));
  const dates = new Map(
    snapshot.sessions.map((session) => [session.id, calendarDateOf(new Date(session.takenAt))]),
  );

  const held: HeldPoint[] = [];
  for (const record of snapshot.ledger.attendance) {
    if (record.pointState !== 'held') continue;
    const studentName = names.get(record.studentId);
    if (studentName === undefined) continue;

    const on = dates.get(record.sessionId);
    held.push({
      sessionId: record.sessionId,
      studentId: record.studentId,
      studentName,
      status: record.status,
      ...(on === undefined ? {} : { on }),
      ...(record.note === undefined ? {} : { note: record.note }),
    });
  }

  return held.sort(oldestFirst);
}

function oldestFirst(one: HeldPoint, other: HeldPoint): number {
  if (one.on === undefined) return other.on === undefined ? 0 : 1;
  if (other.on === undefined) return -1;
  return one.on.localeCompare(other.on);
}
