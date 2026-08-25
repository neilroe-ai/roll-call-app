/**
 * The port to the Google Sheet that backs the app.
 *
 * Speaks in domain records, not rows: the row shape is an infra detail owned by
 * `rows.ts`. Every method can fail — no network, expired token, a tab the
 * teacher renamed — so callers must handle rejection. Per ADR 0002 a failed
 * write must never block taking roll.
 */
import type { BehaviorPoint } from '../domain/behavior';
import type { PointState } from '../domain/points';
import type { Group, Student } from '../domain/group';
import type { AttendanceRecord, Session } from '../domain/session';

export interface SheetGateway {
  /** Create any missing tabs and header rows. Safe to call repeatedly. */
  ensureTabs(): Promise<void>;

  listStudents(): Promise<Student[]>;
  listGroups(): Promise<Group[]>;
  listSessions(): Promise<Session[]>;
  listAttendance(): Promise<AttendanceRecord[]>;
  listBehavior(): Promise<BehaviorPoint[]>;

  appendStudent(student: Student): Promise<void>;
  appendGroup(group: Group): Promise<void>;
  appendSession(session: Session): Promise<void>;
  /** Appended as one batch: a Session's records are written together. */
  appendAttendance(records: readonly AttendanceRecord[]): Promise<void>;
  appendBehavior(point: BehaviorPoint): Promise<void>;

  /** Resolve a held point later. Throws if no such record exists. */
  setPointState(sessionId: string, studentId: string, state: PointState): Promise<void>;
}
