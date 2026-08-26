/**
 * The teacher's own corrections to a Student's figures.
 *
 * A teacher arrives with points already given on paper, and sometimes needs to
 * correct a figure the app worked out. Both are the same thing: a number she
 * writes in the Students tab that is added to what the Ledger says.
 *
 * An Adjustment is an input, not a total. It is stored where she typed it and
 * never rewritten, so the Score stays derived — Ledger plus Adjustment — and
 * she can always see, and undo, the part she supplied.
 */
import { emptyCounts, type AttendanceCounts } from './points';

export interface Adjustment {
  /** Added to the Score. Negative takes points away. */
  points: number;
  /** Added to each Attendance Count. */
  counts: AttendanceCounts;
}

/** The Adjustment of a Student who has none: changes nothing. */
export function noAdjustment(): Adjustment {
  return { points: 0, counts: emptyCounts() };
}

/** One Student's Adjustment, or an empty one when they have not been given a
    figure. Callers always get a whole Adjustment, never undefined. */
export function adjustmentFor(
  studentId: string,
  adjustments: ReadonlyMap<string, Adjustment>,
): Adjustment {
  return adjustments.get(studentId) ?? noAdjustment();
}
