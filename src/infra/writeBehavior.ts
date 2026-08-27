/**
 * Writing a Behavior Point to the Sheet.
 *
 * Two tabs again, and the Sheets API still cannot write both at once, so the
 * order is chosen to fail safely. The point goes first: it is what the teacher
 * awarded, and a Summary rewritten from a point that never landed would claim a
 * Score the Points Ledger cannot back. The Summary follows immediately — a
 * Score lagging behind the Behavior tab reads as the app losing a point.
 *
 * A retry writes only what is still missing. Whether the point already landed
 * is read back from the Sheet by its id rather than remembered, so tapping Save
 * again after a failure awards one point, not two.
 */
import type { BehaviorPoint } from '../domain/behavior';
import type { StudentSummary } from '../domain/studentSummary';

/** What writing a Behavior Point needs of the Sheet: the read that says whether
    it already landed, and the two writes. Not part of the port — these are the
    adapters' own parts, shared so the ordering is written once. */
export interface BehaviorWrites {
  listBehavior(): Promise<BehaviorPoint[]>;
  appendBehavior(point: BehaviorPoint): Promise<void>;
  saveStudentSummaries(summaries: readonly StudentSummary[]): Promise<void>;
}

export async function writeBehavior(
  sheet: BehaviorWrites,
  point: BehaviorPoint,
  summaries: readonly StudentSummary[],
): Promise<void> {
  const awarded = await sheet.listBehavior();
  if (!awarded.some((existing) => existing.id === point.id)) {
    await sheet.appendBehavior(point);
  }

  await sheet.saveStudentSummaries(summaries);
}
