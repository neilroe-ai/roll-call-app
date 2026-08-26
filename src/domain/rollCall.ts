/**
 * A roll call in progress: the Session, who is in it, and what the teacher has
 * marked so far. Pure data, so the state of a half-marked Session is testable
 * without a browser (ADR 0005).
 *
 * Marks are held here until the teacher saves. Changing a mark before saving is
 * ordinary — the teacher taps the wrong row, or a Student walks in late.
 *
 * Notes are kept apart from marks so one can be written before the other, and
 * a Note survives a change of status: it explains the Student, not the tap. A
 * Note on an unmarked Student is saved too, to that Student's Notes Log.
 */
import type { AttendanceStatus } from './points';
import { membersOf, type Group, type Student } from './group';
import { recordAttendance, type AttendanceRecord, type Session } from './session';

export interface RollCall {
  session: Session;
  /** The Students to mark, in Group order. */
  roll: Student[];
  /** Marks so far, keyed by student id. */
  marks: ReadonlyMap<string, AttendanceRecord>;
  /** Notes so far, keyed by student id. A Student may have one before being
      marked, and keeps it when the mark changes. */
  notes: ReadonlyMap<string, string>;
}

/** Begin marking a Group. Ids with no matching Student are left out of the roll
    rather than shown as a blank row. */
export function beginRollCall(
  session: Session,
  group: Group,
  students: readonly Student[],
): RollCall {
  return { session, roll: membersOf(group, students), marks: new Map(), notes: new Map() };
}

/** Mark one Student. Marking again replaces the earlier mark and keeps any
    Note, which explains the Student rather than the status chosen. */
export function mark(
  rollCall: RollCall,
  studentId: string,
  status: AttendanceStatus,
  note?: string,
): RollCall {
  const notes = new Map(rollCall.notes);
  if (note !== undefined) notes.set(studentId, note);
  const marks = new Map(rollCall.marks);
  marks.set(studentId, recordAttendance(rollCall.session, studentId, status, notes.get(studentId)));
  return { ...rollCall, marks, notes };
}

/** Write, change, or clear a Student's Note. Blank text clears it, so an
    emptied field leaves no Note behind. Works whether or not the Student is
    marked yet. */
export function setNote(rollCall: RollCall, studentId: string, note: string): RollCall {
  const text = note.trim();
  const notes = new Map(rollCall.notes);
  if (text === '') notes.delete(studentId);
  else notes.set(studentId, text);

  const existing = rollCall.marks.get(studentId);
  if (!existing) return { ...rollCall, notes };
  const marks = new Map(rollCall.marks);
  marks.set(
    studentId,
    recordAttendance(rollCall.session, studentId, existing.status, notes.get(studentId)),
  );
  return { ...rollCall, marks, notes };
}

/** The Note written against a Student, if any. */
export function noteOf(rollCall: RollCall, studentId: string): string | undefined {
  return rollCall.notes.get(studentId);
}

/** Undo a mark, putting the Student back among the unmarked. The Note stays:
    the teacher wrote it about the Student, not about the tap. */
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
