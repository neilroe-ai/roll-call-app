/**
 * Mapping between domain records and Google Sheet rows.
 *
 * A Sheet cell is whatever the teacher typed, so every value coming back is
 * treated as unknown and validated. Decoding a bad row throws rather than
 * skipping it: a dropped attendance row is a silently wrong Score, which is
 * worse than a visible error.
 */
import { BEHAVIOR_KINDS, POINT_STATES, STATUSES } from '../domain/points';
import type { BehaviorPoint, CalendarDate } from '../domain/behavior';
import type { Adjustment } from '../domain/adjustment';
import type { Group, Student } from '../domain/group';
import type { AttendanceRecord, Session, Timestamp } from '../domain/session';
import { shareText, type StudentSummary } from '../domain/studentSummary';

/**
 * One tab of the Sheet: its title, the header row it must start with, and the
 * mapping between its rows and the records it holds.
 *
 * A tab is the whole story of its own cells. A caller names the tab it wants
 * and asks it to decode or encode; nowhere else pairs a title with the right
 * decoder by hand, so the two adapters cannot drift apart or pick the wrong
 * one.
 *
 * Headers are for the teacher to read: rows are decoded by column position,
 * never by header text. Renaming a header is safe; moving a column is not.
 */
export interface TabSchema {
  title: string;
  header: readonly string[];
}

/** A tab holding one record per row, both ways. */
interface RecordTab<T> extends TabSchema {
  /** Every record on the tab, header row skipped. Row numbers in errors are
      1-based Sheet rows, so they match what the teacher sees. */
  decode(values: readonly SheetRow[]): T[];
  encode(record: T): string[];
}

interface StudentsTab extends TabSchema {
  decode(values: readonly SheetRow[]): Student[];
  /** Every Student's Adjustment, keyed by id. */
  adjustments(values: readonly SheetRow[]): Map<string, Adjustment>;
  encode(student: Student, adjustment?: Adjustment): string[];
}

interface GroupsTab extends TabSchema {
  decode(values: readonly SheetRow[]): Group[];
  /** The id a Group in this column has. */
  idForColumn(index: number): string;
  /** Columns A and B as they should read for these Students. */
  columnsFor(values: readonly SheetRow[], students: readonly Student[]): string[][];
}

interface SummaryTab extends TabSchema {
  /** Each Student's Notes Log, keyed by id — the one thing read back. */
  notes(values: readonly SheetRow[]): Map<string, string[]>;
  /** Everything below the header, in the order it is given. */
  block(summaries: readonly StudentSummary[]): string[][];
  /** The rightmost column, in A1, for the range a rewrite covers. */
  lastColumn: string;
}

interface AttendanceTab extends RecordTab<AttendanceRecord> {
  /** The index of a Record's row, or -1. Row order is this module's knowledge,
      so both gateways ask rather than reimplement it. */
  rowOf(values: readonly SheetRow[], sessionId: string, studentId: string): number;
  /** Where the Point sits: as an index into a row, and as the A1 column the
      Sheets API wants. One fact, two spellings, so no caller counts cells. */
  pointIndex: number;
  pointColumn: string;
}

/** The list the teacher types: who is in the class, and any figures she
    wants carried in or corrected. Per ADR 0007 the app never writes here. */
export const STUDENTS_TAB: StudentsTab = {
  title: 'Students',
  header: [
    'Student ID',
    'Name',
    'Adjust points',
    'Adjust present',
    'Adjust absent',
    'Adjust sick',
    'Adjust other',
  ],
  decode: (values) => decodeTab(values, decodeStudent),
  adjustments: decodeAdjustments,
  encode: encodeStudent,
};

/** Where the Adjustment columns start on the Students tab. */
const ADJUST_FIRST = 2;

/**
 * The Groups grid: one row per Student, one column per Group.
 *
 * The app fills A and B from the Students tab; the teacher marks membership
 * from C rightwards. A column becomes a Group by being given a heading, and a
 * Student joins it by having anything in that cell — a tick box, a "y", an "x".
 * The app names no columns of its own: a heading it invented would read on
 * Take roll as a class the teacher never made.
 */
export const GROUPS_TAB: GroupsTab = {
  title: 'Groups',
  header: ['Student ID', 'Name'],
  decode: decodeGroups,
  idForColumn: groupIdForColumn,
  columnsFor: groupsGridColumns,
};

