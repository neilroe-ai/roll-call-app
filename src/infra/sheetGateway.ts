/**
 * The port to the Google Sheet that backs the app.
 *
 * Speaks in domain records, not rows: the row shape is an infra detail owned by
 * `rows.ts`. Every method can fail — no network, expired token, a tab the
 * teacher renamed — so callers must handle rejection. Per ADR 0002 a failed
 * write must never block taking roll.
 */
import type { Adjustment } from '../domain/adjustment';
import type { BehaviorPoint } from '../domain/behavior';
import type { PointState } from '../domain/points';
import type { Group, Student } from '../domain/group';
import type { AttendanceRecord, Session } from '../domain/session';
import type { RollCall } from '../domain/rollCall';
import type { StudentSummary } from '../domain/studentSummary';

export interface SheetGateway {
  listStudents(): Promise<Student[]>;
  /** Every Student's hand-typed Adjustment, keyed by student id. */
  listAdjustments(): Promise<Map<string, Adjustment>>;
  listGroups(): Promise<Group[]>;
  listSessions(): Promise<Session[]>;
  listAttendance(): Promise<AttendanceRecord[]>;
  listBehavior(): Promise<BehaviorPoint[]>;
  /** Each Student's Notes Log as the Sheet holds it, keyed by student id. Read
      before saving so a rewritten row keeps the Notes already there. */
  listNotesLogs(): Promise<Map<string, string[]>>;

  /** Put a row in the Groups grid for every Student on the Students tab, leaving
      the teacher's membership columns untouched. Safe to call repeatedly. */
  syncGroupsGrid(students: readonly Student[]): Promise<void>;

  appendSession(session: Session): Promise<void>;
  /** Appended as one batch: a Session's records are written together. */
  appendAttendance(records: readonly AttendanceRecord[]): Promise<void>;
  appendBehavior(point: BehaviorPoint): Promise<void>;

  /** Commit a whole roll call: its Attendance Records, its Session, and the
      Summary tab, in the order that fails safely. Writing the same roll call
      twice changes nothing, so a retry after a failure — or after a reload —
      cannot double-count a Student. */
  saveRollCall(rollCall: RollCall, summaries: readonly StudentSummary[]): Promise<void>;

  /** Rewrite the Summary tab. Every value is derived, so writing the same
      summaries twice changes nothing. */
  saveStudentSummaries(summaries: readonly StudentSummary[]): Promise<void>;

  /** Resolve a held point later. Throws if no such record exists. */
  setPointState(sessionId: string, studentId: string, state: PointState): Promise<void>;
}
