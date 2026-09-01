/**
 * The real SheetGateway: the app's own Google Sheet.
 *
 * Per ADR 0004 the app creates the Sheet itself, so `drive.file` can reach it.
 * The id is remembered per browser, so a device that has never signed in has
 * nothing to go on — it asks Drive for the Sheet the app already made before
 * making another. One teacher, one Sheet, however many browsers she uses.
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
  SUMMARY_TAB,
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

  /** The app's Sheet, found or created on first use. Concurrent callers share
      one lookup: two Sheets for one teacher would silently split their data. */
  private settling: Promise<string> | null = null;

  /** Whether the remembered id has been checked against Drive this session. */
  private checked = false;

  private async sheetId(): Promise<string> {
    if (this.spreadsheetId && this.checked) return this.spreadsheetId;
    this.settling ??= this.settle().finally(() => {
      this.settling = null;
    });
    return this.settling;
  }

  /**
   * Which Sheet this teacher's roll calls belong in.
   *
   * A remembered id is checked before it is trusted: a Sheet she moved to the
   * bin still answers every read and write, so an unchecked id can quietly file
   * a term of roll calls into a spreadsheet she can no longer see. Whatever the
   * answer, Drive is asked for an existing Sheet before a new one is made.
   */
  private async settle(): Promise<string> {
    const remembered = this.spreadsheetId;
    if (remembered !== null && (await this.api.isUsable(remembered))) {
      this.checked = true;
      return remembered;
    }
    const found = await this.api.findSpreadsheet(SHEET_TITLE);
    const id = found ?? (await this.create());
    this.spreadsheetId = id;
    this.checked = true;
    this.idStore.set(id);
    return id;
  }

  private async create(): Promise<string> {
    const id = await this.api.createSpreadsheet(
      SHEET_TITLE,
      ALL_TABS.map((tab) => tab.title),
    );
    for (const tab of ALL_TABS) {
      await this.api.updateValues(id, `${tab.title}!A1`, [[...tab.header]]);
    }
    return id;
  }

  /** Run something against the app's Sheet. An id can stop working mid-session
      — she empties the bin, or removes the file — and a 404 means that, so the
      id is dropped and settled again rather than the app failing for good. */
  private async withSheet<T>(run: (id: string) => Promise<T>): Promise<T> {
    const id = await this.sheetId();
    try {
      return await run(id);
    } catch (error) {
      if (!(error instanceof SheetsApiError) || error.status !== 404) throw error;
      this.spreadsheetId = null;
      this.checked = false;
      return run(await this.sheetId());
    }
  }

  /** Every value on a tab, header row included. What it means is the tab's
      own business, so the caller hands the rows straight back to it. */
  private valuesOf(tab: TabSchema): Promise<readonly SheetRow[]> {
    return this.withSheet((id) => this.api.getValues(id, wholeTab(tab)));
  }

  /** Where the Sheet in use can be opened. Null until the id is settled, which
      is one read into the session. */
  sheetLink(): string | null {
    return this.spreadsheetId === null
      ? null
      : `https://docs.google.com/spreadsheets/d/${this.spreadsheetId}/edit`;
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

  async listStudents(): Promise<Student[]> {
    return STUDENTS_TAB.decode(await this.valuesOf(STUDENTS_TAB));
  }

  /** The Groups grid is read whole, not row by row: a Group is a column, so no
      single row describes one. */
  async listGroups(): Promise<Group[]> {
    return GROUPS_TAB.decode(await this.valuesOf(GROUPS_TAB));
  }

  async listAdjustments(): Promise<Map<string, Adjustment>> {
    return STUDENTS_TAB.adjustments(await this.valuesOf(STUDENTS_TAB));
  }

  async listSessions(): Promise<Session[]> {
    return SESSIONS_TAB.decode(await this.valuesOf(SESSIONS_TAB));
  }

  async listAttendance(): Promise<AttendanceRecord[]> {
    return ATTENDANCE_TAB.decode(await this.valuesOf(ATTENDANCE_TAB));
  }

  async listBehavior(): Promise<BehaviorPoint[]> {
    return BEHAVIOR_TAB.decode(await this.valuesOf(BEHAVIOR_TAB));
  }

  async listNotesLogs(): Promise<Map<string, string[]>> {
    return SUMMARY_TAB.notes(await this.valuesOf(SUMMARY_TAB));
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
      const rows = GROUPS_TAB.columnsFor(values, students);
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
    await this.append(SESSIONS_TAB, [SESSIONS_TAB.encode(session)]);
  }

  async appendAttendance(records: readonly AttendanceRecord[]): Promise<void> {
    await this.append(ATTENDANCE_TAB, records.map(ATTENDANCE_TAB.encode));
  }

  saveRollCall(rollCall: RollCall, snapshot: Snapshot): Promise<void> {
    return writeRollCall(this, rollCall, snapshot);
  }

  async appendBehavior(point: BehaviorPoint): Promise<void> {
    await this.append(BEHAVIOR_TAB, [BEHAVIOR_TAB.encode(point)]);
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
      const block = SUMMARY_TAB.block(summaries);
      // Pad to whatever the tab already holds, so a shorter list blanks the
      // rows it no longer needs instead of leaving stale ones below.
      const width = SUMMARY_TAB.header.length;
      const blank = Array.from({ length: width }, () => '');
      const rows = [...block];
      for (let index = rows.length; index < existing.length - 1; index += 1) rows.push([...blank]);
      // Nothing to write and nothing already there: the tab is already right.
      if (rows.length === 0) return;
      const range = `${SUMMARY_TAB.title}!A2:${SUMMARY_TAB.lastColumn}${String(rows.length + 1)}`;
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
      const index = ATTENDANCE_TAB.rowOf(values, sessionId, studentId);
      if (index === -1) {
        throw new Error(`no attendance record for ${studentId} in ${sessionId}`);
      }
      // Sheet rows are 1-based.
      const cell = `${ATTENDANCE_TAB.title}!${ATTENDANCE_TAB.pointColumn}${String(index + 1)}`;
      await this.api.updateValues(id, cell, [[state]]);
    });
  }
}
