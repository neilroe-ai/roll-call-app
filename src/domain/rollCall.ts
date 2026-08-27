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
 *
 * A roll call in progress can also be written down and picked back up, so a
 * reload mid-marking loses neither the marks nor the Session's identity.
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

/** What the teacher chose for a Student, if anything yet. */
export function markOf(rollCall: RollCall, studentId: string): AttendanceRecord | undefined {
  return rollCall.marks.get(studentId);
}

/** Students still to mark, in roll order. */
export function remaining(rollCall: RollCall): Student[] {
  return rollCall.roll.filter((student) => !rollCall.marks.has(student.id));
}

/** The records to write, in roll order rather than tap order, so the Sheet
    reads down the class list the way the teacher expects. */
export function recordsToSave(rollCall: RollCall): AttendanceRecord[] {
  return rollCall.roll
    .map((student) => rollCall.marks.get(student.id))
    .filter((record): record is AttendanceRecord => record !== undefined);
}

/** A roll call in progress, small enough to keep on the device.
    The roll itself is not kept: it is rebuilt from the Sheet on the way back,
    so a Student added to the Group meanwhile is there to mark and one removed
    is gone. Only what the teacher chose is worth keeping. */
export interface SavedRollCall {
  session: Session;
  /** What was marked so far, as pairs so it survives being written down. */
  marks: [studentId: string, status: AttendanceStatus][];
  /** Notes so far, as pairs, including any on an unmarked Student. */
  notes: [studentId: string, note: string][];
}

/** Write a roll call in progress down. */
export function rememberRollCall(rollCall: RollCall): SavedRollCall {
  return {
    session: rollCall.session,
    marks: [...rollCall.marks].map(([studentId, record]) => [studentId, record.status]),
    notes: [...rollCall.notes],
  };
}

/** Pick a written-down roll call back up against the Sheet as it now reads.
    The Session keeps its id, so saving the resumed roll call is the same write
    as saving the original and cannot count a Student twice. A Group that has
    since gone gives `undefined`: there is nothing left to mark. */
export function resumeRollCall(
  saved: SavedRollCall,
  groups: readonly Group[],
  students: readonly Student[],
): RollCall | undefined {
  const group = groups.find((candidate) => candidate.id === saved.session.groupId);
  if (!group) return undefined;

  let rollCall = beginRollCall(saved.session, group, students);
  for (const [studentId, note] of saved.notes) rollCall = setNote(rollCall, studentId, note);
  // Marks last: a mark carries whatever Note the Student already has onto the
  // Attendance Record, the same way marking after typing does.
  for (const [studentId, status] of saved.marks) rollCall = mark(rollCall, studentId, status);
  return rollCall;
}
