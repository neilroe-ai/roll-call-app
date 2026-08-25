/**
 * The per-Student summary the Students tab shows: Score, how the Attendance
 * Statuses fell out, and the Student's Notes Log.
 *
 * Every figure here is worked out from the Points Ledger, so the summary is a
 * report the app rewrites, never a place a total is kept. The Notes Log is the
 * exception: a Note is only ever added, so the list carries forward and the new
 * Notes go on the end.
 */
import type { CalendarDate } from './behavior';
import { isMember, type Group, type Student } from './group';
import { STATUSES, type AttendanceStatus } from './points';
import { scoreFor, type PointsLedger } from './score';
import type { Session } from './session';

/** A Student's Attendance Counts: how many Sessions they took each Attendance
    Status in. */
export type AttendanceCounts = Record<AttendanceStatus, number>;

export interface StudentSummary {
  studentId: string;
  name: string;
  score: number;
  counts: AttendanceCounts;
  /** The whole Notes Log, oldest first — what the Students tab should hold
      after this save, not just what was added. */
  notes: string[];
}

/** One Student's Attendance Counts, worked out from the Ledger. */
export function countsFor(studentId: string, ledger: PointsLedger): AttendanceCounts {
  const counts = Object.fromEntries(STATUSES.map((status) => [status, 0])) as AttendanceCounts;
  for (const record of ledger.attendance) {
    if (record.studentId === studentId) counts[record.status] += 1;
  }
  return counts;
}

/**
 * How many Sessions a Student could have been at: every Session taken for a
 * Group they belong to.
 *
 * This is the denominator behind the percentages, and it counts Sessions the
 * Student has no Attendance Record for — a Session they were missed in still
 * happened, and hiding it would read as a perfect record. Group membership is
 * as it stands today, so adding a Student to a Group counts them into that
 * Group's past Sessions.
 */
export function sessionsFor(
  studentId: string,
  groups: readonly Group[],
  sessions: readonly Session[],
): number {
  const theirs = new Set(
    groups.filter((group) => isMember(group, studentId)).map((group) => group.id),
  );
  return sessions.filter((session) => theirs.has(session.groupId)).length;
}

/** A count as a share of the Sessions it is out of, to a whole percent. No
    Sessions is 0%, not a division by zero. */
export function shareOf(count: number, sessions: number): number {
  return sessions === 0 ? 0 : Math.round((count / sessions) * 100);
}

/** One line of a Notes Log: the date, then what the teacher wrote. Dated so a
    list of them stays readable once it is several lessons long. */
export function noteEntry(date: CalendarDate, note: string): string {
  return `${date}: ${note.trim()}`;
}

/** Notes written during a roll call, keyed by student id, and the date they
    were written on. Left out when nothing new is being added. */
export interface AddedNotes {
  on: CalendarDate;
  byStudent: ReadonlyMap<string, string>;
}

/**
 * The rows to write back to the Students tab.
 *
 * `ledger` must already include the Attendance Records being saved, and
 * `existingNotes` the Notes already in the Sheet: the result is the finished
 * state of each row, so writing it twice cannot double a Note or a count.
 * Called with no `added`, it reports what the Ledger already says.
 */
export function summarize(
  students: readonly Student[],
  ledger: PointsLedger,
  existingNotes: ReadonlyMap<string, readonly string[]>,
  added?: AddedNotes,
): StudentSummary[] {
  return students.map((student) => {
    const addition = added?.byStudent.get(student.id);
    const notes = [...(existingNotes.get(student.id) ?? [])];
    if (added !== undefined && addition !== undefined && addition.trim() !== '') {
      notes.push(noteEntry(added.on, addition));
    }
    return {
      studentId: student.id,
      name: student.name,
      score: scoreFor(student.id, ledger),
      counts: countsFor(student.id, ledger),
      notes,
    };
  });
}
