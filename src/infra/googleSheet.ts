/**
 * The real SheetGateway: the app's own Google Sheet.
 *
 * Per ADR 0004 the app creates the Sheet itself, so `drive.file` can reach it.
 * The id is remembered per device; a device that has never signed in makes one.
 */
import type { Adjustment } from '../domain/adjustment';
import type { BehaviorPoint, CalendarDate } from '../domain/behavior';
import type { PointState } from '../domain/points';
import type { Group, Student } from '../domain/group';
import type { AttendanceRecord, Session } from '../domain/session';
import type { StudentSummary } from '../domain/studentSummary';
import {
  ALL_TABS,
  ATTENDANCE_TAB,
  BEHAVIOR_TAB,
  GROUPS_TAB,
  SESSIONS_TAB,
  STUDENTS_TAB,
  SUMMARY_LAST_COLUMN,
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
  groupsGridColumns,
  POINT_COLUMN,
  summaryBlock,
  type SheetRow,
  type TabSchema,
} from './rows';
import { SheetsApiError, type SheetsApi } from './sheetsApi';
import type { SheetGateway } from './sheetGateway';
import type { Snapshot } from '../domain/snapshot';
import { writeRollCall } from './writeRollCall';
import { writeBehavior } from './writeBehavior';
import { writeHeldPoint } from './writeHeldPoint';
import { writeNote } from './writeNote';
import type { RollCall } from '../domain/rollCall';

export const SHEET_TITLE = 'Roll Call';
export const SHEET_ID_KEY = 'rollcall.spreadsheetId';

/** Where the spreadsheet id is remembered between visits. `localStorage` in the
    browser; anything with the same two methods in a test. */
export interface IdStore {
  get(): string | null;
  set(id: string): void;
}

export const localStorageIdStore: IdStore = {
  get: () => localStorage.getItem(SHEET_ID_KEY),
  set: (id) => {
    localStorage.setItem(SHEET_ID_KEY, id);
  },
};

/** The whole of a tab, including its header row. */
function wholeTab(tab: TabSchema): string {
  return `${tab.title}!A:Z`;
}

export class GoogleSheet implements SheetGateway {
  private spreadsheetId: string | null;

  constructor(
    private readonly api: SheetsApi,
    private readonly idStore: IdStore = localStorageIdStore,
  ) {
    this.spreadsheetId = idStore.get();
  }

  /** The app's Sheet, creating it on first use. Concurrent callers share one
      creation: two Sheets for one teacher would silently split their data. */
  private creating: Promise<string> | null = null;

  private async sheetId(): Promise<string> {
    if (this.spreadsheetId) return this.spreadsheetId;
    this.creating ??= this.create().finally(() => {
      this.creating = null;
    });
    return this.creating;
  }

  private async create(): Promise<string> {
    const id = await this.api.createSpreadsheet(
      SHEET_TITLE,
      ALL_TABS.map((tab) => tab.title),
    );
    for (const tab of ALL_TABS) {
      await this.api.updateValues(id, `${tab.title}!A1`, [[...tab.header]]);
    }
    this.spreadsheetId = id;
    this.idStore.set(id);
    return id;
  }

  /** Run something against the app's Sheet. A remembered id can point at a file
      the teacher deleted from Drive; a 404 means that, so the id is dropped and
      a fresh Sheet made rather than the app failing for good. */
  private async withSheet<T>(run: (id: string) => Promise<T>): Promise<T> {
    const id = await this.sheetId();
    try {
      return await run(id);
    } catch (error) {
      if (!(error instanceof SheetsApiError) || error.status !== 404) throw error;
      this.spreadsheetId = null;
      return run(await this.sheetId());
    }
  }

  private async readTab<T>(tab: TabSchema, decode: (row: SheetRow, at: number) => T): Promise<T[]> {
    const values = await this.withSheet((id) => this.api.getValues(id, wholeTab(tab)));
    return decodeTab(values, decode);
  }

