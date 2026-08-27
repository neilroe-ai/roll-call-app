/**
 * Resolving a Held Point on the Sheet.
 *
 * Two tabs, and the same rule as the other writes: the Point State goes first,
 * the Summary follows. The state is what the teacher decided, and a Summary
 * rewritten from a decision that never landed would claim a Score the Points
 * Ledger cannot back. A failure between the two costs a stale report and
 * nothing else, because every figure on the Summary tab is worked out from the
 * Ledger.
 *
 * Nothing here needs a read-back guard. Setting a Point State overwrites one
 * cell rather than appending a row, so writing it twice leaves the same Sheet
 * as writing it once.
 */
import type { PointState } from '../domain/points';
import type { StudentSummary } from '../domain/studentSummary';

/** What resolving a Held Point needs of the Sheet. Not part of the port — these
    are the adapters' own parts, shared so the ordering is written once. */
export interface HeldPointWrites {
  setPointState(sessionId: string, studentId: string, state: PointState): Promise<void>;
  saveStudentSummaries(summaries: readonly StudentSummary[]): Promise<void>;
}

export async function writeHeldPoint(
  sheet: HeldPointWrites,
  sessionId: string,
  studentId: string,
  state: PointState,
  summaries: readonly StudentSummary[],
): Promise<void> {
  await sheet.setPointState(sessionId, studentId, state);
  await sheet.saveStudentSummaries(summaries);
}
