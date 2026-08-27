/**
 * The port to the Google Sheet that backs the app.
 *
 * Speaks in domain records, not rows: the row shape is an infra detail owned by
 * `rows.ts`. Every method can fail — no network, expired token, a tab the
 * teacher renamed — so callers must handle rejection. Per ADR 0002 a failed
 * write must never block taking roll.
 *
 * One read and three writes. Each write leaves the Sheet whole: it commits
 * everything the action touches, in the order that fails safely, so a caller
 * never has to sequence two calls to keep the Sheet consistent. Every write is
 * safe to repeat.
 */
import type { BehaviorPoint } from '../domain/behavior';
import type { PointState } from '../domain/points';
import type { RollCall } from '../domain/rollCall';
import type { Snapshot } from '../domain/snapshot';
import type { StudentSummary } from '../domain/studentSummary';

export interface SheetGateway {
  /** Everything the Sheet holds, in one go. Gives every Student a row in the
      Groups Grid first, so the teacher always has someone to tick. */
  read(): Promise<Snapshot>;

  /** Commit a whole roll call: its Attendance Records, its Session, and the
      Summary tab, in the order that fails safely. Writing the same roll call
      twice changes nothing, so a retry after a failure — or after a reload —
      cannot double-count a Student. */
  saveRollCall(rollCall: RollCall, summaries: readonly StudentSummary[]): Promise<void>;

  /** Write a Behavior Point and the Summary it changes. The point counts the
      moment it lands, so the Summary follows it immediately: a Score lagging
      behind the Behavior tab would be read as the app losing a point. */
  saveBehavior(point: BehaviorPoint, summaries: readonly StudentSummary[]): Promise<void>;

  /** Rewrite the Summary tab, which the app owns whole. Afterwards it shows
      exactly these summaries and nothing else — an empty list clears it. */
  saveStudentSummaries(summaries: readonly StudentSummary[]): Promise<void>;

  /** Settle a Held Point once the teacher knows whether the documentation
      arrived: the Attendance Record's Point State and the Summary it changes.
      The Score moves the moment the state lands, so the Summary follows it.
      Throws if no such record exists. */
  resolveHeldPoint(
    sessionId: string,
    studentId: string,
    state: PointState,
    summaries: readonly StudentSummary[],
  ): Promise<void>;
}
