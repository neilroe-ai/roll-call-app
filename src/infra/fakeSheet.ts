/**
 * An in-memory SheetGateway for tests and for running the UI with no network.
 * It stores rows, not records, so it exercises the same encode/decode path as
 * the real Sheet and catches mapping bugs the real gateway would hit.
 */
import type { Adjustment } from '../domain/adjustment';
import type { BehaviorPoint } from '../domain/behavior';
import type { PointState } from '../domain/points';
import { isMember, type Group, type Student } from '../domain/group';
import type { AttendanceRecord, Session } from '../domain/session';
import type { StudentSummary } from '../domain/studentSummary';
import {
  ATTENDANCE_TAB,
  BEHAVIOR_TAB,
  GROUPS_TAB,
  SESSIONS_TAB,
  STUDENTS_TAB,
  SUMMARY_TAB,
  decodeAdjustments,
  decodeAttendance,
  decodeBehavior,
  decodeGroups,
  decodeSession,
  decodeStudent,
  decodeSummaryNotes,
  decodeTab,
  encodeAttendance,
  encodeBehavior,
  encodeSession,
  findAttendanceRow,
  groupRoster,
  summaryBlock,
  type SheetRow,
} from './rows';
import type { SheetGateway } from './sheetGateway';

export interface FakeSheetSeed {
  students?: Student[];
  groups?: Group[];
  /** Hand-typed corrections, keyed by student id, as the Students tab holds
      them. */
  adjustments?: ReadonlyMap<string, Adjustment>;
  sessions?: Session[];
  attendance?: AttendanceRecord[];
  behavior?: BehaviorPoint[];
}

export class FakeSheet implements SheetGateway {
  private readonly tabs = new Map<string, SheetRow[]>();

  constructor(seed: FakeSheetSeed = {}) {
    const students = seed.students ?? [];
    const groups = seed.groups ?? [];
    this.tabs.set(STUDENTS_TAB.title, [
      STUDENTS_TAB.header,
      ...students.map((student) => studentRow(student, seed.adjustments?.get(student.id))),
    ]);
    this.tabs.set(GROUPS_TAB.title, groupGrid(students, groups));
    this.tabs.set(SUMMARY_TAB.title, [SUMMARY_TAB.header]);
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
    return Promise.resolve(decodeGroups(this.rowsOf(GROUPS_TAB.title)));
  }

  listAdjustments(): Promise<Map<string, Adjustment>> {
    return Promise.resolve(decodeAdjustments(this.rowsOf(STUDENTS_TAB.title)));
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
    return Promise.resolve(decodeSummaryNotes(this.rowsOf(SUMMARY_TAB.title)));
  }

  syncGroupRoster(students: readonly Student[]): Promise<void> {
    const rows = this.rowsOf(GROUPS_TAB.title);
    groupRoster(rows, students).forEach((roster, index) => {
      const existing = rows[index + 1] ?? [];
      rows[index + 1] = [...roster, ...existing.slice(2)];
    });
    return Promise.resolve();
  }

  saveStudentSummaries(summaries: readonly StudentSummary[]): Promise<void> {
    this.tabs.set(SUMMARY_TAB.title, [SUMMARY_TAB.header, ...summaryBlock(summaries)]);
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

/** One Students row: what the teacher typed, including any Adjustment. */
function studentRow(student: Student, adjustment?: Adjustment): string[] {
  if (adjustment === undefined) return [student.id, student.name];
  return [
    student.id,
    student.name,
    String(adjustment.points),
    String(adjustment.counts.present),
    String(adjustment.counts.absent),
    String(adjustment.counts.sick),
    String(adjustment.counts.other),
  ];
}

/** The Groups grid a set of Groups would be marked up as: a column per Group,
    a "y" wherever a Student belongs to one. */
function groupGrid(students: readonly Student[], groups: readonly Group[]): SheetRow[] {
  const header = ['Student ID', 'Name', ...groups.map((group) => group.name)];
  const rows = students.map((student) => [
    student.id,
    student.name,
    ...groups.map((group) => (isMember(group, student.id) ? 'y' : '')),
  ]);
  return [header, ...rows];
}
