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
import type { Student } from './group';
import { STATUSES, type AttendanceStatus } from './points';
import { scoreFor, type PointsLedger } from './score';

/** How many Sessions a Student took each Attendance Status in. */
export type AttendanceTally = Record<AttendanceStatus, number>;

export interface StudentSummary {
  studentId: string;
  name: string;
  score: number;
  tally: AttendanceTally;
  /** The whole Notes Log, oldest first — what the Students tab should hold
      after this save, not just what was added. */
  notes: string[];
}

/** How many Sessions a Student took each status in. */
export function tallyFor(studentId: string, ledger: PointsLedger): AttendanceTally {
  const tally = Object.fromEntries(STATUSES.map((status) => [status, 0])) as AttendanceTally;
  for (const record of ledger.attendance) {
    if (record.studentId === studentId) tally[record.status] += 1;
  }
  return tally;
}

/** How many Sessions a Student was counted in. The four Attendance Statuses
    are exhaustive, so their total is the Student's own denominator: a Student
    who joined the Group late is not marked down for Sessions before that. */
export function sessionsCounted(tally: AttendanceTally): number {
  return STATUSES.reduce((total, status) => total + tally[status], 0);
}

/** A Student's share of their own Sessions, rounded to a whole percent. No
    Sessions counted is 0%, not a division by zero. */
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
      tally: tallyFor(student.id, ledger),
      notes,
    };
  });
}