/** Where the Group columns start on the Groups tab. */
const GROUP_FIRST = 2;

const SUMMARY_HEADER = [
  'Student ID',
  'Name',
  'Groups',
  'Score',
  'Sessions',
  'Present',
  'Present %',
  'Absent',
  'Absent %',
  'Sick',
  'Sick %',
  'Other',
  'Other %',
  'Attending',
  'Attending %',
  'Notes',
];

/** Which Summary column holds the Notes Log. Read off the header, so adding a
    column moves it. */
const SUMMARY_NOTES_INDEX = SUMMARY_HEADER.indexOf('Notes');

/** The app's report, rewritten whole on every save. Per ADR 0007 the teacher
    owns none of it, so nothing here has to be preserved — except the Notes
    Log, which is read back because a Note exists nowhere else. */
export const SUMMARY_TAB: SummaryTab = {
  title: 'Summary',
  header: SUMMARY_HEADER,
  notes: decodeSummaryNotes,
  block: summaryBlock,
  lastColumn: columnLetter(SUMMARY_HEADER.length - 1),
};

export const SESSIONS_TAB: RecordTab<Session> = {
  title: 'Sessions',
  header: ['Session ID', 'Group ID', 'Date & Time'],
  decode: (values) => decodeTab(values, decodeSession),
  encode: encodeSession,
};

export const ATTENDANCE_TAB: AttendanceTab = {
  title: 'Attendance',
  header: ['Session ID', 'Student ID', 'Status', 'Point', 'Note'],
  decode: (values) => decodeTab(values, decodeAttendance),
  encode: encodeAttendance,
  rowOf: findAttendanceRow,
  pointIndex: 3,
  pointColumn: columnLetter(3),
};

export const BEHAVIOR_TAB: RecordTab<BehaviorPoint> = {
  title: 'Behavior',
  header: ['Entry ID', 'Student ID', 'Date', 'Positive or Negative', 'Note'],
  decode: (values) => decodeTab(values, decodeBehavior),
  encode: encodeBehavior,
};

/** Every tab the app expects to exist, in creation order. */
export const ALL_TABS: readonly TabSchema[] = [
  STUDENTS_TAB,
  GROUPS_TAB,
  SUMMARY_TAB,
  SESSIONS_TAB,
  ATTENDANCE_TAB,
  BEHAVIOR_TAB,
];

/** A zero-based column number as the letters the Sheets API wants in an A1
    range: 0 is A, 25 is Z, 26 is AA.

    Counting up from the code for 'A' is right only as far as Z — column 26
    lands on '[', and the API would reject the range rather than misread it.
    A1 letters are base-26 with no zero digit, so each place is taken off the
    number before the next one is worked out. */
export function columnLetter(index: number): string {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error(`Column index must be a whole number from 0, got ${String(index)}.`);
  }
  let remaining = index;
  let letters = '';
  do {
    letters = String.fromCharCode('A'.charCodeAt(0) + (remaining % 26)) + letters;
    remaining = Math.floor(remaining / 26) - 1;
  } while (remaining >= 0);
  return letters;
}

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

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** A cell matching `pattern`, or a RowError naming what was expected. Dates and
    times are the only fields the Sheet cannot constrain for us. */
