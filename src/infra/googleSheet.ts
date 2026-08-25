/**
 * The real SheetGateway: the app's own Google Sheet.
 *
 * Per ADR 0004 the app creates the Sheet itself, so `drive.file` can reach it.
 * The id is remembered per device; a device that has never signed in makes one.
 */
import type { BehaviorPoint } from '../domain/behavior';
import type { PointState } from '../domain/points';
import type { Group, Student } from '../domain/roster';
import type { AttendanceRecord, Session } from '../domain/session';
import {
  ALL_TABS,
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
  decodeTab,
  encodeAttendance,
  encodeBehavior,
  encodeGroup,
  encodeSession,
  encodeStudent,
  type SheetRow,
  type TabSchema,
} from './rows';
import { SheetsApiError, type SheetsApi } from './sheetsApi';
import type { SheetGateway } from './sheetGateway';

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

  async ensureTabs(): Promise<void> {
    await this.withSheet((id) => this.api.getValues(id, wholeTab(STUDENTS_TAB)));
  }

  private async read<T>(tab: TabSchema, decode: (row: SheetRow, at: number) => T): Promise<T[]> {
    const values = await this.withSheet((id) => this.api.getValues(id, wholeTab(tab)));
    return decodeTab(values, decode);
  }

  listStudents(): Promise<Student[]> {
    return this.read(STUDENTS_TAB, decodeStudent);
  }

  listGroups(): Promise<Group[]> {
    return this.read(GROUPS_TAB, decodeGroup);
  }

  listSessions(): Promise<Session[]> {
    return this.read(SESSIONS_TAB, decodeSession);
  }

  listAttendance(): Promise<AttendanceRecord[]> {
    return this.read(ATTENDANCE_TAB, decodeAttendance);
  }

  listBehavior(): Promise<BehaviorPoint[]> {
    return this.read(BEHAVIOR_TAB, decodeBehavior);
  }

  private async append(tab: TabSchema, rows: string[][]): Promise<void> {
    await this.withSheet((id) => this.api.appendValues(id, wholeTab(tab), rows));
  }

  async appendStudent(student: Student): Promise<void> {
    await this.append(STUDENTS_TAB, [encodeStudent(student)]);
  }

  async appendGroup(group: Group): Promise<void> {
    await this.append(GROUPS_TAB, [encodeGroup(group)]);
  }

  async appendSession(session: Session): Promise<void> {
    await this.append(SESSIONS_TAB, [encodeSession(session)]);
  }

  async appendAttendance(records: readonly AttendanceRecord[]): Promise<void> {
    await this.append(ATTENDANCE_TAB, records.map(encodeAttendance));
  }

  async appendBehavior(point: BehaviorPoint): Promise<void> {
    await this.append(BEHAVIOR_TAB, [encodeBehavior(point)]);
  }

  /** Resolve a held point by overwriting one cell. The row is found by reading
      the tab, because the Sheet, not the app, decides where a row landed. */
  async setPointState(sessionId: string, studentId: string, state: PointState): Promise<void> {
    await this.withSheet(async (id) => {
      const values = await this.api.getValues(id, wholeTab(ATTENDANCE_TAB));
      const index = values.findIndex(
        (row, at) => at > 0 && row[0] === sessionId && row[1] === studentId,
      );
      if (index === -1) {
        throw new Error(`no attendance record for ${studentId} in ${sessionId}`);
      }
      // Point is column D; sheet rows are 1-based.
      await this.api.updateValues(id, `${ATTENDANCE_TAB.title}!D${index + 1}`, [[state]]);
    });
  }
}
