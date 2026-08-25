/**
 * Mapping between domain records and Google Sheet rows.
 *
 * A Sheet cell is whatever the teacher typed, so every value coming back is
 * treated as unknown and validated. Decoding a bad row throws rather than
 * skipping it: a dropped attendance row is a silently wrong Score, which is
 * worse than a visible error.
 */
import type { AttendanceStatus, BehaviorKind, PointState } from '../domain/points';
import type { BehaviorPoint, CalendarDate } from '../domain/behavior';
import type { Group, Student } from '../domain/roster';
import type { AttendanceRecord, Session, Timestamp } from '../domain/session';

/** One tab of the Sheet, with the header row it must start with. */
export interface TabSchema {
  title: string;
  header: readonly string[];
}

export const STUDENTS_TAB: TabSchema = { title: 'Students', header: ['id', 'name'] };
export const GROUPS_TAB: TabSchema = { title: 'Groups', header: ['id', 'name', 'studentIds'] };
export const SESSIONS_TAB: TabSchema = { title: 'Sessions', header: ['id', 'groupId', 'takenAt'] };
export const ATTENDANCE_TAB: TabSchema = {
  title: 'Attendance',
  header: ['sessionId', 'studentId', 'status', 'pointState', 'note'],
};
export const BEHAVIOR_TAB: TabSchema = {
  title: 'Behavior',
  header: ['id', 'studentId', 'date', 'kind', 'note'],
};

/** Every tab the app expects to exist, in creation order. */
export const ALL_TABS: readonly TabSchema[] = [
  STUDENTS_TAB,
  GROUPS_TAB,
  SESSIONS_TAB,
  ATTENDANCE_TAB,
  BEHAVIOR_TAB,
];

/** A row as the Sheets API returns it: unvalidated cells, short rows possible. */
export type SheetRow = readonly unknown[];

export class RowError extends Error {
  constructor(tab: string, rowNumber: number, detail: string) {
    super(`${tab} row ${rowNumber}: ${detail}`);
    this.name = 'RowError';
  }
}

/** A trimmed required cell. Sheets omits trailing empty cells, so a missing
    index and an empty string are the same failure. */
function required(row: SheetRow, index: number, field: string, tab: string, at: number): string {
  const value = row[index];
  if (typeof value === 'number') return String(value);
  if (typeof value !== 'string' || value.trim() === '') {
    throw new RowError(tab, at, `${field} is required`);
  }
  return value.trim();
}

/** A trimmed optional cell, or undefined when blank or absent. */
function optional(row: SheetRow, index: number): string | undefined {
  const value = row[index];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function oneOf<T extends string>(
  allowed: readonly T[],
  value: string,
  field: string,
  tab: string,
  at: number,
): T {
  const match = allowed.find((candidate) => candidate === value);
  if (match === undefined) {
    throw new RowError(tab, at, `${field} must be one of ${allowed.join(', ')}, got "${value}"`);
  }
  return match;
}

const STATUSES: readonly AttendanceStatus[] = ['present', 'absent', 'sick', 'other'];
const POINT_STATES: readonly PointState[] = ['awarded', 'held', 'denied'];
const BEHAVIOR_KINDS: readonly BehaviorKind[] = ['positive', 'negative'];

export function encodeStudent(student: Student): string[] {
  return [student.id, student.name];
}

export function decodeStudent(row: SheetRow, at: number): Student {
  const tab = STUDENTS_TAB.title;
  return { id: required(row, 0, 'id', tab, at), name: required(row, 1, 'name', tab, at) };
}

/** Group membership is a list in one cell: comma-separated student ids. */
export function encodeGroup(group: Group): string[] {
  return [group.id, group.name, group.studentIds.join(',')];
}

export function decodeGroup(row: SheetRow, at: number): Group {
  const tab = GROUPS_TAB.title;
  const ids = optional(row, 2);
  return {
    id: required(row, 0, 'id', tab, at),
    name: required(row, 1, 'name', tab, at),
    studentIds:
      ids === undefined
        ? []
        : ids
            .split(',')
            .map((id) => id.trim())
            .filter((id) => id !== ''),
  };
}

export function encodeSession(session: Session): string[] {
  return [session.id, session.groupId, session.takenAt];
}

export function decodeSession(row: SheetRow, at: number): Session {
  const tab = SESSIONS_TAB.title;
  return {
    id: required(row, 0, 'id', tab, at),
    groupId: required(row, 1, 'groupId', tab, at),
    takenAt: required(row, 2, 'takenAt', tab, at) as Timestamp,
  };
}

export function encodeAttendance(record: AttendanceRecord): string[] {
  return [record.sessionId, record.studentId, record.status, record.pointState, record.note ?? ''];
}

export function decodeAttendance(row: SheetRow, at: number): AttendanceRecord {
  const tab = ATTENDANCE_TAB.title;
  const record: AttendanceRecord = {
    sessionId: required(row, 0, 'sessionId', tab, at),
    studentId: required(row, 1, 'studentId', tab, at),
    status: oneOf(STATUSES, required(row, 2, 'status', tab, at), 'status', tab, at),
    pointState: oneOf(POINT_STATES, required(row, 3, 'pointState', tab, at), 'pointState', tab, at),
  };
  const note = optional(row, 4);
  return note === undefined ? record : { ...record, note };
}

export function encodeBehavior(point: BehaviorPoint): string[] {
  return [point.id, point.studentId, point.date, point.kind, point.note ?? ''];
}

export function decodeBehavior(row: SheetRow, at: number): BehaviorPoint {
  const tab = BEHAVIOR_TAB.title;
  const point: BehaviorPoint = {
    id: required(row, 0, 'id', tab, at),
    studentId: required(row, 1, 'studentId', tab, at),
    date: required(row, 2, 'date', tab, at) as CalendarDate,
    kind: oneOf(BEHAVIOR_KINDS, required(row, 3, 'kind', tab, at), 'kind', tab, at),
  };
  const note = optional(row, 4);
  return note === undefined ? point : { ...point, note };
}

/** Decode a whole tab's values, skipping the header row. Row numbers in errors
    are 1-based Sheet rows, so they match what the teacher sees. */
export function decodeTab<T>(
  values: readonly SheetRow[],
  decode: (row: SheetRow, at: number) => T,
): T[] {
  return values.slice(1).map((row, index) => decode(row, index + 2));
}
