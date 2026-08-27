/**
 * Committing a roll call to the Sheet.
 *
 * The Sheets API cannot write two tabs atomically, so the order is chosen to
 * fail safely instead. Attendance Records go first — one API call, so they all
 * land or none do — and the Session row last. A failure between the two leaves
 * Records whose Session row is missing: they still score correctly, and the
 * teacher can retry. Writing the Session first would risk the opposite, a
 * Session that claims a roll was taken while its points are lost.
 *
 * The Summary tab goes last, and is worked out here from the Snapshot the roll
 * call was taken against rather than handed in by the caller: the figures come
 * from the Points Ledger this write is creating, so one write leaves the report
 * correct. A failure at that last step costs a stale report and nothing else.
 *
 * A retry writes only what is still missing, and what is missing is read back
 * from the Sheet rather than remembered. A teacher who loses signal mid-save,
 * reloads the page and taps Save again is the case that matters, and nothing
 * held in memory survives that.
 */
import { recordsToSave, type RollCall } from '../domain/rollCall';
import { afterRollCall } from '../domain/summariesAfter';
import type { Snapshot } from '../domain/snapshot';
import type { StudentSummary } from '../domain/studentSummary';
import type { AttendanceRecord, Session } from '../domain/session';

/** What committing a roll call needs of the Sheet: the two reads that say what
    already landed, and the three writes. Not part of the port — these are the
    adapters' own parts, shared so the ordering is written once. */
export interface RollCallWrites {
  listAttendance(): Promise<AttendanceRecord[]>;
  listSessions(): Promise<Session[]>;
  appendAttendance(records: readonly AttendanceRecord[]): Promise<void>;
  appendSession(session: Session): Promise<void>;
  saveStudentSummaries(summaries: readonly StudentSummary[]): Promise<void>;
}

export async function writeRollCall(
  sheet: RollCallWrites,
  rollCall: RollCall,
  snapshot: Snapshot,
): Promise<void> {
  const sessionId = rollCall.session.id;

  const attendance = await sheet.listAttendance();
  if (!attendance.some((record) => record.sessionId === sessionId)) {
    await sheet.appendAttendance(recordsToSave(rollCall));
  }

  const sessions = await sheet.listSessions();
  if (!sessions.some((session) => session.id === sessionId)) {
    await sheet.appendSession(rollCall.session);
  }

  await sheet.saveStudentSummaries(afterRollCall(snapshot, rollCall));
}
