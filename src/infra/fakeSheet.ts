/**
 * An in-memory SheetGateway for tests and for running the UI with no network.
 * It stores rows, not records, so it exercises the same encode/decode path as
 * the real Sheet and catches mapping bugs the real gateway would hit.
 */
import type { Adjustment } from '../domain/adjustment';
import type { BehaviorPoint, CalendarDate } from '../domain/behavior';
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
  type SheetRow,
} from './rows';
import type { SheetGateway } from './sheetGateway';
import type { Snapshot } from '../domain/snapshot';
import { writeRollCall } from './writeRollCall';
import { writeBehavior } from './writeBehavior';
import { writeHeldPoint } from './writeHeldPoint';
import { writeNote } from './writeNote';
import type { RollCall } from '../domain/rollCall';

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
      ...students.map((student) => STUDENTS_TAB.encode(student, seed.adjustments?.get(student.id))),
    ]);
    this.tabs.set(GROUPS_TAB.title, groupGrid(students, groups));
    this.tabs.set(SUMMARY_TAB.title, [SUMMARY_TAB.header]);
    this.tabs.set(SESSIONS_TAB.title, [
      SESSIONS_TAB.header,
      ...(seed.sessions ?? []).map(SESSIONS_TAB.encode),
    ]);
    this.tabs.set(ATTENDANCE_TAB.title, [
      ATTENDANCE_TAB.header,
      ...(seed.attendance ?? []).map(ATTENDANCE_TAB.encode),
    ]);
    this.tabs.set(BEHAVIOR_TAB.title, [
      BEHAVIOR_TAB.header,
      ...(seed.behavior ?? []).map(BEHAVIOR_TAB.encode),
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

  async read(): Promise<Snapshot> {
    const students = await this.listStudents();
    await this.syncGroupsGrid(students);
    const [groups, sessions, attendance, behavior, adjustments, notes] = await Promise.all([
      this.listGroups(),
      this.listSessions(),
      this.listAttendance(),
      this.listBehavior(),
      this.listAdjustments(),
      this.listNotesLogs(),
    ]);
    return { students, groups, sessions, ledger: { attendance, behavior }, adjustments, notes };
  }

  listStudents(): Promise<Student[]> {
    return Promise.resolve(STUDENTS_TAB.decode(this.rowsOf(STUDENTS_TAB.title)));
  }

  listGroups(): Promise<Group[]> {
    return Promise.resolve(GROUPS_TAB.decode(this.rowsOf(GROUPS_TAB.title)));
  }

  listAdjustments(): Promise<Map<string, Adjustment>> {
    return Promise.resolve(STUDENTS_TAB.adjustments(this.rowsOf(STUDENTS_TAB.title)));
  }

  listSessions(): Promise<Session[]> {
    return Promise.resolve(SESSIONS_TAB.decode(this.rowsOf(SESSIONS_TAB.title)));
  }

  listAttendance(): Promise<AttendanceRecord[]> {
    return Promise.resolve(ATTENDANCE_TAB.decode(this.rowsOf(ATTENDANCE_TAB.title)));
  }

  listBehavior(): Promise<BehaviorPoint[]> {
    return Promise.resolve(BEHAVIOR_TAB.decode(this.rowsOf(BEHAVIOR_TAB.title)));
  }

  listNotesLogs(): Promise<Map<string, string[]>> {
    return Promise.resolve(SUMMARY_TAB.notes(this.rowsOf(SUMMARY_TAB.title)));
  }

  /** No file behind it, so nothing to open. */
  sheetLink(): string | null {
    return null;
  }

  syncGroupsGrid(students: readonly Student[]): Promise<void> {
    const rows = this.rowsOf(GROUPS_TAB.title);
    GROUPS_TAB.columnsFor(rows, students).forEach((columns, index) => {
      const existing = rows[index + 1] ?? [];
      rows[index + 1] = [...columns, ...existing.slice(2)];
    });
    return Promise.resolve();
  }

  saveStudentSummaries(summaries: readonly StudentSummary[]): Promise<void> {
    this.tabs.set(SUMMARY_TAB.title, [SUMMARY_TAB.header, ...SUMMARY_TAB.block(summaries)]);
    return Promise.resolve();
  }

  appendSession(session: Session): Promise<void> {
    this.rowsOf(SESSIONS_TAB.title).push(SESSIONS_TAB.encode(session));
    return Promise.resolve();
  }

  appendAttendance(records: readonly AttendanceRecord[]): Promise<void> {
    this.rowsOf(ATTENDANCE_TAB.title).push(...records.map(ATTENDANCE_TAB.encode));
    return Promise.resolve();
  }

  saveRollCall(rollCall: RollCall, snapshot: Snapshot): Promise<void> {
    return writeRollCall(this, rollCall, snapshot);
  }

  appendBehavior(point: BehaviorPoint): Promise<void> {
    this.rowsOf(BEHAVIOR_TAB.title).push(BEHAVIOR_TAB.encode(point));
    return Promise.resolve();
  }

  saveBehavior(point: BehaviorPoint, snapshot: Snapshot): Promise<void> {
    return writeBehavior(this, point, snapshot);
  }

  resolveHeldPoint(
    sessionId: string,
    studentId: string,
    state: PointState,
    snapshot: Snapshot,
  ): Promise<void> {
    return writeHeldPoint(this, sessionId, studentId, state, snapshot);
  }

  saveNote(studentId: string, text: string, on: CalendarDate, snapshot: Snapshot): Promise<void> {
    return writeNote(this, studentId, text, on, snapshot);
  }

  setPointState(sessionId: string, studentId: string, state: PointState): Promise<void> {
    const rows = this.rowsOf(ATTENDANCE_TAB.title);
    const index = ATTENDANCE_TAB.rowOf(rows, sessionId, studentId);
    if (index === -1) {
      return Promise.reject(new Error(`no attendance record for ${studentId} in ${sessionId}`));
    }
    const found = rows[index] as SheetRow;
    const point = ATTENDANCE_TAB.pointIndex;
    rows[index] = [...found.slice(0, point), state, ...found.slice(point + 1)];
    return Promise.resolve();
  }
}

/** The Groups grid a set of Groups would be marked up as: a column per Group,
    a "y" wherever a Student belongs to one.
 *
 * A Group's id is its column position, so a seed may not choose one: a seed
 * saying `g1` where the grid can only ever say `G1` would decode back as a
 * different Group, and every Session pointing at it would silently count zero.
 * Better to fail here than to pass a test on data the Sheet cannot hold. */
function groupGrid(students: readonly Student[], groups: readonly Group[]): SheetRow[] {
  groups.forEach((group, at) => {
    const expected = GROUPS_TAB.idForColumn(GROUPS_TAB.header.length + at);
    if (group.id !== expected) {
      throw new Error(`seeded group "${group.name}" must have id ${expected}, got ${group.id}`);
    }
  });
  const header = [...GROUPS_TAB.header, ...groups.map((group) => group.name)];
  const rows = students.map((student) => [
    student.id,
    student.name,
    ...groups.map((group) => (isMember(group, student.id) ? 'y' : '')),
  ]);
  return [header, ...rows];
}