  /** Everything the Sheet holds. The Groups Grid is squared up against the
      Students tab first: a Student with no row there cannot be ticked into any
      Group, so the teacher would have no way to add them. */
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
    return {
      students,
      groups,
      sessions,
      ledger: { attendance, behavior },
      adjustments,
      notes,
    };
  }

  listStudents(): Promise<Student[]> {
    return this.readTab(STUDENTS_TAB, decodeStudent);
  }

  /** The Groups grid is read whole, not row by row: a Group is a column, so no
      single row describes one. */
  async listGroups(): Promise<Group[]> {
    return decodeGroups(await this.withSheet((id) => this.api.getValues(id, wholeTab(GROUPS_TAB))));
  }

  async listAdjustments(): Promise<Map<string, Adjustment>> {
    return decodeAdjustments(
      await this.withSheet((id) => this.api.getValues(id, wholeTab(STUDENTS_TAB))),
    );
  }

  listSessions(): Promise<Session[]> {
    return this.readTab(SESSIONS_TAB, decodeSession);
  }

  listAttendance(): Promise<AttendanceRecord[]> {
    return this.readTab(ATTENDANCE_TAB, decodeAttendance);
  }

  listBehavior(): Promise<BehaviorPoint[]> {
    return this.readTab(BEHAVIOR_TAB, decodeBehavior);
  }

  async listNotesLogs(): Promise<Map<string, string[]>> {
    return decodeSummaryNotes(
      await this.withSheet((id) => this.api.getValues(id, wholeTab(SUMMARY_TAB))),
    );
  }

  /**
   * Give every Student a row in the Groups grid.
   *
   * Only columns A and B are written. The teacher's membership columns are
   * never in the range, so a tick cannot be lost even if this runs while she
   * is part way through filling the grid in.
   */
  async syncGroupsGrid(students: readonly Student[]): Promise<void> {
    await this.withSheet(async (id) => {
      const values = await this.api.getValues(id, wholeTab(GROUPS_TAB));
      const rows = groupsGridColumns(values, students);
      if (rows.length === 0) return;
      // Row 1 is the header, so the Student rows start at row 2.
      const range = `${GROUPS_TAB.title}!A2:B${String(rows.length + 1)}`;
      await this.api.updateValues(id, range, rows);
    });
  }

  private async append(tab: TabSchema, rows: string[][]): Promise<void> {
    await this.withSheet((id) => this.api.appendValues(id, wholeTab(tab), rows));
  }

  async appendSession(session: Session): Promise<void> {
    await this.append(SESSIONS_TAB, [encodeSession(session)]);
  }

  async appendAttendance(records: readonly AttendanceRecord[]): Promise<void> {
    await this.append(ATTENDANCE_TAB, records.map(encodeAttendance));
  }

  saveRollCall(rollCall: RollCall, snapshot: Snapshot): Promise<void> {
    return writeRollCall(this, rollCall, snapshot);
  }

  async appendBehavior(point: BehaviorPoint): Promise<void> {
    await this.append(BEHAVIOR_TAB, [encodeBehavior(point)]);
  }

  saveBehavior(point: BehaviorPoint, snapshot: Snapshot): Promise<void> {
    return writeBehavior(this, point, snapshot);
  }

  /**
   * Rewrite the Summary tab in one call.
   *
   * The app owns every cell here, so the block is written as it stands rather
   * than merged into what is already there. Rows the teacher has since removed
   * from the Students tab would otherwise be left behind, so the tab is cleared
   * first and only the current Students written back.
   */
  async saveStudentSummaries(summaries: readonly StudentSummary[]): Promise<void> {
    await this.withSheet(async (id) => {
      const existing = await this.api.getValues(id, wholeTab(SUMMARY_TAB));
      const block = summaryBlock(summaries);
      // Pad to whatever the tab already holds, so a shorter list blanks the
      // rows it no longer needs instead of leaving stale ones below.
      const width = SUMMARY_TAB.header.length;
      const blank = Array.from({ length: width }, () => '');
      const rows = [...block];
      for (let index = rows.length; index < existing.length - 1; index += 1) rows.push([...blank]);
      // Nothing to write and nothing already there: the tab is already right.
      if (rows.length === 0) return;
      const range = `${SUMMARY_TAB.title}!A2:${SUMMARY_LAST_COLUMN}${String(rows.length + 1)}`;
      await this.api.updateValues(id, range, rows);
    });
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

  /** Resolve a held point by overwriting one cell. The row is found by reading
      the tab, because the Sheet, not the app, decides where a row landed. */
  async setPointState(sessionId: string, studentId: string, state: PointState): Promise<void> {
    await this.withSheet(async (id) => {
      const values = await this.api.getValues(id, wholeTab(ATTENDANCE_TAB));
      const index = findAttendanceRow(values, sessionId, studentId);
      if (index === -1) {
        throw new Error(`no attendance record for ${studentId} in ${sessionId}`);
      }
      // Sheet rows are 1-based.
      const cell = `${ATTENDANCE_TAB.title}!${POINT_COLUMN}${String(index + 1)}`;
      await this.api.updateValues(id, cell, [[state]]);
    });
  }
}