function matching(
  value: string,
  pattern: RegExp,
  expected: string,
  field: string,
  tab: string,
  at: number,
): string {
  if (!pattern.test(value)) {
    throw new RowError(tab, at, `${field} must look like ${expected}, got "${value}"`);
  }
  return value;
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

/** A Notes Log in one cell: one Note per line, oldest first, so the teacher
    reads a Student's history straight down the cell next to the name. */
function encodeNotes(notes: readonly string[]): string {
  return notes.join('\n');
}

function decodeNotes(cell: unknown): string[] {
  if (typeof cell !== 'string') return [];
  return cell
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

/** The Notes Log of every Student on the Summary tab, keyed by id. Read back
    before the tab is rewritten, because a Note is kept nowhere else. Rows the
    app cannot read are skipped: a summary must never stop a roll call. */
function decodeSummaryNotes(values: readonly SheetRow[]): Map<string, string[]> {
  const notes = new Map<string, string[]>();
  for (const row of values.slice(1)) {
    const id = optional(row, 0);
    if (id !== undefined) notes.set(id, decodeNotes(row[SUMMARY_NOTES_INDEX]));
  }
  return notes;
}

/** One Summary row, in tab order. Counts are shown next to their share of the
    Student's own Sessions, so a raw number is never read as a rate. Attending
    is the Attendance Credit: the share the teacher reads to decide whether a
    Student qualifies to graduate. */
function encodeSummary(summary: StudentSummary): string[] {
  const share = (count: number): string => shareText(count, summary.sessions);
  return [
    summary.studentId,
    summary.name,
    summary.groupNames.join(', '),
    String(summary.score),
    String(summary.sessions),
    String(summary.counts.present),
    share(summary.counts.present),
    String(summary.counts.absent),
    share(summary.counts.absent),
    String(summary.counts.sick),
    share(summary.counts.sick),
    String(summary.counts.other),
    share(summary.counts.other),
    String(summary.credited),
    share(summary.credited),
    encodeNotes(summary.notes),
  ];
}

/** The whole Summary tab below the header, in the order the Students tab holds
    its Students. The app owns every cell, so this is written as it stands. */
function summaryBlock(summaries: readonly StudentSummary[]): string[][] {
  return summaries.map(encodeSummary);
}

/** One Students row as the teacher would have typed it, Adjustment included.
    The app never writes this row — she owns it — but the fake Sheet and any
    test that seeds one need the column order to come from here, not from a
    second hand-counted copy. */
function encodeStudent(student: Student, adjustment?: Adjustment): string[] {
  if (adjustment === undefined) return [student.id, student.name];
  const counts = STATUSES.map((status) => String(adjustment.counts[status]));
  return [student.id, student.name, String(adjustment.points), ...counts];
}

function decodeStudent(row: SheetRow, at: number): Student {
  const tab = STUDENTS_TAB.title;
  return { id: required(row, 0, 'id', tab, at), name: required(row, 1, 'name', tab, at) };
}

/** A whole number the teacher typed. Blank is 0 — most Students need no
    Adjustment at all — but something unreadable is an error she can see and
    fix, not a figure silently thrown away. */
function wholeNumber(row: SheetRow, index: number, field: string, tab: string, at: number): number {
  const cell = row[index];
  if (cell === undefined || cell === null || cell === '') return 0;
  const value = typeof cell === 'number' ? cell : Number(String(cell).trim());
  if (!Number.isInteger(value)) {
    throw new RowError(tab, at, `${field} must be a whole number, got "${String(cell)}"`);
  }
  return value;
}

/** The Adjustment one Students row carries. */
function decodeAdjustment(row: SheetRow, at: number): Adjustment {
  const tab = STUDENTS_TAB.title;
  const count = (offset: number, field: string): number =>
    wholeNumber(row, ADJUST_FIRST + offset, field, tab, at);
  return {
    points: count(0, 'adjust points'),
    counts: {
      present: count(1, 'adjust present'),
      absent: count(2, 'adjust absent'),
      sick: count(3, 'adjust sick'),
      other: count(4, 'adjust other'),
    },
  };
}

/** Every Student's Adjustment, keyed by id. Students with nothing typed still
    get an entry, so a caller never has to tell blank from missing. */
function decodeAdjustments(values: readonly SheetRow[]): Map<string, Adjustment> {
  const adjustments = new Map<string, Adjustment>();
  values.slice(1).forEach((row, index) => {
    const id = optional(row, 0);
    if (id !== undefined) adjustments.set(id, decodeAdjustment(row, index + 2));
  });
  return adjustments;
}

/** The Group a column stands for. Identity is the column's position, not its
    heading, so renaming a Group keeps its Sessions and moving a column does
    not — the rule that holds for every other column in the Sheet. */
function groupIdForColumn(index: number): string {
  return `G${String(index - GROUP_FIRST + 1)}`;
}

/** Whether a membership cell counts as a tick.
 *
 * Anything the teacher puts there means yes — a Sheets tick box, "y", "x", a
 * "1" — because guessing wrong in that direction only ever shows her a Student
 * she can untick. Only an explicit no is read as no.
 */
const NOT_TICKED = new Set(['n', 'no', 'false', '0', '-']);

function isTicked(cell: unknown): boolean {
  if (typeof cell === 'boolean') return cell;
  if (typeof cell === 'number') return cell !== 0;
  if (typeof cell !== 'string') return false;
  const value = cell.trim().toLowerCase();
  return value !== '' && !NOT_TICKED.has(value);
}

/**
 * Every Group the grid describes, left to right.
 *
 * A column with no heading is not a Group: blank columns to the right of the
 * last one are just empty spreadsheet, not an unnamed class. A Group with no
 * Students is still a Group — the teacher has named it and is part way through
 * filling it in.
 */
function decodeGroups(values: readonly SheetRow[]): Group[] {
  const header = values[0] ?? [];
  const groups: Group[] = [];
  for (let column = GROUP_FIRST; column < header.length; column += 1) {
    const name = optional(header, column);
    if (name === undefined) continue;
    const studentIds: string[] = [];
    for (const row of values.slice(1)) {
      const id = optional(row, 0);
      if (id !== undefined && isTicked(row[column])) studentIds.push(id);
    }
    groups.push({ id: groupIdForColumn(column), name, studentIds });
  }
  return groups;
}

/**
 * Columns A and B of the Groups grid as they should read.
 *
 * Rows keep the order and position the grid already has, so every tick the
 * teacher made stays beside the Student she made it for; Students new to the Students
 * tab go on the end. Names are refreshed from the Students tab, because a
 * Student renamed there should not read as someone else here. A row whose id
 * is no longer on the Students tab is left exactly as it is: her ticks are not the
 * app's to throw away.
 */
function groupsGridColumns(values: readonly SheetRow[], students: readonly Student[]): string[][] {
  const byId = new Map(students.map((student) => [student.id, student]));
  const seen = new Set<string>();
  const rows = values.slice(1).map((row) => {
    const id = optional(row, 0);
    // No id: not a Student's row, so there is no name to refresh. Keep it.
    if (id === undefined) return ['', optional(row, 1) ?? ''];
    seen.add(id);
    return [id, byId.get(id)?.name ?? optional(row, 1) ?? ''];
  });
  for (const student of students) {
    if (!seen.has(student.id)) rows.push([student.id, student.name]);
  }
  return rows;
}

function encodeSession(session: Session): string[] {
  return [session.id, session.groupId, session.takenAt];
}

function decodeSession(row: SheetRow, at: number): Session {
  const tab = SESSIONS_TAB.title;
  return {
    id: required(row, 0, 'id', tab, at),
    groupId: required(row, 1, 'groupId', tab, at),
    takenAt: matching(
      required(row, 2, 'takenAt', tab, at),
      ISO_TIMESTAMP,
      '2026-08-26T09:05',
      'takenAt',
      tab,
      at,
    ) as Timestamp,
  };
}

function encodeAttendance(record: AttendanceRecord): string[] {
  return [record.sessionId, record.studentId, record.status, record.pointState, record.note ?? ''];
}

function decodeAttendance(row: SheetRow, at: number): AttendanceRecord {
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

function encodeBehavior(point: BehaviorPoint): string[] {
  return [point.id, point.studentId, point.date, point.kind, point.note ?? ''];
}

function decodeBehavior(row: SheetRow, at: number): BehaviorPoint {
  const tab = BEHAVIOR_TAB.title;
  const point: BehaviorPoint = {
    id: required(row, 0, 'id', tab, at),
    studentId: required(row, 1, 'studentId', tab, at),
    date: matching(
      required(row, 2, 'date', tab, at),
      ISO_DATE,
      '2026-08-26',
      'date',
      tab,
      at,
    ) as CalendarDate,
    kind: oneOf(BEHAVIOR_KINDS, required(row, 3, 'kind', tab, at), 'kind', tab, at),
  };
  const note = optional(row, 4);
  return note === undefined ? point : { ...point, note };
}

/** The index of an Attendance row, or -1. Row order and column positions are
    this module's knowledge, so both gateways ask rather than reimplement. */
function findAttendanceRow(
  values: readonly SheetRow[],
  sessionId: string,
  studentId: string,
): number {
  return values.findIndex((row, at) => at > 0 && row[0] === sessionId && row[1] === studentId);
}

/** Decode a whole tab's values, skipping the header row. Row numbers in errors
    are 1-based Sheet rows, so they match what the teacher sees. */
function decodeTab<T>(values: readonly SheetRow[], decode: (row: SheetRow, at: number) => T): T[] {
  return values.slice(1).map((row, index) => decode(row, index + 2));
}
