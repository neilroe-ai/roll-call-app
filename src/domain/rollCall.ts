/**
 * A roll call in progress: the Session, who is in it, and what the teacher has
 * marked so far. Pure data, so the state of a half-marked Session is testable
 * without a browser (ADR 0005).
 *
 * Marks are held here until the teacher saves. Changing a mark before saving is
 * ordinary — the teacher taps the wrong row, or a Student walks in late.
 */
import type { AttendanceStatus } from './points';
import type { Group, Student } from './roster';
import { recordAttendance, type AttendanceRecord, type Session } from './session';

export interface RollCall {
  session: Session;
  /** The Students to mark, in Group order. */
  roll: Student[];
  /** Marks so far, keyed by student id. */
  marks: ReadonlyMap<string, AttendanceRecord>;
}

/** Begin marking a Group. Ids with no matching Student are left out of the roll
    rather than shown as a blank row. */
export function beginRollCall(session: Session, group: Group, students: Student[]): RollCall {
  const byId = new Map(students.map((student) => [student.id, student]));
  const roll = group.studentIds
    .map((id) => byId.get(id))
    .filter((student): student is Student => student !== undefined);
  return { session, roll, marks: new Map() };
}

/** Mark one Student. Marking again replaces the earlier mark. */
export function mark(
  rollCall: RollCall,
  studentId: string,
  status: AttendanceStatus,
  note?: string,
): RollCall {
  const marks = new Map(rollCall.marks);
  marks.set(studentId, recordAttendance(rollCall.session, studentId, status, note));
  return { ...rollCall, marks };
}

/** Undo a mark, putting the Student back among the unmarked. */
export function unmark(rollCall: RollCall, studentId: string): RollCall {
  const marks = new Map(rollCall.marks);
  marks.delete(studentId);
  return { ...rollCall, marks };
}

/** What the teacher chose for a Student, if anything yet. */
export function markOf(rollCall: RollCall, studentId: string): AttendanceRecord | undefined {
  return rollCall.marks.get(studentId);
}

/** Students still to mark, in roll order. */
export function remaining(rollCall: RollCall): Student[] {
  return rollCall.roll.filter((student) => !rollCall.marks.has(student.id));
}

/** Every Student marked. Only then is the roll call worth saving. */
export function isComplete(rollCall: RollCall): boolean {
  return remaining(rollCall).length === 0;
}

/** The records to write, in roll order rather than tap order, so the Sheet
    reads down the class list the way the teacher expects. */
export function recordsToSave(rollCall: RollCall): AttendanceRecord[] {
  return rollCall.roll
    .map((student) => rollCall.marks.get(student.id))
    .filter((record): record is AttendanceRecord => record !== undefined);
}
