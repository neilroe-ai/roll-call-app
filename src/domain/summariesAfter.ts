/**
 * The Summary tab as it will read once an action lands.
 *
 * Every write to the Sheet changes a Score, and the Summary tab has to go with
 * it in the same write (ADR 0008). So each write needs the summaries worked out
 * from the Points Ledger the action is about to create, not from the Ledger the
 * Sheet holds now — a Summary written from what the Sheet says would report the
 * class as it stood before the teacher tapped Save.
 *
 * One module does that projection for all four actions, so the rule "apply the
 * action, then summarize" is written once. It lives here rather than beside the
 * writes because it is Ledger arithmetic and nothing else: no I/O, no ordering,
 * no knowledge of tabs.
 *
 * The date a Note is filed under comes from the action itself — the Session was
 * taken at a time, a Behavior Point belongs to a date — so nothing here needs a
 * clock. Only a Note written outside a roll call has no action to take a date
 * from, and it is given one.
 */
import { calendarDateOf, type BehaviorPoint, type CalendarDate } from './behavior';
import { behaviorText } from './notesLog';
import type { PointState } from './points';
import { recordsToSave, type RollCall } from './rollCall';
import type { PointsLedger } from './score';
import type { Snapshot } from './snapshot';
import { summarize, type StudentSummary } from './studentSummary';

/**
 * The summaries once this roll call is in.
 *
 * The Session being saved is not in `snapshot.sessions` yet, but it has just
 * happened: leaving it out would rate every Student against one Session fewer
 * than they were actually at.
 *
 * The Notes are dated to the Session rather than to the save. A roll taken at
 * the end of one day and saved at the start of the next belongs to the lesson,
 * not to the moment the network came back.
 */
export function afterRollCall(snapshot: Snapshot, rollCall: RollCall): StudentSummary[] {
  const ledger: PointsLedger = {
    attendance: [...snapshot.ledger.attendance, ...recordsToSave(rollCall)],
    behavior: snapshot.ledger.behavior,
  };
  const sessions = [...snapshot.sessions, rollCall.session];
  return summarize(
    { ...snapshot, ledger, sessions },
    { on: calendarDateOf(new Date(rollCall.session.takenAt)), byStudent: rollCall.notes },
  );
}

/** The summaries once this Behavior Point is in. The point counts the moment it
    lands, so the Score moves with it, and the reason the teacher gave goes into
    the Student's Notes Log under the point's own date. */
export function afterBehaviorPoint(snapshot: Snapshot, point: BehaviorPoint): StudentSummary[] {
  const ledger: PointsLedger = {
    attendance: snapshot.ledger.attendance,
    behavior: [...snapshot.ledger.behavior, point],
  };
  return summarize(
    { ...snapshot, ledger },
    {
      on: point.date,
      byStudent: new Map([[point.studentId, behaviorText(point.kind, point.note)]]),
    },
  );
}

/** The summaries once this Held Point is settled. Only the one Attendance
    Record's Point State moves, and no Note is written: the teacher's decision
    is the whole action. */
export function afterResolvedHeldPoint(
  snapshot: Snapshot,
  sessionId: string,
  studentId: string,
  state: PointState,
): StudentSummary[] {
  const ledger: PointsLedger = {
    attendance: snapshot.ledger.attendance.map((record) =>
      record.sessionId === sessionId && record.studentId === studentId
        ? { ...record, pointState: state }
        : record,
    ),
    behavior: snapshot.ledger.behavior,
  };
  return summarize({ ...snapshot, ledger });
}

/** The summaries once this Note is in. No point changes hands, so the Ledger is
    untouched and only the Student's Notes Log grows. The date is given, because
    a Note written outside a roll call has no action to take one from. */
export function afterNote(
  snapshot: Snapshot,
  studentId: string,
  text: string,
  on: CalendarDate,
): StudentSummary[] {
  return summarize(snapshot, { on, byStudent: new Map([[studentId, text]]) });
}
