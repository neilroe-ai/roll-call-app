/**
 * The Scoreboard: every Student's name and Score, highest first.
 *
 * Shown to the class, so it carries only names and totals — never a Note, an
 * Attendance Status or a Point State.
 */
import { adjustmentFor } from './adjustment';
import { scoreFor } from './score';
import type { Snapshot } from './snapshot';

export interface ScoreboardEntry {
  studentId: string;
  name: string;
  score: number;
}

/** Highest Score first; Students on the same Score keep alphabetical order, so
    the list does not reshuffle at random when a point moves.

    Adjustments count here exactly as they do everywhere else: a Score the class
    sees that disagreed with the Score on the Summary tab would be read as the
    app losing points. */
export function scoreboard(snapshot: Snapshot): ScoreboardEntry[] {
  return snapshot.students
    .map((student) => ({
      studentId: student.id,
      name: student.name,
      score: scoreFor(student.id, snapshot.ledger, adjustmentFor(student.id, snapshot.adjustments)),
    }))
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name));
}
