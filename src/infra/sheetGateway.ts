/**
 * The port to the Google Sheet that backs the app.
 *
 * Speaks in domain records, not rows: the row shape is an infra detail owned by
 * `rows.ts`. Every method can fail — no network, expired token, a tab the
 * teacher renamed — so callers must handle rejection. Per ADR 0002 a failed
 * write must never block taking roll.
 *
 * One read and four writes, one per action the teacher can take. Each write
 * leaves the Sheet whole: it commits everything the action touches, in the order
 * that fails safely, so a caller never has to sequence two calls to keep the
 * Sheet consistent. Every write is safe to repeat.
 *
 * A write takes the action and the Snapshot it was decided against — never the
 * Summary rows it should produce. Working out what an action does to a Score is
 * the Sheet's own business (ADR 0011), so a caller passes only what it already
 * holds.
 */
import type { BehaviorPoint, CalendarDate } from '../domain/behavior';
import type { PointState } from '../domain/points';
import type { RollCall } from '../domain/rollCall';
import type { Snapshot } from '../domain/snapshot';

export interface SheetGateway {
  /** Everything the Sheet holds, in one go. Gives every Student a row in the
      Groups Grid first, so the teacher always has someone to tick. */
  read(): Promise<Snapshot>;

  /** Commit a whole roll call: its Attendance Records, its Session, and the
      Summary tab, in the order that fails safely. Writing the same roll call
      twice changes nothing, so a retry after a failure — or after a reload —
      cannot double-count a Student. */
  saveRollCall(rollCall: RollCall, snapshot: Snapshot): Promise<void>;

  /** Write a Behavior Point and the Summary it changes. The point counts the
      moment it lands, so the Summary follows it immediately: a Score lagging
      behind the Behavior tab would be read as the app losing a point. */
  saveBehavior(point: BehaviorPoint, snapshot: Snapshot): Promise<void>;

  /** Settle a Held Point once the teacher knows whether the documentation
      arrived: the Attendance Record's Point State and the Summary it changes.
      The Score moves the moment the state lands, so the Summary follows it.
      Throws if no such record exists. */
  resolveHeldPoint(
    sessionId: string,
    studentId: string,
    state: PointState,
    snapshot: Snapshot,
  ): Promise<void>;

  /** Where the Sheet the app is writing to can be opened, or null before it
      knows. Shown to the teacher: when the app and the spreadsheet she is
      typing into are not the same file, nothing else on screen says so. */
  sheetLink(): string | null;

  /** Write a Note about a Student outside any roll call. It lands in that
      Student's Notes Log, dated `on`. No Score changes. */
  saveNote(studentId: string, text: string, on: CalendarDate, snapshot: Snapshot): Promise<void>;
}
