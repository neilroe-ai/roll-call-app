/**
 * An in-memory SheetGateway for tests and for running the UI with no network.
 * It stores rows, not records, so it exercises the same encode/decode path as
 * the real Sheet and catches mapping bugs the real gateway would hit.
 */
import type { BehaviorPoint } from '../domain/behavior';
import type { PointState } from '../domain/points';
import type { Group, Student } from '../domain/group';
import type { AttendanceRecord, Session } from '../domain/session';
import type { StudentSummary } from '../domain/studentSummary';
import {
  ATTENDANCE_TAB,
  BEHAVIOR_TAB,
  GROUPS_TAB,
  SESSIONS_TAB,
  STUDENTS_TAB,
  decodeAttendance,
  decodeBehavior,
  decodeGroup,
  decodeSession,
  decodeStudent,
  decodeStudentNotes,
  decodeTab,
  encodeAttendance,
  encodeBehavior,
  encodeGroup,
  encodeSession,
  encodeStudent,
  findAttendanceRow,
  summaryBlock,
  type SheetRow,
} from './rows';
import type { SheetGateway } from './sheetGateway';

export interface FakeSheetSeed {
  students?: Student[];
  groups?: Group[];
  sessions?: Session[];
  attendance?: AttendanceRecord[];
  behavior?: BehaviorPoint[];
}

export class FakeSheet implements SheetGateway {
  private readonly tabs = new Map<string, SheetRow[]>();

  constructor(seed: FakeSheetSeed = {}) {
    this.tabs.set(STUDENTS_TAB.title, [
      STUDENTS_TAB.header,
      ...(seed.students ?? []).map(encodeStudent),
    ]);
    this.tabs.set(GROUPS_TAB.title, [GROUPS_TAB.header, ...(seed.groups ?? []).map(encodeGroup)]);
    this.tabs.set(SESSIONS_TAB.title, [
      SESSIONS_TAB.header,
      ...(seed.sessions ?? []).map(encodeSession),
    ]);
    this.tabs.set(ATTENDANCE_TAB.title, [
      ATTENDANCE_TAB.header,
      ...(seed.attendance ?? []).map(encodeAttendance),
    ]);
    this.tabs.set(BEHAVIOR_TAB.title, [
      BEHAVIOR_TAB.header,
      ...(seed.behavior ?? []).map(encodeBehavior),
    ]);
  }

  /** The raw rows of a tab, for a test that needs to see what was written
      rather than what decodes back out. */
  rowsForTest(title: string): Promise<SheetRow[]> {
    return Promise.resolve(this.rowsOf(title));
  }

  private rowsOf(title: string): SheetRow[] {
    const rows = this.tabs.get(title);
    if (rows === undefined) throw new Error(`no such tab: ${title}`);
    return rows;
  }

  ensureTabs(): Promise<void> {
    return Promise.resolve();
  }

  listStudents(): Promise<Student[]> {
    return Promise.resolve(decodeTab(this.rowsOf(STUDENTS_TAB.title), decodeStudent));
  }

  listGroups(): Promise<Group[]> {
    return Promise.resolve(decodeTab(this.rowsOf(GROUPS_TAB.title), decodeGroup));
  }

  listSessions(): Promise<Session[]> {
    return Promise.resolve(decodeTab(this.rowsOf(SESSIONS_TAB.title), decodeSession));
  }

  listAttendance(): Promise<AttendanceRecord[]> {
    return Promise.resolve(decodeTab(this.rowsOf(ATTENDANCE_TAB.title), decodeAttendance));
  }

  listBehavior(): Promise<BehaviorPoint[]> {
    return Promise.resolve(decodeTab(this.rowsOf(BEHAVIOR_TAB.title), decodeBehavior));
  }

  listStudentNotes(): Promise<Map<string, string[]>> {
    return Promise.resolve(decodeStudentNotes(this.rowsOf(STUDENTS_TAB.title)));
  }

  saveStudentSummaries(summaries: readonly StudentSummary[]): Promise<void> {
    const rows = this.rowsOf(STUDENTS_TAB.title);
    const block = summaryBlock(rows, summaries);
    block.forEach((summaryRow, index) => {
      const existing = rows[index + 1] as SheetRow;
      rows[index + 1] = [...existing.slice(0, 2), ...summaryRow];
    });
    return Promise.resolve();
  }

  appendStudent(student: Student): Promise<void> {
    this.rowsOf(STUDENTS_TAB.title).push(encodeStudent(student));
    return Promise.resolve();
  }

  appendGroup(group: Group): Promise<void> {
    this.rowsOf(GROUPS_TAB.title).push(encodeGroup(group));
    return Promise.resolve();
  }

  appendSession(session: Session): Promise<void> {
    this.rowsOf(SESSIONS_TAB.title).push(encodeSession(session));
    return Promise.resolve();
  }

  appendAttendance(records: readonly AttendanceRecord[]): Promise<void> {
    this.rowsOf(ATTENDANCE_TAB.title).push(...records.map(encodeAttendance));
    return Promise.resolve();
  }

  appendBehavior(point: BehaviorPoint): Promise<void> {
    this.rowsOf(BEHAVIOR_TAB.title).push(encodeBehavior(point));
    return Promise.resolve();
  }

  setPointState(sessionId: string, studentId: string, state: PointState): Promise<void> {
    const rows = this.rowsOf(ATTENDANCE_TAB.title);
    const index = findAttendanceRow(rows, sessionId, studentId);
    if (index === -1) {
      return Promise.reject(new Error(`no attendance record for ${studentId} in ${sessionId}`));
    }
    const found = rows[index] as SheetRow;
    rows[index] = [...found.slice(0, 3), state, ...found.slice(4)];
    return Promise.resolve();
  }
}
