/**
 * The per-Student report: Score, how the Attendance Statuses fell out, which
 * Groups the Student is in, and their Notes Log.
 *
 * Every figure here is worked out from the Points Ledger and the teacher's
 * Adjustments, so the summary is a report the app rewrites, never a place a
 * total is kept. The Notes Log is the exception: a Note is only ever added, so
 * the list carries forward and the new Notes go on the end.
 *
 * One StudentSummary carries everything both readers need — the Summary tab in
 * the Sheet and the Summary screen on the phone — so the two cannot drift.
 */
import { adjustmentFor, type Adjustment } from './adjustment';
import type { CalendarDate } from './behavior';
import { isMember, type Group, type Student } from './group';
import { emptyCounts, type AttendanceCounts } from './points';
import { scoreFor, type PointsLedger } from './score';
import type { Session } from './session';

export type { AttendanceCounts };

export interface StudentSummary {
  studentId: string;
  name: string;
  /** The Groups the Student belongs to, by name, in Sheet column order. */
  groupNames: string[];
  score: number;
  /** How many Sessions the Student could have been at — the denominator. */
  sessions: number;
  counts: AttendanceCounts;
  /** The whole Notes Log, oldest first — what the Sheet should hold after this
      save, not just what was added. */
  notes: string[];
}

/** One Student's Attendance Counts: what the Ledger recorded, plus whatever the
    teacher adjusted by hand. */
export function countsFor(
  studentId: string,
  ledger: PointsLedger,
  adjustment: Adjustment,
): AttendanceCounts {
  const counts = emptyCounts();
  for (const record of ledger.attendance) {
    if (record.studentId === studentId) counts[record.status] += 1;
  }
  for (const status of Object.keys(counts) as (keyof AttendanceCounts)[]) {
    counts[status] += adjustment.counts[status];
  }
  return counts;
}

/**
 * How many Sessions a Student could have been at: every Session taken for a
 * Group they belong to, plus any the teacher adjusted in.
 *
 * This is the denominator behind the percentages, and it counts Sessions the
 * Student has no Attendance Record for — a Session they were missed in still
 * happened, and hiding it would read as a perfect record. Group membership is
 * as it stands today, so adding a Student to a Group counts them into that
 * Group's past Sessions.
 *
 * An Adjustment adds to it too: a teacher who carries in six weeks of paper
 * attendance has six weeks of Sessions the app never saw, and percentages out
 * of the app's Sessions alone would be far above 100%.
 */
export function sessionsFor(
  studentId: string,
  groups: readonly Group[],
  sessions: readonly Session[],
  adjustment: Adjustment,
): number {
  const theirs = new Set(
    groups.filter((group) => isMember(group, studentId)).map((group) => group.id),
  );
  const recorded = sessions.filter((session) => theirs.has(session.groupId)).length;
  const added = Object.values(adjustment.counts).reduce((total, count) => total + count, 0);
  return recorded + added;
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
 * Everything a summary is worked out from.
 *
 * Bundled rather than passed one by one: the app already holds these together
 * as the Sheet it has read, and a summary needs all of them or none.
 */
export interface SummaryInput {
  students: readonly Student[];
  groups: readonly Group[];
  sessions: readonly Session[];
  ledger: PointsLedger;
  /** The teacher's hand-typed corrections, keyed by student id. */
  adjustments: ReadonlyMap<string, Adjustment>;
  /** The Notes Log already in the Sheet, keyed by student id. */
  notes: ReadonlyMap<string, readonly string[]>;
}

/**
 * The rows to write back to the Summary tab.
 *
 * `ledger` must already include the Attendance Records being saved, and `notes`
 * the Notes already in the Sheet: the result is the finished state of each row,
 * so writing it twice cannot double a Note or a count. Called with no `added`,
 * it reports what the Ledger already says.
 */
export function summarize(input: SummaryInput, added?: AddedNotes): StudentSummary[] {
  return input.students.map((student) => {
    const adjustment = adjustmentFor(student.id, input.adjustments);
    const addition = added?.byStudent.get(student.id);
    const notes = [...(input.notes.get(student.id) ?? [])];
    if (added !== undefined && addition !== undefined && addition.trim() !== '') {
      notes.push(noteEntry(added.on, addition));
    }
    return {
      studentId: student.id,
      name: student.name,
      groupNames: input.groups
        .filter((group) => isMember(group, student.id))
        .map((group) => group.name),
      score: scoreFor(student.id, input.ledger, adjustment),
      sessions: sessionsFor(student.id, input.groups, input.sessions, adjustment),
      counts: countsFor(student.id, input.ledger, adjustment),
      notes,
    };
  });
}
