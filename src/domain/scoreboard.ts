/**
 * The Scoreboard: every Student's name and Score, highest first.
 *
 * Shown to the class, so it carries only names and totals — never a Note, an
 * Attendance Status or a Point State.
 */
import type { Student } from './group';
import { scoreFor, type PointsLedger } from './score';

export interface ScoreboardEntry {
  studentId: string;
  name: string;
  score: number;
}

/** Highest Score first; Students on the same Score keep alphabetical order, so
    the list does not reshuffle at random when a point moves. */
export function scoreboard(students: Student[], ledger: PointsLedger): ScoreboardEntry[] {
  return students
    .map((student) => ({
      studentId: student.id,
      name: student.name,
      score: scoreFor(student.id, ledger),
    }))
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name));
}
